import { fetchWithAiAccess } from '../composables/useChatAccess';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';

const TARGET_SAMPLE_RATE = 16_000;
const MAX_CAPTURE_DURATION_MS = 25_000;
const SILENCE_AFTER_SPEECH_MS = 1_100;
const MIN_CAPTURE_DURATION_MS = 300;
const VOICE_LEVEL_THRESHOLD = 0.014;

export interface VoiceCaptureSession {
  result: Promise<ArrayBuffer | null>;
  stop: () => void;
  cancel: () => void;
}

export interface VoicePlaybackSession {
  done: Promise<void>;
  stop: () => void;
}

interface SpeechErrorPayload {
  error?: unknown;
}

/** Запускает запись одной реплики и автоматически завершает её после тишины. */
export const startVoiceCapture = async (): Promise<VoiceCaptureSession> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Браузер не поддерживает запись голоса.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true
    }
  });
  const AudioContextConstructor =
    window.AudioContext ||
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextConstructor) {
    stream.getTracks().forEach(track => track.stop());
    throw new Error('Браузер не поддерживает обработку голоса.');
  }

  const audioContext = new AudioContextConstructor();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silentOutput = audioContext.createGain();
  silentOutput.gain.value = 0;

  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let finished = false;
  let speechDetected = false;
  let lastSpeechAt = performance.now();
  const startedAt = performance.now();
  let resolveResult: (value: ArrayBuffer | null) => void = () => {};
  const result = new Promise<ArrayBuffer | null>(resolve => {
    resolveResult = resolve;
  });

  const finish = (keepAudio: boolean): void => {
    if (finished) return;
    finished = true;
    window.clearTimeout(maxDurationTimer);
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silentOutput.disconnect();
    stream.getTracks().forEach(track => track.stop());
    void audioContext.close();

    const durationMs = performance.now() - startedAt;
    if (!keepAudio || durationMs < MIN_CAPTURE_DURATION_MS || !totalSamples) {
      resolveResult(null);
      return;
    }

    resolveResult(
      encodeLinearPcm(chunks, totalSamples, audioContext.sampleRate)
    );
  };

  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(input);
    chunks.push(chunk);
    totalSamples += chunk.length;

    const level = calculateRootMeanSquare(input);
    const now = performance.now();
    if (level >= VOICE_LEVEL_THRESHOLD) {
      speechDetected = true;
      lastSpeechAt = now;
    }

    if (
      speechDetected &&
      now - lastSpeechAt >= SILENCE_AFTER_SPEECH_MS &&
      now - startedAt >= MIN_CAPTURE_DURATION_MS
    ) {
      finish(true);
    }
  };

  source.connect(processor);
  processor.connect(silentOutput);
  silentOutput.connect(audioContext.destination);
  const maxDurationTimer = window.setTimeout(
    () => finish(true),
    MAX_CAPTURE_DURATION_MS
  );

  return {
    result,
    stop: () => finish(true),
    cancel: () => finish(false)
  };
};

/** Отправляет PCM-аудио в защищённый серверный маршрут распознавания. */
export const recognizeVoice = async (
  audio: ArrayBuffer,
  signal?: AbortSignal
): Promise<string> => {
  const response = await speechFetch('/speech/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: audio,
    signal
  });
  const payload = (await response.json()) as { text?: unknown };
  return typeof payload.text === 'string' ? payload.text.trim() : '';
};

/** Запрашивает у сервера озвучивание уже готового человеческого ответа. */
export const synthesizeVoice = async (
  text: string,
  signal?: AbortSignal
): Promise<Blob> => {
  const response = await speechFetch('/speech/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prepareTextForSpeech(text) }),
    signal
  });
  return response.blob();
};

/** Начинает воспроизведение ответа и позволяет немедленно прервать его. */
export const startVoicePlayback = (audioBlob: Blob): VoicePlaybackSession => {
  const objectUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  let settled = false;
  let resolveDone: () => void = () => {};
  let rejectDone: (reason?: unknown) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const finish = (error?: unknown): void => {
    if (settled) return;
    settled = true;
    audio.onended = null;
    audio.onerror = null;
    URL.revokeObjectURL(objectUrl);
    if (error) rejectDone(error);
    else resolveDone();
  };

  audio.onended = () => finish();
  audio.onerror = () => finish(new Error('Не удалось воспроизвести ответ.'));
  void audio.play().catch(error => {
    finish(error);
  });

  return {
    done,
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      finish();
    }
  };
};

/** Убирает Markdown и служебное форматирование, которые не нужно произносить. */
export const prepareTextForSpeech = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, ' Фрагмент кода. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*[-*#>]\s*/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5_000);

const speechFetch = async (
  path: '/speech/recognize' | '/speech/synthesize',
  init: RequestInit
): Promise<Response> => {
  const token = getAuthToken();
  if (!token) throw new Error('Требуется авторизация.');

  const configuredBaseUrl = getConfig().CHAT_MASTRA_URL?.replace(/\/+$/, '');
  if (!configuredBaseUrl) throw new Error('Голосовой сервис не настроен.');
  const baseUrl = configuredBaseUrl.endsWith('/api')
    ? configuredBaseUrl.slice(0, -4)
    : configuredBaseUrl;

  const response = await fetchWithAiAccess(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`
    }
  });
  if (response.ok) return response;

  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as SpeechErrorPayload | null;
  const message =
    typeof payload?.error === 'string'
      ? payload.error
      : 'Голосовой сервис временно недоступен.';
  throw new Error(message);
};

const calculateRootMeanSquare = (samples: Float32Array): number => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
};

const encodeLinearPcm = (
  chunks: Float32Array[],
  totalSamples: number,
  sourceSampleRate: number
): ArrayBuffer => {
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const ratio = sourceSampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.floor(merged.length / ratio);
  const output = new ArrayBuffer(outputLength * 2);
  const view = new DataView(output);

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), merged.length);
    let sample = 0;
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sample += merged[sourceIndex];
    }
    sample /= Math.max(1, end - start);
    const normalized = Math.max(-1, Math.min(1, sample));
    view.setInt16(
      index * 2,
      normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff,
      true
    );
  }

  return output;
};
