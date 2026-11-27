import { ref, watch, type Ref } from 'vue';
import type { CallRenderWindow } from '../components/Desktop/call-window-context';

export function createDesktopMicrophoneMeter(options: {
  renderWindow: CallRenderWindow;
  enabled: Ref<boolean>;
  getTrack: () => MediaStreamTrack | null;
}) {
  const audioLevel = ref(0);
  const speaking = ref(false);
  const ready = ref(false);
  const host = options.renderWindow;
  const requestFrame = host.requestAnimationFrame.bind(host);
  const cancelFrame = host.cancelAnimationFrame.bind(host);
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let silentOutput: GainNode | null = null;
  let track: MediaStreamTrack | null = null;
  let samples = new Float32Array(256);
  let frame: number | null = null;
  let disposed = false;
  let lastSpeechAt = -Infinity;
  let resumePending = false;
  let lastResumeAt = -Infinity;
  // Готовим анализатор при открытии звонка, чтобы первое включение микрофона
  // не ждало запуска AudioContext и первого фонового кадра.
  try {
    context = new host.AudioContext({ latencyHint: 'interactive' });
  } catch {
    /* Повторим при появлении трека. */
  }

  const resume = (gesture = false) => {
    if (!context || !['suspended', 'interrupted'].includes(context.state))
      return;
    const now = host.performance.now();
    // Новый пользовательский жест должен разблокировать и старый pending resume WebKit.
    if (!gesture && (resumePending || now - lastResumeAt < 1000)) return;
    resumePending = true;
    lastResumeAt = now;
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
    silentOutput?.disconnect();
    source = null;
    analyser = null;
    silentOutput = null;
    track = null;
    ready.value = false;
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
            new host.MediaStream([nextTrack])
          );
          source.connect(analyser);
          // WebKit должен обрабатывать граф даже без слышимого вывода.
          silentOutput = context.createGain();
          silentOutput.gain.value = 0;
          analyser.connect(silentOutput);
          silentOutput.connect(context.destination);
          track = nextTrack;
          resume();
        } catch (error) {
          console.warn('Не удалось подготовить локальный индикатор:', error);
          detach();
        }
      }
    }
    if (options.enabled.value && track) resume();
    let level = 0;
    ready.value = Boolean(
      analyser && track?.readyState === 'live' && context?.state === 'running'
    );
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
    if (options.enabled.value) frame = requestFrame(sample);
  };
  const stopFrames = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    audioLevel.value = 0;
    speaking.value = false;
    ready.value = false;
    lastSpeechAt = -Infinity;
  };
  const unwatch = watch(
    options.enabled,
    enabled => {
      stopFrames();
      if (enabled) {
        resume();
        sample();
      }
    },
    { immediate: true, flush: 'sync' }
  );
  const wake = () => {
    if (disposed) return;
    resume(true);
    if (options.enabled.value && frame === null) sample();
  };
  host.addEventListener('pointerdown', wake, true);
  host.addEventListener('keydown', wake, true);
  host.addEventListener('focus', wake);
  host.addEventListener('pageshow', wake);
  host.document.addEventListener('visibilitychange', wake);
  return {
    audioLevel,
    speaking,
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      unwatch();
      stopFrames();
      host.removeEventListener('pointerdown', wake, true);
      host.removeEventListener('keydown', wake, true);
      host.removeEventListener('focus', wake);
      host.removeEventListener('pageshow', wake);
      host.document.removeEventListener('visibilitychange', wake);
      // Это анализ того же потока, а не второй захват. Сам RTC-track не останавливаем.
      detach();
      void context?.close().catch(() => {});
      context = null;
    }
  };
}
