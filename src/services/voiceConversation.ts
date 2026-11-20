import {
  startStreamingRecognition,
  type StreamingRecognition
} from './voiceRecognition';
import {
  createVoiceSpeechQueue,
  type VoiceSpeechQueue
} from './voiceSpeechQueue';
import { openVoiceMicrophone, type VoiceMicrophone } from './voiceMicrophone';
import type { VoiceReplyOptions } from './voiceReply';
import { isVoiceFarewell, VOICE_FAREWELL_REPLY } from './voice-farewell';

export type VoiceConversationState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

interface ConversationDependencies {
  send: (text: string, options: VoiceReplyOptions) => Promise<string | null>;
  state: (state: VoiceConversationState, text?: string) => void;
  error: (error: unknown) => void;
  notice?: (text: string) => void;
  isBusy?: () => boolean;
  ended?: () => void;
  recognize?: typeof startStreamingRecognition;
  microphone?: typeof openVoiceMicrophone;
  speech?: typeof createVoiceSpeechQueue;
}

/** Сериализует команды: прерывание звука никогда не повторяет и не отменяет действие СЭП. */
export class VoiceConversation {
  private microphone: VoiceMicrophone | undefined;
  private capture: StreamingRecognition | undefined;
  private controlRecognition: StreamingRecognition | undefined;
  private readonly recognitions = new Set<StreamingRecognition>();
  private readonly tentativeRecognitions = new Set<StreamingRecognition>();
  private readonly acceptedRecognitions = new Set<StreamingRecognition>();
  private output: VoiceSpeechQueue | undefined;
  private farewellOutput: VoiceSpeechQueue | undefined;
  private pending: Promise<void> = Promise.resolve();
  private queued = 0;
  private stopped = false;
  private closing = false;
  private muted = false;
  private busy = false;
  private speechEpoch = 0;
  private capacityReported = false;

  constructor(private readonly dependencies: ConversationDependencies) {}

  async start(): Promise<void> {
    const microphone = await (
      this.dependencies.microphone ?? openVoiceMicrophone
    )({
      start: (): void => this.startUtterance(),
      audio: (audio): void => this.capture?.append(audio),
      end: (): void => {
        this.capture?.finish();
        this.capture = undefined;
        this.present();
      },
      overflow: (): void => {
        this.capture?.cancel();
        this.capture = undefined;
        this.report(
          new Error(
            'Реплика длиннее 24 секунд. Скажите её короче: команда не отправлена.'
          )
        );
      }
    });
    if (this.stopped || this.closing) microphone.stop();
    else {
      this.microphone = microphone;
      microphone.mute(this.muted);
      this.present();
    }
  }

  mute(value: boolean): void {
    this.muted = value;
    this.microphone?.mute(value);
    if (value) {
      this.capture?.cancel();
      this.capture = undefined;
    }
    this.present();
  }

  stop(): void {
    this.stopped = true;
    this.stopInput();
    this.output?.stop();
    this.farewellOutput?.stop();
    this.speechEpoch++;
    this.dependencies.notice?.('');
  }

  private stopInput(): void {
    this.microphone?.stop();
    this.microphone = undefined;
    this.recognitions.forEach(recognition => recognition.cancel());
    this.recognitions.clear();
    this.tentativeRecognitions.clear();
    this.acceptedRecognitions.clear();
    this.capture = undefined;
    this.controlRecognition = undefined;
  }

  /** Подтверждение кнопкой и его результат используют ту же прерываемую озвучку. */
  respond(
    action: (options: VoiceReplyOptions) => Promise<string | null>
  ): Promise<void> {
    if (this.stopped || this.closing) return Promise.resolve();
    this.output?.stop();
    this.speechEpoch++;
    this.queued++;
    this.pending = this.pending.then(async (): Promise<void> => {
      try {
        if (!this.stopped && !this.closing) await this.speakReply(action);
      } catch (error) {
        this.output?.stop();
        this.report(error);
      } finally {
        this.release();
        this.busy = false;
        this.present();
      }
    });

    return this.pending;
  }

  private release(): void {
    this.queued--;
    if (!this.queued) this.capacityReported = false;
  }

  private async finishConversation(): Promise<void> {
    if (this.stopped || this.closing) return;
    this.closing = true;
    this.stopInput();
    this.output?.stop();
    this.speechEpoch++;
    this.dependencies.state('thinking');
    // Прощание не ждёт завершения уже отправленного бизнес-запроса и
    // не превращается в новую команду модели. Его результат останется в чате.
    const timeout = setTimeout((): void => this.farewellOutput?.stop(), 10_000);

    try {
      this.farewellOutput = (
        this.dependencies.speech ?? createVoiceSpeechQueue
      )(
        (text): void => {
          if (!this.stopped) this.dependencies.state('speaking', text);
        },
        (error): void => this.report(error)
      );
      this.farewellOutput.finish(VOICE_FAREWELL_REPLY);
      await this.farewellOutput.done;
    } catch (error) {
      this.report(error);
    } finally {
      clearTimeout(timeout);
      if (!this.stopped) {
        this.stop();
        this.dependencies.ended?.();
      }
    }
  }

  private async speakReply(
    action: (options: VoiceReplyOptions) => Promise<string | null>
  ): Promise<void> {
    this.busy = true;
    this.present();
    const epoch = this.speechEpoch;
    const createSpeech = (): VoiceSpeechQueue => {
      const speech = (this.dependencies.speech ?? createVoiceSpeechQueue)(
        (text): void => {
          if (!this.stopped && !this.closing && !this.capture)
            this.dependencies.state('speaking', text);
        },
        (error): void => this.report(error)
      );
      if (
        this.stopped ||
        this.closing ||
        this.speechEpoch !== epoch ||
        this.acceptedRecognitions.size > 0
      )
        speech.stop();
      else if (this.tentativeRecognitions.size) speech.pause();

      return speech;
    };
    let speech = createSpeech();
    this.output = speech;
    const finalText = await action({
      interactionMode: 'voice',
      onText: (text): void => speech.append(text),
      onReset: (): void => {
        speech.stop();
        speech = createSpeech();
        this.output = speech;
      }
    });
    // Пустой ответ допустим при передаче управления карточке. Ошибки
    // запроса уже показаны самим чатом, второй общий отказ не нужен.
    speech.finish(finalText);
    await speech.done;
  }

  private startUtterance(): void {
    if (this.stopped || this.closing || this.muted) return;
    if (!this.queued) this.dependencies.notice?.('');
    this.capture?.cancel();
    const atCapacity = this.queued >= 3;
    // Одно место оставляем для команды завершения даже при заполненной очереди.
    if (atCapacity && this.controlRecognition) return;
    const recognition = (
      this.dependencies.recognize ?? startStreamingRecognition
    )();
    this.capture = recognition;
    this.recognitions.add(recognition);
    this.tentativeRecognitions.add(recognition);
    this.output?.pause();
    if (atCapacity) this.controlRecognition = recognition;
    else this.queued++;
    // Подписываемся сразу, чтобы отмена не оставила необработанный rejected Promise.
    const transcript = recognition.result.then(
      text => ({ text }),
      error => ({ error })
    );
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      this.recognitions.delete(recognition);
      this.acceptedRecognitions.delete(recognition);
      if (this.controlRecognition === recognition)
        this.controlRecognition = undefined;
      if (!atCapacity) this.release();
    };
    // Шум и отменённые записи освобождают очередь сразу, даже если СЭП
    // ещё выполняет предыдущую команду.
    void transcript.then(result => {
      this.tentativeRecognitions.delete(recognition);
      if ('error' in result || !result.text.trim()) {
        release();
        if (
          atCapacity &&
          'error' in result &&
          !(
            result.error instanceof DOMException &&
            result.error.name === 'AbortError'
          )
        )
          this.report(result.error);
      } else if (isVoiceFarewell(result.text)) {
        release();
        void this.finishConversation();
      } else if (atCapacity) {
        release();
        if (!this.stopped && !this.closing && !this.capacityReported) {
          this.capacityReported = true;
          this.dependencies.notice?.(
            'Последняя фраза не отправлена. Повторите её после ответа.'
          );
        }
      } else if (!this.stopped && !this.closing) {
        // Только завершённое распознавание заменяет ответ. Шум не теряет его.
        this.acceptedRecognitions.add(recognition);
        this.output?.stop();
        this.speechEpoch++;
      }
      if (!this.stopped && !this.closing && !this.tentativeRecognitions.size)
        this.output?.resume();
    });
    if (atCapacity) {
      this.dependencies.state('listening');
      return;
    }
    this.pending = this.pending.then(async (): Promise<void> => {
      try {
        const result = await transcript;
        this.recognitions.delete(recognition);
        this.acceptedRecognitions.delete(recognition);
        if (this.stopped || this.closing) return;
        if ('error' in result) {
          if (
            !(
              result.error instanceof DOMException &&
              result.error.name === 'AbortError'
            )
          )
            this.report(result.error);
          return;
        }
        if (!result.text.trim()) return;
        // Ожидание обычного текстового запроса не является ошибкой голоса.
        // Выход из разговора отменяет только ещё не отправленную реплику.
        while (this.dependencies.isBusy?.() && !this.stopped && !this.closing) {
          this.dependencies.state('thinking');
          await new Promise<void>(resolve => setTimeout(resolve, 100));
        }
        if (this.stopped || this.closing) return;
        await this.speakReply(options =>
          this.dependencies.send(result.text, options)
        );
      } catch (error) {
        this.output?.stop();
        this.report(error);
      } finally {
        release();
        this.busy = false;
        this.present();
      }
    });
    this.dependencies.state('listening');
  }

  private present(): void {
    if (this.stopped || this.closing) return;
    this.dependencies.state(
      this.capture
        ? 'listening'
        : this.busy || this.recognitions.size
          ? 'thinking'
          : this.muted
            ? 'idle'
            : 'listening'
    );
  }

  private report(error: unknown): void {
    if (this.stopped) return;
    this.dependencies.error(error);
  }
}
