import { invoke } from '@tauri-apps/api/core';
import { ref } from 'vue';
import {
  isPermissionGranted,
  requestPermission
} from '@tauri-apps/plugin-notification';
import {
  getDesktopPermissionChoice,
  saveDesktopPermissionChoice
} from './desktop-permission-preferences';

let pending: Promise<boolean> | null = null;
export const desktopNotificationsBlocked = ref(false);
export const desktopNotificationCheckFailed = ref(false);

const getNativePermission = async (): Promise<boolean | null> => {
  try {
    const granted = await invoke<boolean | null>(
      'desktop_notification_permission'
    );
    desktopNotificationCheckFailed.value = false;
    return typeof granted === 'boolean' ? granted : null;
  } catch (error) {
    desktopNotificationCheckFailed.value =
      !/command\b.*\bnot found|unknown command/i.test(String(error));
    return null;
  }
};

export const ensureDesktopNotificationPermission = (
  options: { interactive?: boolean } = {}
): Promise<boolean> => {
  if (
    getDesktopPermissionChoice('notifications') === 'denied' &&
    !options.interactive
  )
    return Promise.resolve(false);
  pending ??= (async () => {
    // Сохранённый выбор не подменяет актуальное системное разрешение.
    const nativePermission = await getNativePermission();
    if (
      getDesktopPermissionChoice('notifications') === 'denied' &&
      !options.interactive
    )
      return false;
    const granted = nativePermission ?? (await isPermissionGranted());
    if (
      getDesktopPermissionChoice('notifications') === 'denied' &&
      !options.interactive
    )
      return false;
    desktopNotificationsBlocked.value = !granted;
    if (granted) {
      await saveDesktopPermissionChoice('notifications', 'granted');
      return true;
    }
    // Windows меняет этот доступ в системных настройках, а не через requestPermission.
    if (nativePermission === false) {
      await saveDesktopPermissionChoice('notifications', 'denied');
      return false;
    }
    if (getDesktopPermissionChoice('notifications') && !options.interactive)
      return false;
    await saveDesktopPermissionChoice('notifications', 'requested');
    const permission = await requestPermission();
    if (getDesktopPermissionChoice('notifications') === 'denied') return false;
    desktopNotificationsBlocked.value = permission !== 'granted';
    await saveDesktopPermissionChoice(
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
