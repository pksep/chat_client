// Декодируем входящий поток, не воспроизводя тестовый тон в динамиках.
export const createAudioSignalProbe = (
  context: AudioContext,
  stream: MediaStream
) => {
  // Chromium запускает WebRTC playout через media element; одного Web Audio
  // недостаточно. Muted не мешает декодированию, которое проверяем анализатором.
  const playback = new Audio();
  playback.muted = true;
  playback.srcObject = stream;
  void playback.play().catch(() => undefined);
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const muted = context.createGain();
  muted.gain.value = 0;
  source.connect(analyser);
  analyser.connect(muted);
  muted.connect(context.destination);
  const samples = new Float32Array(analyser.fftSize);
  const frequencies = new Float32Array(analyser.frequencyBinCount);
  return {
    snapshot: () => {
      analyser.getFloatTimeDomainData(samples);
      analyser.getFloatFrequencyData(frequencies);
      let sum = 0;
      let strongest = 0;
      for (const sample of samples) sum += sample * sample;
      for (let index = 1; index < frequencies.length; index++)
        if (frequencies[index] > frequencies[strongest]) strongest = index;
      return {
        rms: Math.sqrt(sum / samples.length),
        frequencyHz: (strongest * context.sampleRate) / analyser.fftSize
      };
    },
    close: () => {
      playback.pause();
      playback.srcObject = null;
      source.disconnect();
      analyser.disconnect();
      muted.disconnect();
    }
  };
};
