import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { openDesktopCallWindow } from '../../src/services/desktop-call-window';
import { authedUser } from '../../src/composables/useAuth';
import { setConfig } from '../../src/services/useConfig';
import { useTopics } from '../../src/composables/useTopics';
import { useThemeStore } from '../../src/stores/theme';
import * as call from '../../src/services/useCallState';
import '../../src/assets/chat-container.css';

setConfig({ CHAT_API_DOMAIN: location.origin + '/synthetic-only' });
authedUser.value = { id: 'local-portability', initials: 'Вы' } as any;
const app = createApp({
  render: () => h('p', 'Синтетическая проверка отдельного окна звонка')
});
const pinia = createPinia();
app.use(pinia).mount(document.body.appendChild(document.createElement('main')));
useThemeStore(pinia).setTheme(false);
useTopics().setTopics([
  { id: 'local-portability-topic', type: 'GROUP', name: 'Проверка окна' } as any
]);
call.topicId.value = 'local-portability-topic';
call.roomId.value = 'local-portability-room';
call.user.value = {
  id: 'local-participant-1',
  initials: 'Синтетический участник'
} as any;
call.state.connectionQuality = 'excellent';
call.isIncoming.value = true;
call.open.value = true;
call.isModalVisible.value = true;
call.remoteParticipants.value = Array.from({ length: 8 }, (_, i) => ({
  identity: `local-participant-${i + 1}`,
  name: `Участник ${i + 1}`,
  videoStream: null,
  cameraStream: null,
  screenShareStream: null,
  audioStream: null,
  isVideoActive: false,
  isScreenShareActive: false,
  isHandRaised: false,
  activeReaction: null,
  activeReactionExpiresAt: null,
  isSpeaking: false,
  audioLevel: 0,
  isMicActive: false,
  connectionQuality: 'excellent'
}));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check: () => boolean | Promise<boolean>, label: string) {
  const until = Date.now() + 10_000;
  while (!(await check())) {
    if (Date.now() >= until) throw new Error(label);
    await sleep(30);
  }
}
const report = (value: unknown) =>
  fetch('http://127.0.0.1:5213/report', {
    method: 'POST',
    body: JSON.stringify(value)
  });
window.addEventListener(
  'unhandledrejection',
  e => void report({ passed: false, error: String(e.reason) })
);
window.addEventListener(
  'error',
  e => void report({ passed: false, error: e.message })
);
let host: Awaited<ReturnType<typeof openDesktopCallWindow>>;
let endCount = 0;
const options = {
  appContext: app._context,
  signal: new AbortController().signal,
  actions: {
    acceptCall: () => {
      call.isIncoming.value = false;
    },
    leaveCall: () => {
      endCount++;
      call.open.value = false;
    },
    toggleMic: () => {
      call.state.isMicActive = !call.state.isMicActive;
    }
  }
};
try {
  await report({ step: 'fixture-start', passed: true });
  // Входящий вызов должен открываться без нажатия пользователя.
  await sleep(600);
  await report({ step: 'version-probe-request' });
  await report({ step: 'version-probe-response', version: await getVersion() });
  await report({ step: 'capabilities-probe-request' });
  await report({
    step: 'capabilities-probe-response',
    capabilities: await invoke('desktop_call_window_capabilities')
  });
  const activation = navigator.userActivation?.isActive || false;
  host = await openDesktopCallWindow(options);
  if (!host) throw new Error('Отдельное окно недоступно');
  await host.show();
  const doc = host.popup.document;
  await wait(
    () => !!doc.querySelector('[data-testid="DesktopTitleBar"]'),
    'Нет шапки звонка'
  );
  await sleep(400);
  if (!doc.querySelector('.call-modal'))
    throw new Error('DOM окна потерян после навигации');
  const capabilities = await invoke<any>('desktop_call_window_capabilities');
  const readPin = () =>
    capabilities.os === 'linux'
      ? invoke<boolean>('desktop_call_window_pinned')
      : host!.context.nativeWindow.isAlwaysOnTop();
  const readFullscreen = () =>
    capabilities.os === 'linux' && capabilities.pinSupported
      ? invoke<boolean>('desktop_call_window_fullscreen')
      : host!.context.nativeWindow.isFullscreen();
  await report({
    step: 'incoming-without-activation',
    passed: true,
    activation,
    capabilities,
    opener: host.popup.opener === window,
    documentUrl: doc.URL
  });
  doc
    .querySelector<HTMLButtonElement>('.call-modal__control-button--answer')!
    .click();
  const pin = doc.querySelector<HTMLButtonElement>('.desktop-titlebar__pin')!;
  if (!pin) throw new Error('Нет кнопки пина');
  if (host.context.pinSupported) {
    const toggle = host.context.toggleAlwaysOnTop;
    host.context.toggleAlwaysOnTop = async () => {
      try {
        await toggle();
      } catch (error) {
        await report({
          step: 'pin-failure-detail',
          passed: false,
          error: String(error),
          actual: await readPin()
        });
        throw error;
      }
    };
    pin.click();
    await sleep(150);
    await report({
      step: 'pin-observed',
      supported: host.context.pinSupported,
      changing: host.context.pinChanging.value,
      native: await readPin(),
      pressed: pin.getAttribute('aria-pressed'),
      disabled: pin.disabled
    });
    await wait(() => host!.context.alwaysOnTop.value, 'Пин не включился');
    if (!(await readPin())) throw new Error('ОС не закрепила окно');
    await host.context.showMain();
    if (!(await readPin())) throw new Error('Пин потерялся после смены фокуса');
    await host.show();
    for (let cycle = 1; cycle <= 3; cycle++) {
      await host.context.setFullscreen(true);
      await wait(readFullscreen, 'Нет fullscreen');
      await host.context.setFullscreen(false);
      await wait(
        async () => !(await readFullscreen()),
        'Fullscreen не завершился'
      );
      await wait(readPin, 'Пин не восстановлен после fullscreen');
      await report({ step: 'fullscreen-cycle', cycle, passed: true });
    }
    pin.click();
    await wait(() => !host!.context.alwaysOnTop.value, 'Пин не выключился');
  } else {
    if (!pin.disabled || pin.getAttribute('aria-pressed') !== 'false')
      throw new Error('Неподдерживаемый пин показан активным');
    await host.context.setFullscreen(true);
    if (!(await host.context.nativeWindow.isFullscreen()))
      throw new Error('Нет fullscreen без пина');
    await host.context.setFullscreen(false);
    if (await host.context.nativeWindow.isFullscreen())
      throw new Error('Fullscreen без пина не завершился');
  }
  await report({
    step: 'native-pin',
    passed: true,
    supported: host.context.pinSupported
  });
  const largeSize = new LogicalSize(
    Math.min(1400, screen.availWidth),
    Math.min(950, screen.availHeight - 40)
  );
  await host.context.nativeWindow.setSize(largeSize);
  await sleep(1200);
  await host.context.nativeWindow.setSize(largeSize);
  await host.context.nativeWindow.center().catch(() => undefined);
  await sleep(300);
  const area = doc
    .querySelector('.call-modal__participants-panel--grid')
    ?.getBoundingClientRect();
  await report({
    step: 'native-resized',
    viewport: { width: host.popup.innerWidth, height: host.popup.innerHeight },
    screen: { width: screen.width, height: screen.height },
    area: area?.toJSON(),
    count: doc.querySelectorAll('.call-modal__remote-tile').length
  });
  const expectedTiles = area && area.width >= 924 && area.height >= 534 ? 9 : 6;
  await wait(
    () =>
      doc.querySelectorAll('.call-modal__remote-tile').length === expectedTiles,
    `Неверное число участников для фактической области окна: нужно ${expectedTiles}`
  );
  const tiles = [...doc.querySelectorAll('.call-modal__remote-tile')].map(t => {
    const b = t.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  if (tiles.some(t => t.y < 0 || t.y + t.height > host!.popup.innerHeight))
    throw new Error('Плитки обрезаны');
  await report({
    step: 'native-grid',
    passed: true,
    expectedTiles,
    nineLimitedByScreen: expectedTiles !== 9,
    tiles,
    viewport: { width: host.popup.innerWidth, height: host.popup.innerHeight }
  });
  await host.dispose();
  await report({ step: 'first-disposed', passed: true });
  host = await openDesktopCallWindow(options);
  if (!host) throw new Error('Повторный звонок не открылся');
  await host.show();
  if (host.context.alwaysOnTop.value)
    throw new Error('Новый звонок унаследовал пин');
  await host.dispose();
  if (endCount) throw new Error('Техническое закрытие завершило звонок');
  await report({ step: 'native-call-complete', passed: true });
  // Новый документ проверяет UI отдельно от графа модулей звонка.
  location.replace('/e2e/fixtures/desktop-ui-regressions.html');
} catch (error) {
  await report({
    passed: false,
    error: String(error),
    stack: (error as Error).stack
  });
}
