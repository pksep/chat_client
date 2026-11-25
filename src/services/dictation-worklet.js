class DictationWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate / 10));
    this.used = 0;
    this.active = true;
    this.port.onmessage = () => {
      this.active = false;
      this.flush();
      this.port.postMessage(null);
    };
  }

  /** @returns {void} */
  flush() {
    if (!this.used) return;

    const samples = this.samples.slice(0, this.used);
    this.port.postMessage(samples, [samples.buffer]);
    this.used = 0;
  }

  /** @returns {boolean} */
  process(inputs) {
    if (!this.active) return false;

    const channel = inputs[0]?.[0];
    if (channel) {
      for (const sample of channel) {
        this.samples[this.used++] = sample;
        if (this.used === this.samples.length) this.flush();
      }
    }

    return true;
  }
}

registerProcessor('chat-dictation', DictationWorklet);
