import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { shallowRef, watch } from 'vue';
import { getDesktopPermissionChoice } from './desktop-permission-preferences';
import {
  desktopMediaPermissionRequest,
  requestDesktopScreenCaptureConsent,
  resolveDesktopMediaPermission
} from './desktop-media-permissions';

export interface DesktopCaptureSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
}

export const desktopScreenPicker = shallowRef<{
  permissionGranted: boolean;
} | null>(null);
export const desktopScreenCaptureSource =
  shallowRef<DesktopCaptureSource | null>(null);
let supported = false;
let permissionGranted = false;
let selectSource: ((source: DesktopCaptureSource | null) => void) | null = null;
let activeStop: (() => void) | null = null;

export const initDesktopScreenCapture = async () => {
  if (!isTauri()) return;
  try {
    const result = await invoke<{
      supported: boolean;
      permissionGranted: boolean;
    }>('desktop_screen_capture_available');
    supported = result.supported;
    permissionGranted = result.permissionGranted;
  } catch {
    // Старые оболочки и Linux продолжают использовать штатный getDisplayMedia.
  }
};

export const resolveDesktopScreenPicker = (
  source: DesktopCaptureSource | null
) => {
  const resolve = selectSource;
  selectSource = null;
  desktopScreenPicker.value = null;
  resolve?.(source);
};

export const requestDesktopScreenCapturePermission = async () => {
  permissionGranted = await invoke<boolean>(
    'desktop_screen_capture_permission'
  );
  if (desktopScreenPicker.value)
    desktopScreenPicker.value = { permissionGranted };
  return permissionGranted;
};

export const loadDesktopCaptureSources = () =>
  invoke<DesktopCaptureSource[]>('desktop_screen_capture_sources');

export const stopDesktopScreenCapture = () => {
  if (
    desktopMediaPermissionRequest.value?.permissions.includes('screen-capture')
  )
    resolveDesktopMediaPermission(false);
  resolveDesktopScreenPicker(null);
  activeStop?.();
};

watch(
  () => getDesktopPermissionChoice('screen-capture'),
  choice => {
    if (choice === 'denied') stopDesktopScreenCapture();
  },
  { flush: 'sync' }
);

export const prepareDesktopScreenCapture =
  (): Promise<MediaStreamTrack> | null => {
    if (!isTauri() || !supported) return null;
    if (selectSource)
      return Promise.reject(
        new DOMException('Выбор экрана уже открыт', 'AbortError')
      );
    let resolveSelection!: (source: DesktopCaptureSource | null) => void;
    const selected = new Promise<DesktopCaptureSource | null>(resolve => {
      resolveSelection = resolve;
      selectSource = resolve;
    });
    void (async () => {
      try {
        const allowed = await requestDesktopScreenCaptureConsent();
        if (selectSource !== resolveSelection) return;
        if (!allowed) {
          resolveDesktopScreenPicker(null);
          return;
        }
        if (!permissionGranted) await requestDesktopScreenCapturePermission();
        if (selectSource === resolveSelection)
          desktopScreenPicker.value = { permissionGranted };
      } catch (error) {
        console.warn(
          'Не удалось запросить доступ к демонстрации экрана:',
          error
        );
        if (selectSource === resolveSelection) resolveDesktopScreenPicker(null);
      }
    })();
    return selected.then(async source => {
      if (!source)
        throw new DOMException('Демонстрация отменена', 'NotAllowedError');
      activeStop?.();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      });
      if (!context || !canvas.captureStream)
        throw new Error(
          'Демонстрация экрана не поддерживается на этом устройстве'
        );
      canvas.width = 2;
      canvas.height = 2;
      let track: CanvasCaptureMediaStreamTrack | undefined;
      let stopTrack: (() => void) | undefined;
      let sessionId: string | null = null;
      let ended = false;
      let pendingAck = false;
      let firstFrameResolve!: () => void;
      let firstFrameReject!: (error: Error) => void;
      const firstFrame = new Promise<void>((resolve, reject) => {
        firstFrameResolve = resolve;
        firstFrameReject = reject;
      });
      // Сразу обрабатываем отказ, даже если нативный start ещё не вернул идентификатор.
      void firstFrame.catch(() => undefined);
      const stop = () => {
        if (ended) return;
        ended = true;
        stopTrack?.();
        firstFrameReject(
          new DOMException('Демонстрация остановлена', 'AbortError')
        );
        if (sessionId)
          void invoke('desktop_screen_capture_stop', { sessionId }).catch(
            () => undefined
          );
        if (activeStop === stop) activeStop = null;
        desktopScreenCaptureSource.value = null;
      };
      activeStop = stop;
      const frames = new Channel<ArrayBuffer>();
      frames.onmessage = buffer => {
        if (ended) return;
        try {
          const header = new DataView(buffer);
          const width = header.getUint32(0, true);
          const height = header.getUint32(4, true);
          if (
            !width ||
            !height ||
            width > 1920 ||
            height > 1080 ||
            buffer.byteLength !== 8 + width * height * 4
          )
            throw new Error('Некорректный кадр демонстрации');
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.putImageData(
            new ImageData(new Uint8ClampedArray(buffer, 8), width, height),
            0,
            0
          );
          track?.requestFrame?.();
          firstFrameResolve();
          if (sessionId)
            void invoke('desktop_screen_capture_ack', { sessionId }).catch(
              () => undefined
            );
          else pendingAck = true;
        } catch (error) {
          firstFrameReject(
            error instanceof Error ? error : new Error(String(error))
          );
          stop();
          track?.dispatchEvent(new Event('ended'));
        }
      };
      const statuses = new Channel<{ error: string | null }>();
      statuses.onmessage = status => {
        if (ended) return;
        firstFrameReject(
          new Error(status.error || 'Источник демонстрации отключён')
        );
        stop();
        track?.dispatchEvent(new Event('ended'));
      };
      const timeout = setTimeout(() => {
        firstFrameReject(
          new Error('Не удалось получить изображение выбранного источника')
        );
        stop();
      }, 15_000);
      try {
        sessionId = await invoke<string>('desktop_screen_capture_start', {
          sourceId: source.id,
          onFrame: frames,
          onStatus: statuses
        });
        if (ended) {
          await invoke('desktop_screen_capture_stop', { sessionId });
          throw new DOMException('Демонстрация остановлена', 'AbortError');
        }
        if (pendingAck)
          void invoke('desktop_screen_capture_ack', { sessionId });
        await firstFrame;
        const stream = canvas.captureStream(30);
        track = stream.getVideoTracks()[0] as
          | CanvasCaptureMediaStreamTrack
          | undefined;
        if (!track)
          throw new Error('Не удалось подготовить видеотрек демонстрации');
        track.contentHint = 'detail';
        stopTrack = track.stop.bind(track);
        track.stop = stop;
        desktopScreenCaptureSource.value = source;
        return track;
      } catch (error) {
        stop();
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  };

if (typeof window !== 'undefined')
  window.addEventListener('pagehide', stopDesktopScreenCapture);
