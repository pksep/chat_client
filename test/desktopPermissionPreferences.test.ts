import { beforeEach, expect, mock, test } from 'bun:test';

let tauri = true;
let oldShell = false;
let nativeChoices: Record<string, unknown> | null = null;
let storageBlocked = false;
let nativeWriteBlocked = false;
const calls: { command: string; args: any }[] = [];
const storage = new Map<string, string>();
mock.module('@tauri-apps/api/core', () => ({
  isTauri: () => tauri,
  invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    if (oldShell && command !== 'desktop_grant_media_permissions') {
      throw new Error('Command not found: тест старой оболочки');
    }
    if (command === 'desktop_load_permission_preferences') {
      nativeChoices ??= { ...args.legacy };
      return { ...nativeChoices };
    }
    if (nativeWriteBlocked) throw new Error('Тест: диск заполнен');
    if (command === 'desktop_save_permission_choice') {
      nativeChoices = { ...nativeChoices, [args.permission]: args.choice };
    }
    if (command === 'desktop_reset_permission_preferences') nativeChoices = {};
  }
}));
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (storageBlocked) throw new Error('Тест: WebView недоступен');
      storage.set(key, value);
    }
  }
});
const preferences = await import(
  '../src/services/desktop-permission-preferences'
);

beforeEach(async () => {
  tauri = true;
  oldShell = false;
  storageBlocked = false;
  nativeWriteBlocked = false;
  nativeChoices = null;
  storage.clear();
  await preferences.initializeDesktopPermissionPreferences();
  calls.length = 0;
});

test('сохраняет решения на диск без координат, содержимого буфера и токенов', async () => {
  await Promise.all([
    preferences.saveDesktopPermissionChoice('microphone', 'granted'),
    preferences.saveDesktopPermissionChoice('camera', 'granted'),
    preferences.saveDesktopPermissionChoice('geolocation', 'denied'),
    preferences.saveDesktopPermissionChoice('notifications', 'requested')
  ]);
  expect(nativeChoices).toEqual({
    microphone: 'granted',
    camera: 'granted',
    geolocation: 'denied',
    notifications: 'requested'
  });
  expect(
    JSON.parse(storage.get(preferences.DESKTOP_PERMISSION_STORAGE_KEY)!)
  ).toEqual(nativeChoices);
});

test('ответы с диска восстанавливаются после потери хранилища WebView', async () => {
  await preferences.saveDesktopPermissionChoice('microphone', 'granted');
  await preferences.saveDesktopPermissionChoice('camera', 'denied');
  storage.clear();
  await preferences.restoreDesktopWebviewPermissions();
  expect(preferences.getDesktopPermissionChoice('microphone')).toBe('granted');
  expect(preferences.getDesktopPermissionChoice('camera')).toBe('denied');
  expect(
    calls.filter(call => call.command === 'desktop_grant_permissions')
  ).toEqual([
    {
      command: 'desktop_grant_permissions',
      args: { permissions: ['microphone'] }
    }
  ]);
});

test('миграция старых ответов разрешает только явно согласованные виды доступа', async () => {
  nativeChoices = null;
  storage.set(
    preferences.DESKTOP_PERMISSION_STORAGE_KEY,
    JSON.stringify({
      microphone: 'granted',
      camera: 'denied',
      geolocation: 'granted',
      'clipboard-read': 'granted',
      notifications: 'granted',
      screen: 'granted'
    })
  );
  await preferences.restoreDesktopWebviewPermissions();
  expect(nativeChoices).not.toHaveProperty('screen');
  expect(calls.at(-1)).toEqual({
    command: 'desktop_grant_permissions',
    args: { permissions: ['microphone', 'geolocation', 'clipboard-read'] }
  });
});

test('повреждённые и неизвестные данные не выдают доступ', async () => {
  for (const saved of ['{', 'null', '{"camera":true,"microphone":"yes"}']) {
    nativeChoices = null;
    storage.set(preferences.DESKTOP_PERMISSION_STORAGE_KEY, saved);
    await preferences.restoreDesktopWebviewPermissions();
  }
  expect(
    calls.filter(call => call.command === 'desktop_grant_permissions')
  ).toEqual([]);
});

test('старая оболочка сохраняет совместимость с камерой и микрофоном', async () => {
  oldShell = true;
  await preferences.initializeDesktopPermissionPreferences();
  await preferences.saveDesktopPermissionChoice('camera', 'granted');
  await preferences.saveDesktopPermissionChoice('geolocation', 'granted');
  await preferences.restoreDesktopWebviewPermissions();
  expect(calls.at(-1)).toEqual({
    command: 'desktop_grant_media_permissions',
    args: { permissions: ['camera'] }
  });
});

test('веб не сохраняет и не восстанавливает разрешения Tauri', async () => {
  tauri = false;
  storage.clear();
  await preferences.saveDesktopPermissionChoice('microphone', 'granted');
  await preferences.restoreDesktopWebviewPermissions();
  expect(await preferences.resetDesktopPermissionChoices()).toBe(false);
  expect(storage.size).toBe(0);
  expect(calls).toEqual([]);
});

test('сброс на диске не возвращает старое согласие из WebView после перезапуска', async () => {
  await preferences.saveDesktopPermissionChoice('camera', 'granted');
  const stale = storage.get(preferences.DESKTOP_PERMISSION_STORAGE_KEY)!;
  expect(await preferences.resetDesktopPermissionChoices()).toBe(true);
  storage.set(preferences.DESKTOP_PERMISSION_STORAGE_KEY, stale);
  await preferences.restoreDesktopWebviewPermissions();
  expect(preferences.getDesktopPermissionChoice('camera')).toBeUndefined();
  expect(nativeChoices).toEqual({});
});

test('запрет записи WebView не мешает сохранению на диск', async () => {
  storageBlocked = true;
  await preferences.saveDesktopPermissionChoice('camera', 'granted');
  await preferences.initializeDesktopPermissionPreferences();
  expect(preferences.getDesktopPermissionChoice('camera')).toBe('granted');
  expect(preferences.desktopPermissionStorageWarning.value).toBe('');
});

test('ошибка диска не прерывает действие, но показывается в настройках', async () => {
  nativeWriteBlocked = true;
  await preferences.saveDesktopPermissionChoice('camera', 'granted');
  expect(preferences.getDesktopPermissionChoice('camera')).toBe('granted');
  expect(preferences.desktopPermissionStorageWarning.value).toContain(
    'свободное место'
  );
  expect(await preferences.resetDesktopPermissionChoices()).toBe(false);
});

test('успешная вставка сохраняет только разрешение и восстанавливает штатный метод', async () => {
  const original = async () => 'Секретное содержимое тестового буфера';
  const clipboard = { readText: original };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard }
  });
  const dispose = preferences.installDesktopClipboardPermissions();
  expect(await clipboard.readText()).toBe(await original());
  expect(nativeChoices).toEqual({ 'clipboard-read': 'granted' });
  dispose();
  expect(clipboard.readText).toBe(original);
});

test('отказ чтения буфера не становится сохранённым согласием', async () => {
  const clipboard = {
    read: async () => {
      throw new DOMException('Тест', 'NotAllowedError');
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard }
  });
  const dispose = preferences.installDesktopClipboardPermissions();
  await expect(clipboard.read()).rejects.toBeInstanceOf(DOMException);
  expect(
    preferences.getDesktopPermissionChoice('clipboard-read')
  ).toBeUndefined();
  dispose();
});

test('обёртка буфера сохраняет параметры чтения', async () => {
  const options = { unsanitized: ['text/html'] };
  let received: unknown;
  const clipboard = {
    read: async (value: unknown) => {
      received = value;
      return [];
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard }
  });
  const dispose = preferences.installDesktopClipboardPermissions();
  await clipboard.read(options);
  expect(received).toBe(options);
  dispose();
});
