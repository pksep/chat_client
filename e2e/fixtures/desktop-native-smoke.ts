import { invoke, isTauri } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { suppressDefaultDesktopContextMenu } from '../../src/utils/desktop-context-menu';
import {
  ensureTauriWindowStateTracking,
  getIsAppActivelyVisible,
  syncTauriWindowState
} from '../../src/services/useAppVisibility';

const api = 'http://127.0.0.1:5210';
const report = async (step: string, details: Record<string, unknown>) => {
  const response = await fetch(`${api}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, ...details })
  });
  if (!response.ok) throw new Error(`Журнал проверки: HTTP ${response.status}`);
};
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

try {
  if (new URLSearchParams(location.search).has('links')) {
    const { verifyNativeCallLinks } = await import('./desktop-links-native');
    await verifyNativeCallLinks(report);
  }
  if (new URLSearchParams(location.search).has('shell')) {
    const { verifyNativeShell } = await import('./desktop-shell-native');
    const fixture = await (await fetch(`${api}/fixture`)).json();
    await verifyNativeShell(fixture.captureSourceTitle, report);
  }
  assert(isTauri(), 'Проверка требует настоящего Tauri');
  ensureTauriWindowStateTracking();
  await syncTauriWindowState();
  const appWindow = getCurrentWindow();
  const dispose = suppressDefaultDesktopContextMenu();
  let customMenuReceived = false;
  document.body.addEventListener('contextmenu', () => {
    customMenuReceived = true;
  });
  const contextEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true
  });
  document.body.dispatchEvent(contextEvent);
  assert(contextEvent.defaultPrevented, 'Стандартное меню не подавлено');
  assert(customMenuReceived, 'Собственное меню не получило событие');
  dispose();
  await report('context-menu', { passed: true, native: isTauri() });

  await appWindow.show();
  const beforeClose = await invoke<{ visible: boolean }>(
    'desktop_window_state'
  );
  assert(beforeClose.visible, 'Окно стенда не стало видимым');
  // Окно стенда закрывается штатным native событием, сохраняя процесс в трее.
  await appWindow.close();
  await new Promise(resolve => setTimeout(resolve, 200));
  await syncTauriWindowState();
  const state = await invoke<{ visible: boolean; focused: boolean }>(
    'desktop_window_state'
  );
  assert(!state.visible && !state.focused, 'Закрытое окно считается видимым');
  assert(!getIsAppActivelyVisible(), 'Закрытое окно считается активным');
  await report('close-to-tray', { passed: true, beforeClose, state });

  const fixture = await (await fetch(`${api}/fixture`)).json();
  const options = {
    url: `${api}/file`,
    fileName: fixture.fileName,
    mimeType: 'text/plain',
    size: fixture.size
  };
  const source = await invoke<{ path: string; downloaded: boolean }>(
    'desktop_file_register_source',
    { options, path: fixture.path, sha256: fixture.sha256 }
  );
  assert(source.downloaded, 'Исходный файл не зарегистрирован');
  const normalizedPath = (value: string) =>
    value.replace(/^\\\\\?\\/, '').toLowerCase();
  assert(
    normalizedPath(source.path) === normalizedPath(fixture.path),
    'Утерян исходный путь отправленного файла'
  );
  await fetch(`${api}/change-source`, { method: 'POST' });
  const changed = await invoke<{ downloaded: boolean }>('desktop_file_status', {
    options
  });
  assert(!changed.downloaded, 'Изменённый исходник считается прежним файлом');
  const downloaded = await invoke<{ path: string; downloaded: boolean }>(
    'desktop_file_download',
    { options }
  );
  assert(downloaded.downloaded, 'Нативное скачивание не завершено');
  const verify = await fetch(`${api}/verify-download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: downloaded.path })
  });
  assert(verify.ok, 'Содержимое скачанного файла не совпало');
  const removed = await invoke<{ downloaded: boolean }>('desktop_file_status', {
    options
  });
  assert(!removed.downloaded, 'Удалённый файл считается доступным');
  await report('native-files', {
    passed: true,
    originalPathPreserved: true,
    changedSourceDetected: true,
    downloadedBytesVerified: true,
    deletedDownloadDetected: true
  });
  let mediaPassed = true;
  if (new URLSearchParams(location.search).has('media')) {
    await appWindow.show();
    const { verifyPhysicalDevices } = await import('./desktop-devices-native');
    mediaPassed = await verifyPhysicalDevices(report);
    await appWindow.close();
  }
  await report('complete', { passed: mediaPassed, corePassed: true });
} catch (error) {
  await report('failed', { error: String(error) });
} finally {
  await exit(0);
}
