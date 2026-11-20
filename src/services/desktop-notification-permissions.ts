import {
  isPermissionGranted,
  requestPermission
} from '@tauri-apps/plugin-notification';
import {
  getDesktopPermissionChoice,
  saveDesktopPermissionChoice
} from './desktop-permission-preferences';

let pending: Promise<boolean> | null = null;

export const ensureDesktopNotificationPermission = (): Promise<boolean> => {
  pending ??= (async () => {
    // Сохранённый выбор не подменяет актуальное системное разрешение.
    if (await isPermissionGranted()) {
      saveDesktopPermissionChoice('notifications', 'granted');
      return true;
    }
    if (getDesktopPermissionChoice('notifications')) return false;
    saveDesktopPermissionChoice('notifications', 'requested');
    const permission = await requestPermission();
    saveDesktopPermissionChoice(
      'notifications',
      permission === 'granted'
        ? 'granted'
        : permission === 'denied'
          ? 'denied'
          : 'requested'
    );
    return permission === 'granted';
  })().finally(() => {
    pending = null;
  });
  return pending;
};
