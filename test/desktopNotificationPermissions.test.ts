import { beforeEach, expect, mock, test } from 'bun:test';

let granted = false;
let answer = 'denied';
let requests = 0;
let checks = 0;
let nativePermission: boolean | null = null;
let nativeCheckFailed = false;
let deferredCheck: (() => Promise<boolean>) | null = null;
const storage = new Map<string, string>();
mock.module('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (command: string) => {
    if (nativeCheckFailed) throw new Error('Element not found. (0x80070490)');
    return command === 'desktop_notification_permission'
      ? nativePermission
      : null;
  }
}));
mock.module('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: async () => {
    checks++;
    return deferredCheck ? deferredCheck() : granted;
  },
  requestPermission: async () => {
    requests++;
    return answer;
  }
}));
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});
const { ensureDesktopNotificationPermission: ensure } = await import(
  '../src/services/desktop-notification-permissions'
);
const {
  getDesktopPermissionChoice,
  saveDesktopPermissionChoice,
  initializeDesktopPermissionPreferences
} = await import('../src/services/desktop-permission-preferences');

beforeEach(async () => {
  granted = false;
  answer = 'denied';
  requests = 0;
  checks = 0;
  nativePermission = null;
  nativeCheckFailed = false;
  storage.clear();
  deferredCheck = null;
  await initializeDesktopPermissionPreferences();
});

test('отказ сохраняется и не вызывает новый запрос при следующей инициализации', async () => {
  expect(await ensure()).toBe(false);
  expect(await ensure()).toBe(false);
  expect(requests).toBe(1);
  expect(getDesktopPermissionChoice('notifications')).toBe('denied');
});

test('сохранённый отказ требует явного включения в профиле даже после разрешения ОС', async () => {
  await ensure();
  granted = true;
  expect(await ensure()).toBe(false);
  expect(await ensure({ interactive: true })).toBe(true);
  expect(requests).toBe(1);
  expect(getDesktopPermissionChoice('notifications')).toBe('granted');
});

test('сохранённое согласие не подменяет отозванное разрешение ОС', async () => {
  granted = true;
  expect(await ensure()).toBe(true);
  granted = false;
  expect(await ensure()).toBe(false);
  expect(requests).toBe(0);
  expect(checks).toBe(2);
});

test('одновременные запросы открывают один системный диалог', async () => {
  answer = 'granted';
  expect(await Promise.all([ensure(), ensure(), ensure()])).toEqual([
    true,
    true,
    true
  ]);
  expect(requests).toBe(1);
});

test('закрытый системный диалог не запрашивается снова при следующем запуске', async () => {
  answer = 'prompt';
  await ensure();
  await ensure();
  expect(requests).toBe(1);
  expect(getDesktopPermissionChoice('notifications')).toBe('requested');
});

test('системный запрет Windows обнаруживается даже когда плагин сообщает о разрешении', async () => {
  granted = true;
  nativePermission = false;
  expect(await ensure()).toBe(false);
  expect(requests).toBe(0);
  expect(checks).toBe(0);
  expect(getDesktopPermissionChoice('notifications')).toBe('denied');
  nativePermission = true;
  expect(await ensure({ interactive: true })).toBe(true);
  expect(requests).toBe(0);
});

test('отключение уведомлений во время проверки ОС не заменяется старым согласием', async () => {
  let checked!: (granted: boolean) => void;
  let started!: () => void;
  const checking = new Promise<void>(resolve => {
    started = resolve;
  });
  deferredCheck = () =>
    new Promise(resolve => {
      checked = resolve;
      started();
    });
  const pending = ensure();
  await checking;
  await saveDesktopPermissionChoice('notifications', 'denied');
  checked(true);
  expect(await pending).toBe(false);
  expect(getDesktopPermissionChoice('notifications')).toBe('denied');
});

test('ошибка регистрации Windows отличается от отсутствующей команды старой оболочки', async () => {
  nativeCheckFailed = true;
  granted = true;
  await ensure();
  const { desktopNotificationCheckFailed } = await import(
    '../src/services/desktop-notification-permissions'
  );
  expect(desktopNotificationCheckFailed.value).toBe(true);
  nativeCheckFailed = false;
  await ensure();
  expect(desktopNotificationCheckFailed.value).toBe(false);
});
