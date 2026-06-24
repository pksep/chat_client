import { Capacitor, registerPlugin } from '@capacitor/core';

interface CallScreenPlugin {
  showIncomingCallScreen(): Promise<void>;
  hideIncomingCallScreen(): Promise<void>;
  lockPortraitOrientation(): Promise<void>;
  allowCallFullscreenOrientation(): Promise<void>;
  checkPermissions(): Promise<{ overlay: boolean; battery: boolean }>;
  requestOverlayPermission(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  openAutostartSettings(): Promise<void>;
}

const CallScreen = registerPlugin<CallScreenPlugin>('CallScreen');

export const showIncomingCallScreen = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await CallScreen.showIncomingCallScreen();
    } catch (err) {
      console.error('[CallScreen] Show error:', err);
    }
  }
};

export const hideIncomingCallScreen = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      await CallScreen.hideIncomingCallScreen();
    } catch (err) {
      console.error('[CallScreen] Hide error:', err);
    }
  }
};

export const lockPortraitOrientation = async () => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await CallScreen.lockPortraitOrientation();
    } catch (err) {
      console.error('[CallScreen] Orientation lock error:', err);
    }
  }
};

export const allowCallFullscreenOrientation = async () => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await CallScreen.allowCallFullscreenOrientation();
    } catch (err) {
      console.error('[CallScreen] Orientation allow error:', err);
    }
  }
};

export const checkCallPermissions = async () => {
  if (Capacitor.isNativePlatform()) {
    return await CallScreen.checkPermissions();
  }
  return { overlay: true, battery: true };
};

export const requestOverlayPermission = async () => {
  if (Capacitor.isNativePlatform()) {
    await CallScreen.requestOverlayPermission();
  }
};

export const requestIgnoreBatteryOptimizations = async () => {
  if (Capacitor.isNativePlatform()) {
    await CallScreen.requestIgnoreBatteryOptimizations();
  }
};

export const openAutostartSettings = async () => {
  if (Capacitor.isNativePlatform()) {
    await CallScreen.openAutostartSettings();
  }
};
