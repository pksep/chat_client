import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { createDesktopUpdater } from '../../src/services/desktop-updater';

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
  if (version === '1.6.101') {
    await report('restarted', {
      version,
      draft: localStorage.getItem('qa-draft'),
      session: localStorage.getItem('qa-session')
    });
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
      },
      relaunch
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
