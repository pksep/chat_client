import { Capacitor, registerPlugin } from '@capacitor/core';

const ProximityLock = registerPlugin<{
  enable(): Promise<void>;
  disable(): Promise<void>;
}>('ProximityLock');

let isEnabled = false;

/**
 * Enable the proximity screen-off lock.
 * When the proximity sensor detects the phone is near the ear,
 * the screen turns off (like WhatsApp, Telegram, etc.).
 */
export const enableProximityLock = async () => {
  if (!Capacitor.isNativePlatform() || isEnabled) return;

  try {
    await ProximityLock.enable();
    isEnabled = true;
    console.log('[ProximityLock] Enabled');
  } catch (err) {
    console.warn('[ProximityLock] Failed to enable:', err);
  }
};

/**
 * Disable the proximity screen-off lock.
 * Call this when the call ends or speaker mode is activated.
 */
export const disableProximityLock = async () => {
  if (!Capacitor.isNativePlatform() || !isEnabled) return;

  try {
    await ProximityLock.disable();
    isEnabled = false;
    console.log('[ProximityLock] Disabled');
  } catch (err) {
    console.warn('[ProximityLock] Failed to disable:', err);
  }
};
