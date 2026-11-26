import { getIdentifier, getName, getVersion } from '@tauri-apps/api/app';
import { appDataDir } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import { createDesktopUpdater } from '../../src/services/desktop-updater';
import { settleDesktopUpdateStorage } from '../../src/services/desktop-storage-settle';
import {
  persistDesktopRecovery,
  restoreDesktopRecovery
} from '../../src/services/desktop-recovery';

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
    origin: location.origin,
    href: location.href,
    ...(version === '1.6.101' ? storageState() : {})
  });
  const windows = /win/i.test(navigator.platform);
  if (
    version === '1.6.101' &&
    windows &&
    localStorage.getItem('qa-foreground-version') === version
  ) {
    const state = await invoke<{ visible: boolean }>('desktop_window_state');
    if (state.visible)
      throw new Error(
        'Обычный автозапуск повторно показал окно после обновления'
      );
    await report('autostart-hidden', state);
  } else if (version === '1.6.101') {
    if (/win/i.test(navigator.platform)) {
      const windowState = await invoke<{
        visible: boolean;
        minimized: boolean;
      }>('desktop_window_state');
      if (!windowState.visible || windowState.minimized)
        throw new Error('После обновления окно осталось в трее или свёрнутым');
      await report('foreground-after-update', windowState);
      // Только изолированный QA-профиль: имитируем потерю WebView storage.
      localStorage.setItem('chat_auth_session', 'synthetic-auth');
      localStorage.setItem('erp-theme-color-scheme', 'theme-dark');
      await persistDesktopRecovery();
      localStorage.removeItem('chat_auth_session');
      localStorage.removeItem('erp-theme-color-scheme');
      await restoreDesktopRecovery();
      if (
        localStorage.getItem('chat_auth_session') !== 'synthetic-auth' ||
        localStorage.getItem('erp-theme-color-scheme') !== 'theme-dark'
      ) {
        throw new Error('Не восстановлены вход и тема из защищённой копии');
      }
      localStorage.removeItem('chat_auth_session');
      await persistDesktopRecovery();
      await restoreDesktopRecovery();
      if (localStorage.getItem('chat_auth_session') !== null)
        throw new Error('Восстановлена сессия после выхода');
      await report('recovery-verified', {
        theme: 'theme-dark',
        logoutPreserved: true
      });
    }
    const next = await check();
    const repeatUpdate = !!next;
    await next?.close();
    if (repeatUpdate)
      throw new Error('Установленная версия снова предлагает обновление');
    if (windows) {
      localStorage.setItem('qa-foreground-version', version);
      await settleDesktopUpdateStorage();
    }
    await report('restarted', {
      version,
      draft: localStorage.getItem('qa-draft'),
      session: localStorage.getItem('qa-session'),
      repeatUpdate,
      ...(windows
        ? await invoke<Record<string, unknown>>('desktop_window_state')
        : {})
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
    localStorage.removeItem('qa-foreground-version');
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
    let installs = 0;
    let preparations = 0;
    const updater = createDesktopUpdater({
      check: async () => {
        const update = await check();
        if (!update) return null;
        return {
          version: update.version,
          download: onEvent => update.download(onEvent),
          close: () => update.close(),
          install: async () => {
            installs++;
            await update.install();
          }
        };
      },
      blockingReason: () => '',
      prepareToInstall: async () => {
        preparations++;
        localStorage.setItem(
          'qa-draft',
          'Несохранённый текст перед обновлением'
        );
        localStorage.setItem('qa-session', 'synthetic-session');
        void report('prepared', storageState());
        await settleDesktopUpdateStorage();
        if (/win/i.test(navigator.platform)) {
          await getCurrentWindow().minimize();
          await getCurrentWindow().close();
          await report(
            'hidden-before-update',
            await invoke('desktop_window_state')
          );
        }
      },
      relaunch: () => invoke('desktop_restart')
    });
    await updater.check();
    await report('downloaded', {
      phase: updater.state.value.phase,
      installs,
      preparations
    });
    if (updater.state.value.phase !== 'downloaded')
      throw new Error(updater.state.value.error);
    if (installs || preparations)
      throw new Error('Фоновая загрузка запустила установку без клика');
    await updater.act();
    if (updater.state.value.error) throw new Error(updater.state.value.error);
  }
} catch (error) {
  await report('failed', { message: String(error) }).catch(() => undefined);
}
