export interface VoiceActivityCallbacks {
  start: () => void;
  audio: (audio: ArrayBuffer) => void;
  end: () => void;
  overflow: () => void;
}

/** Небольшой предварительный буфер сохраняет начало слова до срабатывания детектора. */
export class VoiceActivity {
  private preRoll: ArrayBuffer[] = [];
  private voicedMs = 0;
  private silenceMs = 0;
  private durationMs = 0;
  private active = false;
  private blocked = false;

  constructor(private readonly callbacks: VoiceActivityCallbacks) {}

  push(audio: ArrayBuffer, level: number): void {
    const duration = audio.byteLength / 32;
    const voiced = level >= 0.022;
    this.silenceMs = voiced ? 0 : this.silenceMs + duration;

    if (this.blocked) {
      if (this.silenceMs >= 650) this.reset();
      return;
    }

    if (!this.active) {
      this.preRoll.push(audio);
      while (
        this.preRoll.length > 1 &&
        this.preRoll.reduce((size, chunk) => size + chunk.byteLength, 0) >
          10_240
      )
        this.preRoll.shift();
      this.voicedMs = voiced ? this.voicedMs + duration : 0;
      if (this.voicedMs < 120) return;
      this.active = true;
      this.durationMs = 0;
      this.callbacks.start();
      for (const chunk of this.preRoll) this.callbacks.audio(chunk);
      this.preRoll = [];
    } else {
      this.callbacks.audio(audio);
    }

    this.durationMs += duration;
    if (this.durationMs >= 24_000) {
      this.reset();
      this.blocked = true;
      this.callbacks.overflow();
    } else if (this.silenceMs >= 650) {
      this.reset();
      this.callbacks.end();
    }
  }

  reset(): void {
    this.preRoll = [];
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.durationMs = 0;
    this.active = false;
    this.blocked = false;
  }
}
