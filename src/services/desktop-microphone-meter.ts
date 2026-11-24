import { ref, watch, type Ref } from 'vue';
import type { CallRenderWindow } from '../components/Desktop/call-window-context';

export function createDesktopMicrophoneMeter(options: {
  renderWindow: CallRenderWindow;
  enabled: Ref<boolean>;
  getTrack: () => MediaStreamTrack | null;
}) {
  const audioLevel = ref(0);
  const speaking = ref(false);
  const host = options.renderWindow;
  const requestFrame = host.requestAnimationFrame.bind(host);
  const cancelFrame = host.cancelAnimationFrame.bind(host);
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let track: MediaStreamTrack | null = null;
  let samples = new Float32Array(256);
  let frame: number | null = null;
  let disposed = false;
  let lastSpeechAt = -Infinity;
  let resumePending = false;
  // Готовим анализатор при открытии звонка, чтобы первое включение микрофона
  // не ждало запуска AudioContext и первого фонового кадра.
  try {
    context = new host.AudioContext({ latencyHint: 'interactive' });
  } catch {
    /* Повторим при появлении трека. */
  }

  const resume = () => {
    if (context?.state !== 'suspended' || resumePending) return;
    resumePending = true;
    void context
      .resume()
      .catch(() => {})
      .finally(() => {
        resumePending = false;
      });
  };
  const detach = () => {
    source?.disconnect();
    analyser?.disconnect();
    source = null;
    analyser = null;
    track = null;
  };
  const sample = () => {
    frame = null;
    if (disposed || host.closed) return;
    const nextTrack = options.getTrack();
    if (nextTrack !== track) {
      detach();
      if (nextTrack?.readyState === 'live') {
        try {
          context ??= new host.AudioContext({ latencyHint: 'interactive' });
          analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0;
          samples = new Float32Array(analyser.fftSize);
          source = context.createMediaStreamSource(
            new MediaStream([nextTrack])
          );
          source.connect(analyser);
          track = nextTrack;
          resume();
        } catch (error) {
          console.warn('Не удалось подготовить локальный индикатор:', error);
          detach();
        }
      }
    }
    let level = 0;
    if (
      analyser &&
      options.enabled.value &&
      track?.readyState === 'live' &&
      track.enabled &&
      context?.state === 'running'
    ) {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) sum += value * value;
      level = Math.min(1, Math.sqrt(sum / samples.length));
    }
    audioLevel.value = level;
    const now = host.performance.now();
    if (level >= 0.006) lastSpeechAt = now;
    speaking.value = now - lastSpeechAt < 90;
    frame = requestFrame(sample);
  };
  const stopFrames = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    audioLevel.value = 0;
    speaking.value = false;
    lastSpeechAt = -Infinity;
  };
  const unwatch = watch(
    options.enabled,
    enabled => {
      stopFrames();
      if (enabled) resume();
      sample();
    },
    { immediate: true, flush: 'sync' }
  );
  host.addEventListener('pointerdown', resume, true);
  host.addEventListener('keydown', resume, true);
  return {
    audioLevel,
    speaking,
    dispose() {
      disposed = true;
      unwatch();
      stopFrames();
      host.removeEventListener('pointerdown', resume, true);
      host.removeEventListener('keydown', resume, true);
      // Это анализ того же потока, а не второй захват. Сам RTC-track не останавливаем.
      detach();
      void context?.close().catch(() => {});
      context = null;
    }
  };
}
