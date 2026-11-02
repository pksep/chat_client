import {
  prepareTextForSpeech,
  startVoicePlayback,
  synthesizeVoice,
  type VoicePlaybackSession
} from './aiSpeech';

interface SpeechQueueDependencies {
  synthesize: typeof synthesizeVoice;
  play: typeof startVoicePlayback;
  speaking: (text: string) => void;
  error: (error: unknown) => void;
}

/** Озвучивает законченные предложения, готовя следующий фрагмент во время воспроизведения. */
export class VoiceSpeechQueue {
  private readonly controller = new AbortController();
  private readonly pending: string[] = [];
  private playback: VoicePlaybackSession | undefined;
  private text = '';
  private remainder = '';
  private running = false;
  private ended = false;
  private stopped = false;
  private paused = false;
  private currentText = '';
  private resumeSignal: Promise<void> | undefined;
  private releasePause: (() => void) | undefined;
  private resolveDone: () => void = (): void => {};
  readonly done = new Promise<void>(resolve => {
    this.resolveDone = resolve;
  });

  constructor(private readonly dependencies: SpeechQueueDependencies) {}

  append(delta: string): void {
    if (this.stopped || this.ended) return;
    this.text += delta;
    this.remainder += delta;
    // Не произносим незакрытый блок кода и не разрезаем его на предложения.
    if ((this.remainder.match(/```/g)?.length ?? 0) % 2) return;
    this.remainder = this.remainder.replace(
      /```[\s\S]*?```/g,
      ' Фрагмент кода. '
    );
    const boundary = /(?<=[.!?])\s+|\n+/gu;
    let start = 0;
    for (const match of this.remainder.matchAll(boundary)) {
      const sentence = this.remainder.slice(start, match.index);
      // Инициалы и сокращения остаются с соседними словами даже при
      // границе потокового фрагмента непосредственно после «Д. ».
      if (/(?:^|\s)(?:[А-ЯЁA-Z]|г|ул|им|руб|шт)\.$/u.test(sentence.trim()))
        continue;
      this.enqueue(sentence);
      start = match.index + match[0].length;
    }
    this.remainder = this.remainder.slice(start);
    void this.pump();
  }

  finish(finalText: string | null): void {
    if (this.stopped || this.ended) return;
    this.ended = true;
    if (!finalText) {
      this.stop();
      return;
    }
    if (!this.text) this.remainder = finalText;
    // Карточка подтверждения или ошибка может заменить промежуточный текст.
    else if (finalText.trim() !== this.text.trim()) {
      this.pending.length = 0;
      this.remainder = finalText;
    }
    this.enqueue(this.remainder);
    this.remainder = '';
    void this.pump();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.controller.abort();
    this.playback?.stop();
    this.pending.length = 0;
    this.releasePause?.();
    this.resolveDone();
  }

  /** Шум временно приостанавливает звук, сохраняя позицию и следующие предложения. */
  pause(): void {
    if (this.stopped || this.paused) return;
    this.paused = true;
    this.resumeSignal = new Promise<void>(resolve => {
      this.releasePause = resolve;
    });
    this.playback?.pause();
  }

  resume(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.releasePause?.();
    this.resumeSignal = undefined;
    this.releasePause = undefined;
    this.playback?.resume();
    if (this.playback) this.dependencies.speaking(this.currentText);
  }

  private async play(audio: Blob, text: string): Promise<void> {
    while (this.paused && !this.stopped) await this.resumeSignal;
    if (this.stopped) return;
    this.currentText = text;
    this.dependencies.speaking(text);
    this.playback = this.dependencies.play(audio);
    await this.playback.done;
    this.playback = undefined;
  }

  private enqueue(value: string): void {
    const text = prepareTextForSpeech(value);
    if (!text) return;
    // Ответ остаётся целиком в истории; голосовая очередь не растёт бесконечно.
    if (this.pending.length >= 24 || text.length > 2_000) {
      this.stop();
      this.dependencies.error(new Error('Длинный ответ доступен в переписке.'));
      return;
    }
    this.pending.push(text);
  }

  private async pump(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    try {
      while (this.pending.length && !this.stopped) {
        const text = this.pending.shift();
        if (!text) continue;
        const audio = await this.dependencies.synthesize(
          text,
          this.controller.signal
        );
        if (this.stopped) break;
        const playback = this.play(audio, text);
        // Одновременно с текущим звуком готовим максимум одно следующее предложение.
        const nextText = this.pending.shift();
        const nextAudio = nextText
          ? this.dependencies.synthesize(nextText, this.controller.signal).then(
              blob => ({ blob }),
              error => ({ error })
            )
          : undefined;
        await playback;
        if (this.stopped) break;
        if (nextText && nextAudio) {
          const next = await nextAudio;
          if (this.stopped) break;
          if ('error' in next) throw next.error;
          await this.play(next.blob, nextText);
        }
      }
    } catch (error) {
      if (!this.stopped) this.dependencies.error(error);
      this.stop();
    } finally {
      this.running = false;
      this.playback = undefined;
      if (this.ended && !this.pending.length) this.resolveDone();
    }
  }
}

export function createVoiceSpeechQueue(
  speaking: (text: string) => void,
  error: (error: unknown) => void
): VoiceSpeechQueue {
  return new VoiceSpeechQueue({
    synthesize: synthesizeVoice,
    play: startVoicePlayback,
    speaking,
    error
  });
}
