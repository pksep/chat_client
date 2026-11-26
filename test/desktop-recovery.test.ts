import { expect, mock, test } from 'bun:test';

const data = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    }
  },
  configurable: true
});
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Win32' },
  configurable: true
});
const calls: Array<{ command: string; args: any }> = [];
let saved: Record<string, string> = {};
mock.module('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    return saved;
  }
}));
const { persistDesktopRecovery, restoreDesktopRecovery } = await import(
  '../src/services/desktop-recovery'
);

test('восстанавливает вход, организацию и тему до запуска приложения только в пустой профиль', async () => {
  saved = {
    chat_auth_session: 'synthetic',
    'erp-theme-color-scheme': 'theme-dark',
    unrelated: 'ignored'
  };
  await restoreDesktopRecovery();
  expect(data.get('chat_auth_session')).toBe('synthetic');
  expect(data.get('erp-theme-color-scheme')).toBe('theme-dark');
  expect(data.has('unrelated')).toBe(false);
  data.set('erp-theme-color-scheme', 'theme-light');
  data.delete('chat_auth_session');
  await restoreDesktopRecovery();
  expect(data.has('chat_auth_session')).toBe(false);
  expect(data.get('erp-theme-color-scheme')).toBe('theme-light');
});

test('выход и выбор не запоминать удаляют авторизацию из копии, сохраняя тему', async () => {
  calls.length = 0;
  data.set('chat_auth_session', 'synthetic');
  const login = persistDesktopRecovery();
  data.delete('chat_auth_session');
  const logout = persistDesktopRecovery();
  await Promise.all([login, logout]);
  expect(calls.map(call => call.args.storage.chat_auth_session)).toEqual([
    'synthetic',
    undefined
  ]);
  expect(calls[1].args.storage['erp-theme-color-scheme']).toBe('theme-light');
});
