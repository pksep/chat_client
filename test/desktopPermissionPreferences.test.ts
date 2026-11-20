import { beforeEach, expect, mock, test } from 'bun:test';

let tauri = true;
let oldShell = false;
const calls: { command: string; args: any }[] = [];
const storage = new Map<string, string>();
mock.module('@tauri-apps/api/core', () => ({
  isTauri: () => tauri,
  invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    if (oldShell && command === 'desktop_grant_permissions') {
      throw new Error('Тест: старая оболочка');
    }
  }
}));
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});
const preferences = await import(
  '../src/services/desktop-permission-preferences'
);

beforeEach(() => {
  tauri = true;
  oldShell = false;
  calls.length = 0;
  storage.clear();
});

test('сохраняет разные решения без координат, содержимого буфера и токенов', () => {
  preferences.saveDesktopPermissionChoice('microphone', 'granted');
  preferences.saveDesktopPermissionChoice('camera', 'granted');
  preferences.saveDesktopPermissionChoice('geolocation', 'denied');
  preferences.saveDesktopPermissionChoice('notifications', 'requested');
  expect(
    JSON.parse(storage.get(preferences.DESKTOP_PERMISSION_STORAGE_KEY)!)
  ).toEqual({
    microphone: 'granted',
    camera: 'granted',
    geolocation: 'denied',
    notifications: 'requested'
  });
});

test('восстанавливает только явно разрешённые виды доступа', async () => {
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
  expect(calls).toEqual([
    {
      command: 'desktop_grant_permissions',
      args: {
        permissions: ['microphone', 'geolocation', 'clipboard-read']
      }
    }
  ]);
});

test('не выдаёт доступ из повреждённых или неизвестных данных', async () => {
  for (const saved of ['{', 'null', '{"camera":true,"microphone":"yes"}']) {
    storage.set(preferences.DESKTOP_PERMISSION_STORAGE_KEY, saved);
    await preferences.restoreDesktopWebviewPermissions();
  }
  expect(calls).toEqual([]);
});

test('старая оболочка восстанавливает поддерживаемые камеру и микрофон', async () => {
  oldShell = true;
  preferences.saveDesktopPermissionChoice('camera', 'granted');
  preferences.saveDesktopPermissionChoice('geolocation', 'granted');
  await preferences.restoreDesktopWebviewPermissions();
  expect(calls[1]).toEqual({
    command: 'desktop_grant_media_permissions',
    args: {
      permissions: ['camera']
    }
  });
});

test('веб не сохраняет и не восстанавливает разрешения Tauri', async () => {
  tauri = false;
  preferences.saveDesktopPermissionChoice('microphone', 'granted');
  await preferences.restoreDesktopWebviewPermissions();
  expect(storage.size).toBe(0);
  expect(calls).toEqual([]);
});

test('сброс ответов убирает все решения без нативных вызовов', () => {
  preferences.saveDesktopPermissionChoice('geolocation', 'denied');
  preferences.saveDesktopPermissionChoice('camera', 'granted');
  expect(preferences.resetDesktopPermissionChoices()).toBe(true);
  expect(preferences.getDesktopPermissionChoice('camera')).toBeUndefined();
  expect(preferences.getDesktopPermissionChoice('geolocation')).toBeUndefined();
  expect(calls).toEqual([]);
});

test('успешная вставка сохраняет только разрешение, затем штатный метод восстанавливается', async () => {
  const original = async () => 'Секретное содержимое тестового буфера';
  const clipboard = { readText: original };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard }
  });
  const dispose = preferences.installDesktopClipboardPermissions();
  expect(await clipboard.readText()).toBe(await original());
  expect(preferences.getDesktopPermissionChoice('clipboard-read')).toBe(
    'granted'
  );
  expect(storage.get(preferences.DESKTOP_PERMISSION_STORAGE_KEY)).not.toContain(
    'Секретное'
  );
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
