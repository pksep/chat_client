import { isTauri } from '@tauri-apps/api/core';
import { persistDesktopRecovery } from './desktop-recovery';

export async function settleDesktopUpdateStorage(): Promise<void> {
  if (!isTauri()) return;
  await persistDesktopRecovery();

  // WebKit откладывает транзакцию localStorage. Даём ей завершиться после
  // сохранения черновика, прежде чем установка и перезапуск остановят WebView.
  await new Promise<void>(resolve => window.setTimeout(resolve, 2000));
}
