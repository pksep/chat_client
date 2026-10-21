import {
  playNativeNotificationSound,
  shouldPlayNotificationSound
} from './useNotificationSoundPolicy';

const SOUND_INTERVAL_MS = 1500;
let pending = false;
let lastStartedAt = -Infinity;
let audio: HTMLAudioElement | undefined;

export const playMessageNotificationSound = async (): Promise<void> => {
  // Серия пересылок должна звучать один раз, включая ожидание native-политики.
  if (pending || Date.now() - lastStartedAt < SOUND_INTERVAL_MS) return;
  if (audio && !audio.paused && !audio.ended) return;
  pending = true;

  try {
    if (!(await shouldPlayNotificationSound())) return;
    lastStartedAt = Date.now();
    if (await playNativeNotificationSound()) return;

    if (!audio) {
      audio = new Audio('/audio/new-message.mp3');
      audio.preload = 'auto';
    }
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    console.warn('Не удалось воспроизвести звук уведомления:', error);
  } finally {
    pending = false;
  }
};
