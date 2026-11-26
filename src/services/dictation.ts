import type { Socket } from 'socket.io-client';
import workletUrl from './dictation-worklet.js?url&no-inline';
import { encodeLinearPcm, speechFetch } from './aiSpeech';

export type DictationPhase =
  | 'starting'
  | 'recording'
  | 'finishing'
  | 'polishing';

export type DictationFailure = { message: string; text: string };

type DictationUpdate = { id: string } & (
  | { type: 'ready' | 'done' }
  | { type: 'partial' | 'final'; segmentId: number; text: string }
  | { type: 'error'; error: string }
);

type Reply = { ok: true } | { ok: false; error: string };
type DictationSocket = Pick<
  Socket,
  'connected' | 'on' | 'off' | 'emit' | 'timeout'
>;
type DictationMode = 'quick' | 'advanced';

const MAX_RECORDING_MS = 115_000;
const UNAVAILABLE =
  'Распознавание речи временно недоступно. Попробуйте ещё раз.';
const CONNECTION_LOST = 'Связь с Чатом прервалась во время диктовки.';

class Transcript {
  private readonly segments = new Map<
    number,
    { text: string; final: boolean }
  >();

  update(segmentId: number, text: string, final: boolean): void {
    if (this.segments.get(segmentId)?.final) return;

    this.segments.set(segmentId, { text: text.trim(), final });
  }

  text(): string {
    return [...this.segments]
      .sort(([left], [right]) => left - right)
      .map(([, segment]) => segment.text)
      .filter(Boolean)
      .join(' ');
  }
}

interface DictationCallbacks {
  phase: (phase: DictationPhase) => void;
  complete: (text: string, error?: string) => void;
}

export class Dictation {
  private readonly id = crypto.randomUUID();
  private readonly transcript = new Transcript();
  private readonly abort = new AbortController();
  private readonly pendingChunks = new Set<Promise<void>>();
  private context?: AudioContext;
  private stream?: MediaStream;
  private worklet?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private silentOutput?: GainNode;
  private phase: DictationPhase = 'starting';
  private timer?: ReturnType<typeof setTimeout>;
  private flushed?: () => void;
  private ready = false;
  private requested = false;

  constructor(
    private readonly socket: DictationSocket,
    private readonly model: DictationMode,
    private readonly callbacks: DictationCallbacks
  ) {}

  async start(): Promise<void> {
    try {
      if (!this.socket.connected) {
        this.interrupt(CONNECTION_LOST);
        return;
      }
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof AudioContext === 'undefined'
      ) {
        this.interrupt('Диктовка недоступна в этом приложении.');
        return;
      }

      this.socket.on('disconnect', this.onDisconnect);
      this.context = new AudioContext();
      // Браузер запрашивает разрешение сразу по нажатию, до открытия серверной сессии.
      const permission = navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      void this.context.resume().catch(() => this.interrupt());
      const stream = await permission;
      if (this.abort.signal.aborted) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      this.stream = stream;
      if (!this.socket.connected) {
        this.interrupt(CONNECTION_LOST);
        return;
      }

      this.socket.on('dictationUpdate', this.onUpdate);
      this.timer = setTimeout(() => this.interrupt(), 22_000);
      this.requested = true;
      const response: Reply | undefined = await this.socket
        .timeout(12_000)
        .emitWithAck('dictationStart', this.id)
        .catch((): undefined => {
          this.interrupt(
            this.socket.connected
              ? 'Сервер Чата не ответил на запрос диктовки.'
              : CONNECTION_LOST
          );

          return undefined;
        });
      if (!response) return;
      if (this.abort.signal.aborted) {
        if (response.ok && this.socket.connected)
          this.socket.emit('dictationCancel', this.id);
        return;
      }

      if (response.ok === false) this.interrupt(response.error);
    } catch (error) {
      switch (error instanceof DOMException ? error.name : '') {
        case 'NotAllowedError':
          this.interrupt('Разрешите доступ к микрофону для диктовки.');
          break;
        case 'NotFoundError':
        case 'NotReadableError':
          this.interrupt('Микрофон недоступен. Проверьте, что он подключён.');
          break;
        default:
          this.interrupt();
      }
    }
  }

  async finish(): Promise<void> {
    if (this.phase !== 'recording' || this.abort.signal.aborted) return;

    this.setPhase('finishing');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.interrupt(), 30_000);
    await new Promise<void>(resolve => {
      this.flushed = resolve;
      this.worklet?.port.postMessage('finish');
    });
    this.releaseMicrophone();
    await Promise.all(this.pendingChunks);
    if (!this.abort.signal.aborted)
      this.socket.emit('dictationFinish', this.id);
  }

  cancel(): void {
    if (this.abort.signal.aborted) return;

    this.dispose();
    if (this.requested && this.socket.connected)
      this.socket.emit('dictationCancel', this.id);
  }

  /** При обрыве оставляет только уже распознанный текст. */
  interrupt(message = UNAVAILABLE): void {
    if (this.abort.signal.aborted) return;

    const recognized = this.transcript.text();
    this.cancel();
    this.callbacks.complete(recognized, message);
  }

  private readonly onDisconnect = (): void => this.interrupt(CONNECTION_LOST);

  private readonly onUpdate = (update: DictationUpdate): void => {
    if (update.id !== this.id || this.abort.signal.aborted) return;

    switch (update.type) {
      case 'ready':
        if (this.ready) return;
        this.ready = true;
        void this.captureMicrophone();
        break;
      case 'partial':
      case 'final':
        this.transcript.update(
          update.segmentId,
          update.text,
          update.type === 'final'
        );
        break;
      case 'done':
        if (this.phase !== 'polishing') void this.complete();
        break;
      case 'error':
        this.interrupt(update.error);
        break;
    }
  };

  private async captureMicrophone(): Promise<void> {
    const context = this.context;
    const stream = this.stream;
    if (!context || !stream) return;

    const readyAt = performance.now();
    try {
      await context.audioWorklet.addModule(workletUrl);
      await context.resume();
      if (this.abort.signal.aborted) return;

      const worklet = new AudioWorkletNode(context, 'chat-dictation', {
        channelCount: 1,
        channelCountMode: 'explicit',
        numberOfOutputs: 1,
        outputChannelCount: [1]
      });
      this.worklet = worklet;
      worklet.port.onmessage = this.onAudio;
      worklet.onprocessorerror = () => this.interrupt();
      this.source = context.createMediaStreamSource(stream);
      this.silentOutput = context.createGain();
      this.silentOutput.gain.value = 0;
      this.source.connect(worklet);
      worklet.connect(this.silentOutput).connect(context.destination);
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => void this.finish(),
        MAX_RECORDING_MS - (performance.now() - readyAt)
      );
      this.setPhase('recording');
    } catch {
      this.interrupt();
    }
  }

  private readonly onAudio = (
    event: MessageEvent<Float32Array | null>
  ): void => {
    const context = this.context;
    const samples = event.data;
    if (!samples) {
      this.flushed?.();
      return;
    }
    if (!context || this.abort.signal.aborted) return;

    if (!this.socket.connected) {
      this.interrupt(CONNECTION_LOST);
      return;
    }
    if (this.pendingChunks.size >= 20) {
      this.interrupt();
      return;
    }

    const pcm = encodeLinearPcm([samples], samples.length, context.sampleRate);
    if (!pcm.byteLength) return;

    const sent = this.sendChunk(pcm);
    this.pendingChunks.add(sent);
    void sent.finally(() => this.pendingChunks.delete(sent));
  };

  private async sendChunk(pcm: ArrayBuffer): Promise<void> {
    try {
      const reply: Reply = await this.socket
        .timeout(4_000)
        .emitWithAck('dictationChunk', { id: this.id, pcm });
      if (reply.ok === false) this.interrupt(reply.error);
    } catch {
      this.interrupt();
    }
  }

  private async complete(): Promise<void> {
    const recognized = this.transcript.text();
    if (!recognized) {
      this.dispose();
      this.callbacks.complete(
        '',
        'Речь не удалось распознать. Попробуйте ещё раз.'
      );
      return;
    }

    clearTimeout(this.timer);
    this.releaseMicrophone();
    this.socket.off('disconnect', this.onDisconnect);
    this.setPhase('polishing');

    let text = recognized;
    let error: string | undefined;
    try {
      const response = await speechFetch('/speech/dictation-polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: recognized, responseMode: this.model }),
        signal: AbortSignal.any([
          this.abort.signal,
          AbortSignal.timeout(10_000)
        ])
      });
      const polished: { text?: unknown } = await response.json();
      if (typeof polished.text !== 'string' || !polished.text.trim())
        throw new Error('Нет результата вычитки');

      text = polished.text.trim();
    } catch {
      error = 'Не удалось вычитать текст. Распознанный вариант сохранён.';
    }
    if (this.abort.signal.aborted) return;

    this.dispose();
    this.callbacks.complete(text, error);
  }

  private setPhase(phase: DictationPhase): void {
    this.phase = phase;
    this.callbacks.phase(phase);
  }

  private releaseMicrophone(): void {
    this.flushed?.();
    this.flushed = undefined;
    this.source?.disconnect();
    this.source = undefined;
    this.silentOutput?.disconnect();
    this.silentOutput = undefined;
    if (this.worklet) {
      this.worklet.port.close();
      this.worklet.disconnect();
      this.worklet = undefined;
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
    if (this.context) {
      void this.context.close().catch(() => undefined);
      this.context = undefined;
    }
  }

  private dispose(): void {
    this.abort.abort();
    clearTimeout(this.timer);
    this.releaseMicrophone();
    this.socket.off('disconnect', this.onDisconnect);
    this.socket.off('dictationUpdate', this.onUpdate);
  }
}
