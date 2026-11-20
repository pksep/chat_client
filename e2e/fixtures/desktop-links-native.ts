import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { initDesktopCallLinks } from '../../src/services/useDesktopCallLinks';
import { flushPendingGroupCallInviteUrl } from '../../src/services/useCallKit';

export const verifyNativeCallLinks = async (
  report: (step: string, details: Record<string, unknown>) => Promise<void>
) => {
  const assert = (value: unknown, message: string) => {
    if (!value) throw new Error(message);
  };
  const initial = await invoke<string[] | null>('desktop_get_open_urls');
  assert(
    initial?.some(
      url => new URL(url).searchParams.get('callRoom') === 'native-cold-room'
    ),
    'Нативный первый запуск потерял ссылку на звонок'
  );
  await initDesktopCallLinks();
  const cold = new URL(location.href);
  assert(
    cold.searchParams.get('callRoom') === 'native-cold-room',
    'Первая ссылка не попала в клиент'
  );
  assert(
    cold.searchParams.get('organization') === 'https://old.example.invalid',
    'Первая ссылка потеряла организацию'
  );
  assert(
    !(await flushPendingGroupCallInviteUrl()),
    'Ссылка обрабатывается до входа'
  );
  await getCurrentWindow().close();
  const hidden = await invoke<{ visible: boolean }>('desktop_window_state');
  assert(!hidden.visible, 'Перед повторным запуском окно не скрыто в трей');
  await report('native-call-link-cold', {
    passed: true,
    initial,
    queuedBeforeLogin: true,
    hidden
  });

  const deadline = Date.now() + 20_000;
  while (
    new URL(location.href).searchParams.get('callRoom') !== 'native-warm-room'
  ) {
    if (Date.now() >= deadline)
      throw new Error(
        'Повторный запуск не передал ссылку в работающее приложение'
      );
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const warm = new URL(location.href);
  assert(
    warm.searchParams.get('callInvite') === 'native-warm-token',
    'Повторная ссылка потеряла токен'
  );
  assert(
    !warm.searchParams.has('organization'),
    'Повторная ссылка унаследовала чужую организацию'
  );
  assert(
    !(await flushPendingGroupCallInviteUrl()),
    'Повторная ссылка обрабатывается до входа'
  );
  const shown = await invoke<{ visible: boolean; minimized: boolean }>(
    'desktop_window_state'
  );
  assert(
    shown.visible && !shown.minimized,
    'Повторный запуск не вернул окно из трея'
  );
  await report('native-call-link-warm', {
    passed: true,
    organizationCleared: true,
    queuedBeforeLogin: true,
    shown
  });
  await getCurrentWindow().close();
  await report('native-app-open-ready', { passed: true });
  let reopened = false;
  const reopenDeadline = Date.now() + 20_000;
  while (!reopened && Date.now() < reopenDeadline) {
    const state = await invoke<{ visible: boolean; minimized: boolean }>(
      'desktop_window_state'
    );
    reopened = state.visible && !state.minimized;
    if (!reopened) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(reopened, 'Ссылка sepchat://open не вернула приложение из трея');
  assert(
    new URL(location.href).search === warm.search,
    'Открытие приложения изменило приглашение'
  );
  await report('native-app-open', { passed: true, reopened });
};
