import { beforeEach, expect, mock, test } from 'bun:test';

let granted = false;
let answer = 'denied';
let requests = 0;
let checks = 0;
let nativePermission: boolean | null = null;
let nativeCheckFailed = false;
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
    return granted;
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
const { getDesktopPermissionChoice } = await import(
  '../src/services/desktop-permission-preferences'
);

beforeEach(() => {
  granted = false;
  answer = 'denied';
  requests = 0;
  checks = 0;
  nativePermission = null;
  nativeCheckFailed = false;
  storage.clear();
});

test('отказ сохраняется и не вызывает новый запрос при следующей инициализации', async () => {
  expect(await ensure()).toBe(false);
  expect(await ensure()).toBe(false);
  expect(requests).toBe(1);
  expect(getDesktopPermissionChoice('notifications')).toBe('denied');
});

test('разрешение, включённое в ОС после отказа, обнаруживается без запроса', async () => {
  await ensure();
  granted = true;
  expect(await ensure()).toBe(true);
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
  expect(await ensure()).toBe(true);
  expect(requests).toBe(0);
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
