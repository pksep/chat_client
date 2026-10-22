import { Capacitor, registerPlugin } from '@capacitor/core';

interface NotificationAudioPolicy {
  allowSound?: boolean;
  interruptionFilter?: string;
  notificationsEnabled?: boolean;
  ringerVolume?: number;
  ringerMode?: string;
}

interface NotificationAudioPlugin {
  getNotificationSoundPolicy(): Promise<NotificationAudioPolicy>;
  playCallRingtone(options?: { roomId?: string }): Promise<void>;
  playNotificationSound(): Promise<void>;
  stopCallRingtone(): Promise<void>;
}

const NotificationAudio =
  registerPlugin<NotificationAudioPlugin>('NotificationAudio');

const POLICY_CACHE_TTL_MS = 2000;

let cachedPolicy: NotificationAudioPolicy | null = null;
let cachedPolicyAt = 0;

const isAndroidNativePlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const getCachedAllowSound = (): boolean | null => {
  if (!cachedPolicy || Date.now() - cachedPolicyAt > POLICY_CACHE_TTL_MS) {
    return null;
  }

  return cachedPolicy.allowSound !== false;
};

export const shouldPlayNotificationSound = async (): Promise<boolean> => {
  if (!isAndroidNativePlatform()) {
    return true;
  }

  const cachedAllowSound = getCachedAllowSound();
  if (cachedAllowSound !== null) {
    return cachedAllowSound;
  }

  try {
    const policy = await NotificationAudio.getNotificationSoundPolicy();
    cachedPolicy = policy;
    cachedPolicyAt = Date.now();
    return policy.allowSound !== false;
  } catch (error) {
    console.warn('Failed to resolve notification sound policy:', error);
    return true;
  }
};

export const playNativeNotificationSound = async (): Promise<boolean> => {
  if (!isAndroidNativePlatform()) {
    return false;
  }

  try {
    await NotificationAudio.playNotificationSound();
    return true;
  } catch (error) {
    console.warn('Failed to play native notification sound:', error);
    return false;
  }
};

export const playNativeCallRingtone = async (
  roomId?: string | null
): Promise<boolean> => {
  if (!isAndroidNativePlatform()) {
    return false;
  }

  try {
    await NotificationAudio.playCallRingtone({ roomId: roomId || undefined });
    return true;
  } catch (error) {
    console.warn('Failed to play native call ringtone:', error);
    return false;
  }
};

export const stopNativeCallRingtone = async (): Promise<void> => {
  if (!isAndroidNativePlatform()) {
    return;
  }

  try {
    await NotificationAudio.stopCallRingtone();
  } catch (error) {
    console.warn('Failed to stop native call ringtone:', error);
  }
};
