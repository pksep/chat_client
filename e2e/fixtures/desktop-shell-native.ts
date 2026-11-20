import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopMediaPermissionRequest } from '../../src/services/desktop-media-permissions';
import { prepareDesktopScreenCapture } from '../../src/services/desktop-screen-capture';
import './desktop-shell';

const waitFor = async (
  check: () => boolean | Promise<boolean>,
  description: string
) => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(description);
};
const click = (selector: string) => {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) throw new Error(`Кнопка не найдена: ${selector}`);
  button.click();
};

export const verifyNativeShell = async (
  captureSourceTitle: string,
  report: (step: string, payload: Record<string, unknown>) => Promise<void>
) => {
  const appWindow = getCurrentWindow();
  await appWindow.show();
  await waitFor(
    () => !!document.querySelector('[data-testid="DesktopTitleBar"]'),
    'Шапка не появилась'
  );
  if (await appWindow.isDecorated())
    throw new Error('Системная рамка не отключена');
  click('[aria-label="Свернуть"]');
  await waitFor(() => appWindow.isMinimized(), 'Кнопка не свернула окно');
  await appWindow.unminimize();
  click('[aria-label="Развернуть"]');
  await waitFor(() => appWindow.isMaximized(), 'Кнопка не развернула окно');
  await waitFor(
    () => !!document.querySelector('[aria-label="Восстановить размер"]'),
    'Кнопка восстановления не обновилась'
  );
  click('[aria-label="Восстановить размер"]');
  await waitFor(
    async () => !(await appWindow.isMaximized()),
    'Кнопка не восстановила окно'
  );
  await report('native-titlebar', { passed: true });

  const denied = navigator.mediaDevices.getUserMedia({ audio: true }).then(
    stream => {
      stream.getTracks().forEach(track => track.stop());
      return false;
    },
    error => error.name === 'NotAllowedError'
  );
  await waitFor(
    () => !!desktopMediaPermissionRequest.value,
    'Не появился запрос микрофона'
  );
  click(
    '[data-testid="DesktopMediaPermissionDialog"] .desktop-media-permission__close'
  );
  if (!(await denied)) throw new Error('Отказ не остановил запрос микрофона');
  for (const constraints of [{ audio: true }, { audio: true, video: true }]) {
    const media = navigator.mediaDevices.getUserMedia(constraints);
    await waitFor(
      () => !!desktopMediaPermissionRequest.value,
      'Не появился запрос устройства'
    );
    await waitFor(
      () =>
        !!document.querySelector(
          '[data-testid="DesktopMediaPermissionDialog"]:modal'
        ),
      'Диалог не открыт'
    );
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="DesktopMediaPermissionDialog"] button'
      )
    ];
    buttons.find(button => button.textContent?.trim() === 'Разрешить')?.click();
    const stream = await Promise.race([
      media,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Зависло разрешение устройства')),
          10_000
        )
      )
    ]);
    if (!stream.getTracks().length) throw new Error('Нет тестовых медиатреков');
    stream.getTracks().forEach(track => track.stop());
  }
  await report('native-device-consent', {
    passed: true,
    fakeDevicesOnly: true
  });

  const capture = prepareDesktopScreenCapture();
  if (!capture) throw new Error('Нативный выбор экрана недоступен');
  const sourceButton = () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '.desktop-screen-picker__source'
      )
    ].find(button => button.textContent?.includes(captureSourceTitle));
  await waitFor(
    () =>
      !!document.querySelector(
        '[data-testid="DesktopScreenSharePicker"]:modal'
      ),
    'Выбор экрана не появился'
  );
  const windowTab = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  ].find(button => button.textContent?.includes('Окно приложения'));
  windowTab?.click();
  await waitFor(() => !!sourceButton(), 'Не найдено синтетическое окно QA');
  sourceButton()?.click();
  const share = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.desktop-screen-picker__actions button'
    )
  ].find(button => button.textContent?.trim() === 'Поделиться');
  await waitFor(
    () => !!share && !share.disabled,
    'Выбор окна не включил кнопку демонстрации'
  );
  if (!share || share.disabled)
    throw new Error('Выбор окна не включил кнопку демонстрации');
  share.click();
  const track = await capture;
  const video = document.createElement('video');
  video.muted = true;
  const sender = new RTCPeerConnection();
  const receiver = new RTCPeerConnection();
  receiver.ontrack = event => {
    video.srcObject = new MediaStream([event.track]);
  };
  sender.addTrack(track, new MediaStream([track]));
  await sender.setLocalDescription(await sender.createOffer());
  await waitFor(
    () => sender.iceGatheringState === 'complete',
    'ICE отправителя не собран'
  );
  await receiver.setRemoteDescription(sender.localDescription!);
  await receiver.setLocalDescription(await receiver.createAnswer());
  await waitFor(
    () => receiver.iceGatheringState === 'complete',
    'ICE получателя не собран'
  );
  await sender.setRemoteDescription(receiver.localDescription!);
  let frames = 0;
  const onFrame = () => {
    frames++;
    if (track.readyState === 'live') video.requestVideoFrameCallback(onFrame);
  };
  video.requestVideoFrameCallback(onFrame);
  await video.play();
  await waitFor(
    () => frames >= 6,
    'Захват не передаёт последовательные видеокадры'
  );
  if (
    video.videoWidth <= 0 ||
    video.videoHeight <= 0 ||
    video.videoWidth > 1920 ||
    video.videoHeight > 1080
  )
    throw new Error('Неверные размеры захваченного изображения');
  const beforeMinimize = frames;
  await appWindow.minimize();
  await waitFor(
    () => frames >= beforeMinimize + 3,
    'Демонстрация остановилась при сворачивании приложения'
  );
  await appWindow.unminimize();
  track.stop();
  await waitFor(
    async () => !(await invoke<boolean>('desktop_screen_capture_active')),
    'Нативный захват продолжился после остановки'
  );
  video.pause();
  video.srcObject = null;
  sender.close();
  receiver.close();
  await report('native-screen-picker', {
    passed: true,
    frames,
    syntheticWindowOnly: true,
    webRtcRoundTrip: true,
    minimizedPlayback: true
  });
};
