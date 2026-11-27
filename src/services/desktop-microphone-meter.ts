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
  let lastContextAttemptAt = -Infinity;

  const resume = (gesture = false) => {
    if (!context || !['suspended', 'interrupted'].includes(context.state))
      return;
    const now = host.performance.now();
    // Новый пользовательский жест должен разблокировать и старый pending resume WebKit.
    if (!gesture && (resumePending || now - lastResumeAt < 1000)) return;
    resumePending = true;
    lastResumeAt = now;
    const resuming = context;
    void resuming
      .resume()
      .catch(() => {})
      .finally(() => {
        if (context === resuming) resumePending = false;
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
  const ensureContext = (gesture = false) => {
    if (
      context &&
      (context.state === 'closed' || !Number.isFinite(context.currentTime))
    ) {
      detach();
      void context.close().catch(() => {});
      context = null;
      resumePending = false;
      lastResumeAt = -Infinity;
    }
    if (context) return context;
    const now = host.performance.now();
    if (!gesture && now - lastContextAttemptAt < 1000) return null;
    lastContextAttemptAt = now;
    try {
      // Раннее создание в скрытом окне WebKit ARM может дать running с NaN-часами.
      context = new host.AudioContext({ latencyHint: 'interactive' });
      if (Number.isFinite(context.currentTime)) return context;
      void context.close().catch(() => {});
      context = null;
    } catch (error) {
      console.warn('Не удалось создать локальный аудиоанализатор:', error);
    }
    return null;
  };
  const sample = () => {
    frame = null;
    if (disposed || host.closed) return;
    const nextTrack = options.getTrack();
    if (nextTrack?.readyState === 'live') ensureContext();
    if (nextTrack !== track) {
      detach();
      if (nextTrack?.readyState === 'live' && context) {
        try {
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
    if (context || options.enabled.value || options.getTrack())
      ensureContext(true);
    resume(true);
    if (options.enabled.value && frame === null) sample();
  };
  host.addEventListener('pointerdown', wake, true);
  // WebKit может разблокировать звук только на завершающем click того же жеста.
  host.addEventListener('click', wake, true);
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
      host.removeEventListener('click', wake, true);
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
