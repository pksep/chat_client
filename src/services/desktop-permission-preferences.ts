import { invoke, isTauri } from '@tauri-apps/api/core';
import { ref } from 'vue';

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

export const desktopPermissionStorageWarning = ref('');
let nativePreferences: Preferences | null = null;
let nativeStoreAvailable = false;
let initialization: Promise<void> | null = null;
let writes = Promise.resolve();

const sanitizePreferences = (saved: unknown): Preferences => {
  const result: Preferences = {};
  if (!saved || typeof saved !== 'object') return result;
  for (const permission of permissions) {
    const choice = (saved as Preferences)[permission];
    if (choice && ['granted', 'denied', 'requested'].includes(choice)) {
      result[permission] = choice;
    }
  }
  return result;
};

const readPreferences = (): Preferences => {
  if (!isTauri()) return {};
  try {
    const saved = JSON.parse(
      localStorage.getItem(DESKTOP_PERMISSION_STORAGE_KEY) || '{}'
    );
    return sanitizePreferences(saved);
  } catch {
    return {};
  }
};

const mirrorPreferences = (choices: Preferences): boolean => {
  try {
    localStorage.setItem(
      DESKTOP_PERMISSION_STORAGE_KEY,
      JSON.stringify(choices)
    );
    return true;
  } catch {
    return false;
  }
};

const storageFailed = () => {
  desktopPermissionStorageWarning.value =
    'Не удалось сохранить разрешения. Проверьте свободное место на диске: после перезапуска запрос доступа может повториться.';
};

const persist = (operation: () => Promise<void>) => {
  const pending = writes.then(operation);
  writes = pending.catch(() => undefined);
  return pending;
};

export const initializeDesktopPermissionPreferences = (): Promise<void> => {
  if (!isTauri()) return Promise.resolve();
  initialization ??= (async () => {
    const legacy = readPreferences();
    try {
      const saved = await invoke<Preferences>(
        'desktop_load_permission_preferences',
        { legacy }
      );
      nativeStoreAvailable = !!saved && typeof saved === 'object';
      nativePreferences = nativeStoreAvailable
        ? sanitizePreferences(saved)
        : null;
      if (nativePreferences) mirrorPreferences(nativePreferences);
      desktopPermissionStorageWarning.value = '';
    } catch (error) {
      // Старые оболочки поддерживают только хранилище WebView.
      nativeStoreAvailable = !/command\b.*\bnot found|unknown command/i.test(
        String(error)
      );
      nativePreferences = null;
      if (nativeStoreAvailable) storageFailed();
    }
  })().finally(() => {
    initialization = null;
  });
  return initialization;
};

export const getDesktopPermissionChoice = (permission: DesktopPermission) =>
  isTauri() ? (nativePreferences ?? readPreferences())[permission] : undefined;

export const resetDesktopPermissionChoices = async (): Promise<boolean> => {
  if (!isTauri()) return false;
  try {
    if (nativeStoreAvailable) {
      await persist(() => invoke('desktop_reset_permission_preferences'));
    }
    const mirrored = mirrorPreferences({});
    if (!mirrored && !nativeStoreAvailable)
      throw new Error('Хранилище недоступно');
    nativePreferences = nativeStoreAvailable ? {} : null;
    desktopPermissionStorageWarning.value = '';
    return true;
  } catch {
    storageFailed();
    return false;
  }
};

export const saveDesktopPermissionChoice = async (
  permission: DesktopPermission,
  choice: PermissionChoice
): Promise<void> => {
  if (!isTauri()) return;
  const previous = nativePreferences ?? readPreferences();
  if (previous[permission] === choice) return;
  const updated = { ...previous, [permission]: choice };
  const mirrored = mirrorPreferences(updated);
  if (nativeStoreAvailable) nativePreferences = updated;
  try {
    if (nativeStoreAvailable) {
      await persist(() =>
        invoke('desktop_save_permission_choice', { permission, choice })
      );
    } else if (!mirrored) throw new Error('Хранилище недоступно');
  } catch {
    // Ошибка записи не должна прерывать текущий звонок или вставку.
    storageFailed();
  }
};

export const flushDesktopPermissionPreferences = () => writes;

export const restoreDesktopWebviewPermissions = async (): Promise<void> => {
  if (!isTauri()) return;
  await initializeDesktopPermissionPreferences();
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
      await saveDesktopPermissionChoice('clipboard-read', 'granted');
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
