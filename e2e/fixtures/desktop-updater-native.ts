import { getIdentifier, getName, getVersion } from '@tauri-apps/api/app';
import { appDataDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { createDesktopUpdater } from '../../src/services/desktop-updater';

declare const __QA_STORAGE_SETTLE_MS__: number;
const storageState = () => ({
  origin: location.origin,
  href: location.href,
  draft: localStorage.getItem('qa-draft'),
  session: localStorage.getItem('qa-session')
});

const report = async (stage: string, data = {}) => {
  document.body.textContent = stage;
  const response = await fetch('http://127.0.0.1:17883/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage, ...data })
  });
  if (!response.ok) throw new Error('Report failed');
};

try {
  const version = await getVersion();
  await report('started', {
    version,
    identifier: await getIdentifier(),
    name: await getName(),
    dataDir: await appDataDir(),
    ...storageState()
  });
  if (version === '1.6.101') {
    const next = await check();
    const repeatUpdate = !!next;
    await next?.close();
    if (repeatUpdate)
      throw new Error('Установленная версия снова предлагает обновление');
    await report('restarted', {
      version,
      draft: localStorage.getItem('qa-draft'),
      session: localStorage.getItem('qa-session'),
      repeatUpdate
    });
    if (/mac/i.test(navigator.platform)) {
      await getCurrentWindow().show();
      await getCurrentWindow().close();
      await new Promise(resolve => setTimeout(resolve, 200));
      const hidden = await invoke<{ visible: boolean }>('desktop_window_state');
      if (hidden.visible) throw new Error('Окно не скрылось в трей');
      await report('closed-to-tray', { hidden });
      const deadline = Date.now() + 20_000;
      let restored = false;
      while (Date.now() < deadline && !restored) {
        const state = await invoke<{ visible: boolean; minimized: boolean }>(
          'desktop_window_state'
        );
        restored = state.visible && !state.minimized;
        if (!restored) await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!restored)
        throw new Error('Повторное открытие macOS не вернуло окно');
      await report('reopened', { restored });
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
    }
  } else {
    const bad = await check();
    if (!bad || bad.version !== '1.6.101')
      throw new Error('Expected newer QA version');
    let rejected = false;
    try {
      await bad!.download();
    } catch (error) {
      rejected = /signature|verification|verify/i.test(String(error));
    }
    await bad?.close().catch(() => undefined);
    await report('invalid-signature', { rejected });
    if (!rejected) throw new Error('Invalid signature accepted');
    const updater = createDesktopUpdater({
      check: () => check(),
      blockingReason: () => '',
      prepareToInstall: async () => {
        localStorage.setItem(
          'qa-draft',
          'Несохранённый текст перед обновлением'
        );
        localStorage.setItem('qa-session', 'synthetic-session');
        void report('prepared', storageState());
        if (
          typeof __QA_STORAGE_SETTLE_MS__ !== 'undefined' &&
          __QA_STORAGE_SETTLE_MS__ > 0
        )
          await new Promise(resolve =>
            setTimeout(resolve, __QA_STORAGE_SETTLE_MS__)
          );
      },
      relaunch: () => invoke('desktop_restart')
    });
    await updater.check();
    await updater.act();
    await report('downloaded', { phase: updater.state.value.phase });
    if (updater.state.value.phase !== 'downloaded')
      throw new Error(updater.state.value.error);
    await updater.act();
    if (updater.state.value.error) throw new Error(updater.state.value.error);
  }
} catch (error) {
  await report('failed', { message: String(error) }).catch(() => undefined);
}
