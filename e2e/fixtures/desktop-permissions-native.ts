import { invoke } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';
import { watch } from 'vue';
import {
  desktopMediaPermissionRequest,
  installDesktopMediaPermissions,
  resolveDesktopMediaPermission
} from '../../src/services/desktop-media-permissions';
import {
  DESKTOP_PERMISSION_STORAGE_KEY,
  getDesktopPermissionChoice,
  resetDesktopPermissionChoices,
  saveDesktopPermissionChoice
} from '../../src/services/desktop-permission-preferences';

const api = 'http://127.0.0.1:5211';
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
let phase = 0;
let prompts = 0;
try {
  phase = await (await fetch(`${api}/phase`)).json();
  if (phase === 2) localStorage.removeItem(DESKTOP_PERMISSION_STORAGE_KEY);
  if (phase === 3) {
    localStorage.setItem(
      DESKTOP_PERMISSION_STORAGE_KEY,
      JSON.stringify({ microphone: 'granted' })
    );
  }
  await installDesktopMediaPermissions();
  watch(desktopMediaPermissionRequest, request => {
    if (!request) return;
    prompts++;
    resolveDesktopMediaPermission(phase === 1);
  });
  if (phase < 3) {
    for (const constraints of [{ audio: true }, { audio: true, video: true }]) {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      assert(
        stream.getTracks().length,
        'WebView не получил тестовые медиатрeки'
      );
      stream.getTracks().forEach(track => track.stop());
    }
    assert(
      prompts === (phase === 1 ? 2 : 0),
      'Повторный запрос микрофона или камеры после перезапуска'
    );
    if (phase === 1) {
      await saveDesktopPermissionChoice('geolocation', 'granted');
      await saveDesktopPermissionChoice('clipboard-read', 'granted');
      await saveDesktopPermissionChoice('notifications', 'denied');
    }
    for (const permission of [
      'microphone',
      'camera',
      'geolocation',
      'clipboard-read'
    ] as const) {
      assert(
        getDesktopPermissionChoice(permission) === 'granted',
        `Не восстановлено разрешение: ${permission}`
      );
    }
    assert(
      getDesktopPermissionChoice('notifications') === 'denied',
      'Не восстановлен отказ уведомлений'
    );
    // QA не устанавливает ярлык приложения в Windows; настройка toast может ещё отсутствовать.
    await invoke('desktop_notification_permission').catch(() => null);
    if (phase === 2)
      assert(
        await resetDesktopPermissionChoices(),
        'Не выполнен сброс на диске'
      );
  } else {
    assert(
      !getDesktopPermissionChoice('microphone'),
      'Сброшенное согласие вернулось из старого WebView'
    );
    const allowed = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(
        () => true,
        () => false
      );
    assert(!allowed && prompts === 1, 'Сброс не потребовал нового согласия');
  }
  await fetch(`${api}/report`, {
    method: 'POST',
    body: JSON.stringify({
      phase,
      passed: true,
      prompts,
      fakeDevicesOnly: true
    })
  });
} catch (error) {
  await fetch(`${api}/report`, {
    method: 'POST',
    body: JSON.stringify({ phase, passed: false, error: String(error) })
  });
} finally {
  await exit(0);
}
