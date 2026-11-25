import { invoke, isTauri } from '@tauri-apps/api/core';

export const desktopRecoveryKeys = [
  'chat_auth_session',
  'erp_bootstrap_token',
  'chat_qr_bootstrap_source',
  'erp-theme-color-scheme',
  'chat_runtime_organizations',
  'chat_runtime_last_organization'
] as const;
let writes: Promise<unknown> = Promise.resolve();
const supported = () =>
  isTauri() &&
  typeof navigator !== 'undefined' &&
  /win/i.test(navigator.platform);
const snapshot = () =>
  Object.fromEntries(
    desktopRecoveryKeys.flatMap(key => {
      const value = localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    })
  );

export async function restoreDesktopRecovery(): Promise<void> {
  if (!supported()) return;
  try {
    const current = snapshot();
    const saved = await invoke<Record<string, string>>(
      'desktop_restore_recovery',
      { current }
    );
    for (const key of desktopRecoveryKeys) {
      if (
        (!Object.keys(current).length || key === 'erp-theme-color-scheme') &&
        localStorage.getItem(key) === null &&
        typeof saved[key] === 'string'
      ) {
        localStorage.setItem(key, saved[key]);
      }
    }
  } catch {
    console.warn('Не удалось восстановить резервную копию настроек приложения');
  }
}

export function persistDesktopRecovery(): Promise<unknown> {
  if (!supported()) return Promise.resolve();
  const storage = snapshot();
  const next = writes
    .catch(() => undefined)
    .then(() => invoke('desktop_save_recovery', { storage }));
  writes = next;
  void next.catch(() =>
    console.warn('Не удалось сохранить резервную копию настроек приложения')
  );
  return next;
}
