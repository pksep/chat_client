import { invoke, isTauri } from '@tauri-apps/api/core';

export const DESKTOP_PERMISSION_STORAGE_KEY = 'chat.desktop.permissions.v1';
export const desktopWebviewPermissions = [
  'microphone',
  'camera',
  'geolocation',
  'clipboard-read'
] as const;
type DesktopPermission =
  | (typeof desktopWebviewPermissions)[number]
  | 'notifications';
type PermissionChoice = 'granted' | 'denied' | 'requested';
type Preferences = Partial<Record<DesktopPermission, PermissionChoice>>;
const permissions: DesktopPermission[] = [
  ...desktopWebviewPermissions,
  'notifications'
];

const readPreferences = (): Preferences => {
  if (!isTauri()) return {};
  try {
    const saved = JSON.parse(
      localStorage.getItem(DESKTOP_PERMISSION_STORAGE_KEY) || '{}'
    );
    const result: Preferences = {};
    for (const permission of permissions) {
      if (['granted', 'denied', 'requested'].includes(saved?.[permission])) {
        result[permission] = saved[permission];
      }
    }
    return result;
  } catch {
    return {};
  }
};

export const getDesktopPermissionChoice = (permission: DesktopPermission) =>
  readPreferences()[permission];

export const resetDesktopPermissionChoices = (): boolean => {
  if (!isTauri()) return false;
  try {
    localStorage.setItem(DESKTOP_PERMISSION_STORAGE_KEY, '{}');
    return true;
  } catch {
    return false;
  }
};

export const saveDesktopPermissionChoice = (
  permission: DesktopPermission,
  choice: PermissionChoice
): void => {
  if (!isTauri()) return;
  try {
    localStorage.setItem(
      DESKTOP_PERMISSION_STORAGE_KEY,
      JSON.stringify({ ...readPreferences(), [permission]: choice })
    );
  } catch {
    // Недоступное хранилище не должно прерывать звонок или вставку.
  }
};

export const restoreDesktopWebviewPermissions = async (): Promise<void> => {
  if (!isTauri()) return;
  const granted = desktopWebviewPermissions.filter(
    permission => getDesktopPermissionChoice(permission) === 'granted'
  );
  if (!granted.length) return;
  try {
    await invoke('desktop_grant_permissions', { permissions: granted });
  } catch {
    // Совместимость со старой оболочкой при локальном обновлении интерфейса.
    const media = granted.filter(
      permission => permission === 'microphone' || permission === 'camera'
    );
    if (media.length) {
      await invoke('desktop_grant_media_permissions', {
        permissions: media
      }).catch(() => undefined);
    }
  }
};

export const installDesktopClipboardPermissions = (): (() => void) => {
  if (!isTauri() || !navigator.clipboard) return () => {};
  const clipboard = navigator.clipboard;
  const disposers: (() => void)[] = [];
  for (const method of ['read', 'readText'] as const) {
    const original = clipboard[method];
    if (!original) continue;
    const wrapped = async (...args: unknown[]) => {
      const value = await Reflect.apply(original, clipboard, args);
      saveDesktopPermissionChoice('clipboard-read', 'granted');
      return value;
    };
    try {
      // У методов разные типы результата, но аргументов в обоих случаях нет.
      (clipboard as any)[method] = wrapped;
      disposers.push(() => {
        if (clipboard[method] === wrapped) {
          (clipboard as any)[method] = original;
        }
      });
    } catch {
      // Некоторые WebView не позволяют заменить метод; штатная вставка остаётся.
    }
  }
  return () => disposers.forEach(dispose => dispose());
};
