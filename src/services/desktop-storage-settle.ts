import { isTauri } from '@tauri-apps/api/core';

export async function settleDesktopUpdateStorage(): Promise<void> {
  if (!isTauri() || !/mac/i.test(navigator.platform || navigator.userAgent))
    return;

  // WebKit откладывает транзакцию localStorage. Даём ей завершиться после
  // сохранения черновика, прежде чем установка и перезапуск остановят WebView.
  await new Promise<void>(resolve => window.setTimeout(resolve, 2000));
}
