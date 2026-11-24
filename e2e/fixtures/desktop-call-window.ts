import { createApp, h, nextTick, ref, watch } from 'vue';
import { createPinia } from 'pinia';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openDesktopCallWindow } from '../../src/services/desktop-call-window';
import DesktopTitleBar from '../../src/components/Desktop/DesktopTitleBar.vue';
import DesktopMediaPermissionDialog from '../../src/components/Desktop/DesktopMediaPermissionDialog.vue';
import DesktopScreenSharePicker from '../../src/components/Desktop/DesktopScreenSharePicker.vue';
import { installDesktopCallControls } from '../../src/services/desktop-call-controls';
import type { DesktopCallActions } from '../../src/components/Desktop/call-window-context';
import { showTauriCallActivityNotification } from '../../src/services/useTauriNotifications';
import * as call from '../../src/services/useCallState';
import { authedUser } from '../../src/composables/useAuth';
import { useThemeStore } from '../../src/stores/theme';
import { useTopics } from '../../src/composables/useTopics';
import {
  desktopMediaPermissionRequest,
  requestDesktopScreenCaptureConsent,
  resolveDesktopMediaPermission
} from '../../src/services/desktop-media-permissions';
import { saveDesktopPermissionChoice } from '../../src/services/desktop-permission-preferences';
import '../../src/assets/chat-container.css';
import { verifyDesktopMessageVisibility } from './desktop-message-visibility';
import {
  isDesktopWindowActive,
  readDesktopWindowState
} from '../../src/services/desktop-window-state';

const isWindowActive = (label: 'main' | 'call') =>
  readDesktopWindowState(label).then(isDesktopWindowActive);

const api = 'http://127.0.0.1:5213/report';
const exerciseNativeToasts = new URLSearchParams(location.search).has(
  'nativeToasts'
);
const report = async (data: Record<string, unknown>) => {
  const output = document.querySelector('output');
  if (output) output.textContent = JSON.stringify(data, null, 2);
  await fetch(api, { method: 'POST', body: JSON.stringify(data) }).catch(
    () => {}
  );
};
window.addEventListener(
  'error',
  event => void report({ error: event.message, stack: event.error?.stack })
);
window.addEventListener(
  'unhandledrejection',
  event => void report({ rejection: String(event.reason) })
);
const pinia = createPinia();
useThemeStore(pinia).setTheme(false);
authedUser.value = { id: 'local-preview', initials: 'Вы' } as any;
call.user.value = {
  id: 'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f',
  initials: 'Проверка звонка'
} as any;
call.roomId.value = 'e641f474-1b51-4cec-ac54-b9c752de8ed6';
call.topicId.value = 'local-call-topic';
useTopics().setTopics([
  { id: 'local-call-topic', type: 'GROUP', name: 'Локальная проверка' } as any
]);
call.state.connectionQuality = 'excellent';
let audio: AudioContext | null = null;
let track: MediaStreamTrack | null = null;
let oscillator: OscillatorNode | null = null;
let gain: GainNode | null = null;
let microphoneCaptures = 0;
let host: Awaited<ReturnType<typeof openDesktopCallWindow>>;
let endCount = 0;
const activityNotifications: any[] = [];
const menuReactions: string[] = [];
const status = ref('Подготовка окна звонка…');
const fixtureActions: DesktopCallActions = {
  toggleMic: () => {
    call.state.isMicActive = !call.state.isMicActive;
    if (track) track.enabled = call.state.isMicActive;
  },
  leaveCall: async () => {
    endCount++;
    call.open.value = false;
    call.isModalVisible.value = false;
    const current = host;
    host = null;
    await current?.dispose();
  },
  toggleVideo: () => {
    call.state.isVideoActive = !call.state.isVideoActive;
  },
  toggleScreenShare: () => {
    call.state.isScreenSharingActive = !call.state.isScreenSharingActive;
  },
  toggleHandRaise: () => {
    call.state.isHandRaised = !call.state.isHandRaised;
  },
  sendCallReaction: reaction => {
    menuReactions.push(reaction);
  },
  switchCamera: () => {},
  acceptCall: () => {
    call.isIncoming.value = false;
  }
};
const open = async () => {
  if (host) {
    call.isModalVisible.value = true;
    await host.show();
    return;
  }
  call.open.value = true;
  call.isModalVisible.value = true;
  host = await openDesktopCallWindow({
    appContext: app._context,
    signal: new AbortController().signal,
    getMicrophoneTrack: () => track,
    notifyActivity: async activity => {
      if (exerciseNativeToasts) {
        if (
          !(await showTauriCallActivityNotification({
            ...activity,
            participantName: 'Проверка уведомления'
          }))
        )
          throw new Error('Windows не приняла уведомление');
        await report({
          step: 'native-toast',
          kind: activity.kind,
          accepted: true
        });
      }
      activityNotifications.push(activity);
      return true;
    },
    actions: fixtureActions
  });
  if (!host) throw new Error('Нативное окно звонка недоступно');
  await host.show();
  status.value = 'Окно звонка открыто. Микрофон выключен.';
};
const useMicrophone = async () => {
  try {
    if (track) track.stop();
    oscillator?.stop();
    oscillator = null;
    audio && (await audio.close());
    audio = null;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneCaptures++;
    track = stream.getAudioTracks()[0];
    track.enabled = true;
    call.state.isMicActive = true;
    status.value =
      'Реальный микрофон включён: говорите и проверяйте зелёную волну.';
    await host?.show();
  } catch (error) {
    status.value = String(error);
  }
};
const app = createApp({
  render: () => [
    h(DesktopTitleBar),
    h(DesktopMediaPermissionDialog),
    h(DesktopScreenSharePicker),
    h(
      'main',
      {
        style:
          'padding:32px;color:var(--text-primary);background:var(--surface-main);height:100%;box-sizing:border-box'
      },
      [
        h('h1', 'Локальная проверка звонка Tauri'),
        h('p', status.value),
        h(
          'p',
          'Проверьте сворачивание, разворачивание и полноэкранный режим отдельного окна. Закрытие окна завершает тестовый звонок.'
        ),
        h('button', { onClick: open }, 'Открыть окно звонка'),
        h(
          'button',
          { onClick: useMicrophone, style: 'margin-left:20px' },
          'Включить настоящий микрофон'
        ),
        h('output', {
          style: 'display:block;white-space:pre-wrap;margin-top:24px'
        })
      ]
    )
  ]
});
app.use(pinia).mount(document.body.appendChild(document.createElement('div')));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (
  test: () => boolean | Promise<boolean>,
  description: string
) => {
  const deadline = Date.now() + 12_000;
  while (!(await test())) {
    if (Date.now() > deadline) throw new Error(description);
    await sleep(20);
  }
};
const click = (selector: string) => {
  const button = host?.popup.document.querySelector<HTMLButtonElement>(
    selector.startsWith('[') ? `button${selector}` : selector
  );
  if (!button) throw new Error(`Не найдена кнопка ${selector}`);
  button.click();
};
const verify = async () => {
  await installDesktopCallControls({ actions: fixtureActions });
  if (exerciseNativeToasts) {
    await verifyDesktopMessageVisibility(report);
    call.topicId.value = 'local-call-topic';
    useTopics().setTopics([
      {
        id: 'local-call-topic',
        type: 'GROUP',
        name: 'Локальная проверка'
      } as any
    ]);
  }
  call.isIncoming.value = true;
  await open();
  const active = host!;
  const native = active.context.nativeWindow;
  const main = getCurrentWindow();
  const doc = active.popup.document;
  await wait(
    () => !!doc.querySelector('[data-testid="DesktopTitleBar"]'),
    'Нет шапки дочернего окна'
  );
  if (document.querySelector('.call-modal'))
    throw new Error('Звонок продублирован в главном окне');
  if (doc.querySelector('.desktop-titlebar [aria-label="Полноэкранный режим"]'))
    throw new Error('В хедере осталась кнопка fullscreen');
  const incomingSize = (await native.innerSize()).toLogical(
    await native.scaleFactor()
  );
  if (
    Math.abs(incomingSize.width - 700) > 1 ||
    Math.abs(incomingSize.height - 606) > 1
  )
    throw new Error('Размер звонка отличается от веб-модалки с учётом шапки');
  const answer = doc.querySelector<HTMLButtonElement>(
    '.call-modal__control-button--answer'
  )!;
  if (
    !answer ||
    answer.getBoundingClientRect().bottom > active.popup.innerHeight
  )
    throw new Error('Кнопка принятия обрезана');
  await report({
    step: 'compact-incoming',
    passed: true,
    size: { width: incomingSize.width, height: incomingSize.height }
  });
  answer.click();
  await wait(async () => {
    const size = (await native.innerSize()).toLogical(
      await native.scaleFactor()
    );
    return (
      Math.abs(size.width - incomingSize.width) <= 1 &&
      Math.abs(size.height - incomingSize.height) <= 1
    );
  }, 'Принятие звонка изменило размер модалки');
  await report({ step: 'shared-window', passed: true, childTitle: doc.title });
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const painter = canvas.getContext('2d')!;
  const paint = () => {
    painter.fillStyle = '#245bd8';
    painter.fillRect(0, 0, 640, 360);
    painter.fillStyle = '#ffffff';
    painter.font = '28px sans-serif';
    painter.fillText('Видео из основного окна', 100, 165);
    painter.font = '18px sans-serif';
    painter.fillText(new Date().toLocaleTimeString(), 260, 210);
  };
  paint();
  const videoStream = canvas.captureStream(10);
  const painting = setInterval(paint, 100);
  call.remoteParticipants.value = [
    {
      identity: 'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f',
      name: 'Проверка видео',
      videoStream,
      cameraStream: videoStream,
      screenShareStream: null,
      audioStream: null,
      isVideoActive: true,
      isScreenShareActive: false,
      isHandRaised: false,
      activeReaction: null,
      activeReactionExpiresAt: null,
      isSpeaking: false,
      audioLevel: 0,
      isMicActive: false,
      connectionQuality: 'excellent'
    }
  ];
  await wait(
    () =>
      Array.from(doc.querySelectorAll('video')).some(
        video => video.videoWidth === 640 && video.currentTime > 0
      ),
    'Видео из основного окна не воспроизводится в дочернем'
  );
  await report({ step: 'shared-video', passed: true });
  click('[aria-label="Свернуть"]');
  await wait(() => native.isMinimized(), 'Не сворачивается окно звонка');
  if (await main.isMinimized()) throw new Error('Свернулось главное окно');
  await native.unminimize();
  click('[aria-label="Развернуть"]');
  await wait(() => native.isMaximized(), 'Не разворачивается окно звонка');
  await wait(
    () => !!doc.querySelector('[aria-label="Восстановить размер"]'),
    'Кнопка восстановления не обновилась'
  );
  click('[aria-label="Восстановить размер"]');
  await wait(
    async () => !(await native.isMaximized()),
    'Не восстановился размер звонка'
  );
  doc
    .querySelector<HTMLElement>(
      '.call-modal__remote-tile:not(.call-modal__remote-tile--local)'
    )!
    .click();
  await wait(
    () => !!doc.querySelector('button[title="Видео fullscreen"]'),
    'Нет кнопки fullscreen внутри видео'
  );
  click('[title="Видео fullscreen"]');
  await wait(() => native.isFullscreen(), 'Нет системного fullscreen');
  await wait(
    () =>
      !doc.documentElement.classList.contains('chat-desktop-custom-chrome') &&
      !doc.querySelector('[data-testid="DesktopTitleBar"]'),
    'Шапка не скрылась в полноэкранном видео'
  );
  const videoBounds = doc
    .querySelector('.call-modal__video-overlay')!
    .getBoundingClientRect();
  if (
    videoBounds.top !== 0 ||
    Math.abs(videoBounds.height - active.popup.innerHeight) > 1
  )
    throw new Error('Видео не занимает весь экран');
  if (await main.isFullscreen())
    throw new Error('Главное окно перешло в fullscreen');
  doc.dispatchEvent(
    new active.popup.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  await wait(
    async () => !(await native.isFullscreen()),
    'Escape не вышел из системного fullscreen'
  );
  await wait(
    () => !doc.querySelector('.call-modal__video-overlay'),
    'Escape не закрыл полноэкранное видео'
  );
  click('[title="Видео fullscreen"]');
  await wait(() => native.isFullscreen(), 'Повторный fullscreen не работает');
  click('.call-modal__video-overlay-actions button:last-child');
  await wait(
    async () => !(await native.isFullscreen()),
    'Кнопка возврата из видео не восстановила окно'
  );
  await sleep(500);
  await report({ step: 'native-controls', passed: true });
  await active.show();
  const openContext = async () => {
    await nextTick();
    doc.dispatchEvent(
      new active.popup.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: active.popup.innerWidth - 10,
        clientY: active.popup.innerHeight - 10
      })
    );
    await wait(
      () => !!doc.querySelector('[data-testid="DesktopCallContextMenu"]'),
      'Меню по правому клику не появилось'
    );
  };
  await openContext();
  const menuBounds = doc
    .querySelector('[data-testid="DesktopCallContextMenu"]')!
    .getBoundingClientRect();
  if (
    menuBounds.right > active.popup.innerWidth ||
    menuBounds.bottom > active.popup.innerHeight
  )
    throw new Error('Меню выходит за край окна звонка');
  await report({ step: 'context-menu', passed: true });
  click('.desktop-call-context-menu button[aria-label="Включить камеру"]');
  if (!call.state.isVideoActive) throw new Error('Меню не включило камеру');
  await openContext();
  click('.desktop-call-context-menu button[aria-label="Выключить камеру"]');
  await openContext();
  doc.dispatchEvent(
    new active.popup.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  if (!call.isModalVisible.value || active.context.contextMenuOpen.value)
    throw new Error('Escape меню скрыл звонок');
  await openContext();
  click('.desktop-call-context-menu button[aria-label="Нравится"]');
  if (menuReactions.join() !== 'thumbs-up')
    throw new Error('Реакция из меню не отправлена');
  const settings =
    doc.querySelector<HTMLButtonElement>(
      'button[aria-label="Информация о звонке"]'
    ) ||
    doc.querySelector<HTMLButtonElement>(
      'button[aria-label="Открыть меню звонка"]'
    );
  settings!.click();
  await wait(
    () =>
      Array.from(doc.querySelectorAll('button')).some(
        button => button.textContent?.trim() === 'Настройки'
      ) || !!doc.querySelector('.call-modal__group-panel-copy'),
    'Не открылись настройки звонка'
  );
  Array.from(doc.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === 'Настройки')
    ?.click();
  await wait(
    () =>
      Array.from(doc.querySelectorAll('button')).some(
        button => button.textContent?.trim() === 'Перейти в чат'
      ),
    'Нет перехода в чат'
  );
  Array.from(doc.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === 'Перейти в чат')!
    .click();
  await wait(() => isWindowActive('main'), 'Переход в чат не сменил фокус');
  if (
    !location.pathname.endsWith('/group/local-call-topic') ||
    !call.isModalVisible.value ||
    !(await native.isVisible()) ||
    active.popup.closed
  )
    throw new Error('Переход в чат скрыл окно звонка или выбрал другой топик');
  await native.minimize();
  call.requestCallPresentation();
  await wait(
    async () => (await isWindowActive('call')) && !(await native.isMinimized()),
    'Возврат из хедера не восстановил окно звонка'
  );
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': true
  };
  await nextTick();
  await sleep(100);
  if (activityNotifications.length)
    throw new Error('Уведомление появилось поверх активного звонка');
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': false
  };
  await nextTick();
  await active.context.showMain();
  await wait(
    async () => !(await isWindowActive('call')),
    'Звонок не потерял фокус'
  );
  const { emit } = await import('@tauri-apps/api/event');
  await emit('sep-chat://call-device-action', 'camera');
  await wait(() => call.state.isVideoActive, 'Трей не включил камеру');
  await emit('sep-chat://call-device-action', 'camera');
  await wait(() => !call.state.isVideoActive, 'Трей не выключил камеру');
  await emit('sep-chat://call-device-action', 'screen');
  await wait(
    () => call.state.isScreenSharingActive,
    'Трей не включил демонстрацию'
  );
  await emit('sep-chat://call-device-action', 'screen');
  await wait(
    () => !call.state.isScreenSharingActive,
    'Трей не выключил демонстрацию'
  );
  await report({ step: 'tray-call-controls', passed: true });
  await active.context.showMain();
  await wait(
    async () => !(await isWindowActive('call')),
    'Звонок не потерял фокус после трея'
  );
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': true
  };
  await wait(
    () => activityNotifications.length === 1,
    'Нет уведомления о руке при активном главном чате'
  );
  const reaction = {
    reaction: 'heart' as const,
    expiresAt: Date.now() + 10_000
  };
  call.participantReactions.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': reaction
  };
  await wait(
    () => activityNotifications.length === 2,
    'Нет уведомления о реакции'
  );
  call.participantReactions.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': { ...reaction },
    'local-preview': reaction
  };
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': true,
    'local-preview': true
  };
  await nextTick();
  await sleep(100);
  if (activityNotifications.length !== 2)
    throw new Error(
      'Повторная или собственная реакция дала лишнее уведомление'
    );
  await native.minimize();
  await wait(() => native.isMinimized(), 'Звонок не свернулся для уведомлений');
  call.handRaisedParticipants.value = {};
  call.participantReactions.value = {};
  await nextTick();
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': true
  };
  call.participantReactions.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': {
      reaction: 'thumbs-up',
      expiresAt: Date.now() + 10_000
    }
  };
  await wait(
    () => activityNotifications.length === 4,
    'Нет руки и реакции при свёрнутом звонке'
  );
  await main.minimize();
  await wait(() => main.isMinimized(), 'Главный чат не свернулся');
  call.handRaisedParticipants.value = {};
  call.participantReactions.value = {};
  await nextTick();
  call.handRaisedParticipants.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': true
  };
  call.participantReactions.value = {
    'ac7dbd0b-6e93-41ad-acf5-4e3b1dcc6a6f': {
      reaction: 'joy',
      expiresAt: Date.now() + 10_000
    }
  };
  await wait(
    () => activityNotifications.length === 6,
    'Нет руки и реакции, когда свёрнуты оба окна'
  );
  await emit('sep-chat://call-device-action', 'microphone');
  await wait(() => call.state.isMicActive, 'Трей не включил микрофон');
  await native.minimize();
  await emit('sep-chat://call-device-action', 'microphone');
  await wait(() => !call.state.isMicActive, 'Трей не выключил микрофон');
  if (!(await native.isMinimized()))
    throw new Error('Выключение микрофона неожиданно восстановило окно звонка');
  await main.unminimize();
  await report({
    step: 'focus-navigation-activity',
    passed: true,
    events: activityNotifications.map(({ kind, participantId }) => ({
      kind,
      participantId
    }))
  });
  call.requestCallPresentation();
  await wait(
    () => isWindowActive('call'),
    'Окно звонка не получило фокус повторно'
  );
  await saveDesktopPermissionChoice('screen-capture', 'denied');
  const screenPermission = requestDesktopScreenCaptureConsent();
  await wait(
    () =>
      !!doc.querySelector('[data-testid="DesktopMediaPermissionDialog"]:modal'),
    'Нет запроса демонстрации в окне звонка'
  );
  await report({ step: 'screen-permission', passed: true });
  Array.from(
    doc.querySelectorAll<HTMLButtonElement>(
      '[data-testid="DesktopMediaPermissionDialog"] button'
    )
  )
    .find(button => button.textContent?.trim() === 'Не сейчас')!
    .click();
  if (await screenPermission) throw new Error('Отказ разрешил демонстрацию');
  audio = new AudioContext();
  await audio.resume();
  oscillator = audio.createOscillator();
  gain = audio.createGain();
  gain.gain.value = 0.15;
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  track = destination.stream.getAudioTracks()[0];
  track.enabled = false;
  await sleep(150);
  await wait(
    () => !!audio && audio.currentTime > 0.08,
    'Тестовый источник звука не запустился'
  );
  await report({
    step: 'signal-prepared',
    audio: audio.state,
    audioTime: audio.currentTime
  });
  await main.hide();
  const started = performance.now();
  let latencyMs = Infinity;
  const stopLatency = watch(
    active.context.microphoneLevel,
    level => {
      if (level > 0.03 && !Number.isFinite(latencyMs))
        latencyMs = performance.now() - started;
    },
    { flush: 'sync' }
  );
  click('[aria-label="Включить микрофон"]');
  await wait(
    () => active.context.microphoneLevel.value > 0.03,
    'Нет локального уровня звука при скрытом чате'
  );
  stopLatency();
  if (latencyMs > 250) throw new Error(`Задержка индикатора ${latencyMs} мс`);
  await nextTick();
  await wait(
    () => !!doc.querySelector('.mic-icon__audio-wave[opacity="1"]'),
    'Зелёная волна не появилась'
  );
  const wave = doc.querySelector('.mic-icon__audio-wave')!.getAttribute('d');
  await sleep(120);
  if (wave === doc.querySelector('.mic-icon__audio-wave')!.getAttribute('d'))
    throw new Error('Волна замерла при скрытом чате');
  click('[aria-label="Выключить микрофон"]');
  await wait(
    () => active.context.microphoneLevel.value === 0,
    'Индикатор не сбросился после mute'
  );
  if (microphoneCaptures) throw new Error('Индикатор повторно запросил захват');
  await main.show();
  await report({
    step: 'immediate-microphone',
    passed: true,
    latencyMs,
    captures: microphoneCaptures,
    sourceTrack: track.readyState
  });
  desktopMediaPermissionRequest.value = { permissions: ['microphone'] } as any;
  await wait(
    () =>
      !!doc.querySelector('[data-testid="DesktopMediaPermissionDialog"]:modal'),
    'Разрешение не перенесено в окно звонка'
  );
  resolveDesktopMediaPermission(false);
  await nextTick();
  await main.close();
  await wait(
    async () => !(await main.isVisible()),
    'Главное окно не скрылось в трей'
  );
  if (!(await native.isVisible()) || !call.open.value)
    throw new Error('Звонок пропал при закрытии главного окна');
  await main.show();
  click('[aria-label="Закрыть окно"]');
  await wait(
    () => !call.open.value && !host,
    'Закрытие звонка не завершило вызов'
  );
  await sleep(200);
  if (endCount !== 1 || track.readyState !== 'live')
    throw new Error('Повторное завершение/индикатор остановил RTC-track');
  if (!document.querySelector('[data-testid="DesktopMediaPermissionDialog"]'))
    throw new Error('Разрешения не возвращены в главное окно');
  await report({
    step: 'lifecycle',
    passed: true,
    endCount,
    sourceTrack: track.readyState
  });
  await open();
  clearInterval(painting);
  videoStream.getTracks().forEach(item => item.stop());
  call.remoteParticipants.value = [];
  await report({ step: 'complete', passed: true, preview: true });
};
try {
  await verify();
} catch (error) {
  await report({
    passed: false,
    error: String(error),
    stack: (error as Error)?.stack
  });
}
Object.assign(window, {
  callWindowFixture: {
    get host() {
      return host;
    },
    open,
    useMicrophone
  }
});
