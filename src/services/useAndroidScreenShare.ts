import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';

type AndroidScreenShareFrame = {
  data: string;
  width: number;
  height: number;
  timestamp: number;
};

type AndroidScreenShareListeners = {
  screenShareFrame: (payload: AndroidScreenShareFrame) => void;
  screenShareStopped: () => void;
};

type AndroidScreenSharePlugin = {
  isSupported: () => Promise<{ supported: boolean }>;
  prepare: () => Promise<void>;
  stop: () => Promise<void>;
  addListener: <EventName extends keyof AndroidScreenShareListeners>(
    eventName: EventName,
    listenerFunc: AndroidScreenShareListeners[EventName]
  ) => Promise<PluginListenerHandle>;
};

type AndroidScreenShareSession = {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => Promise<void>;
};

const AndroidScreenShare =
  registerPlugin<AndroidScreenSharePlugin>('AndroidScreenShare');

const ANDROID_SCREEN_SHARE_FIRST_FRAME_TIMEOUT_MS = 5000;

let activeSession: AndroidScreenShareSession | null = null;
let activeCanvas: HTMLCanvasElement | null = null;
let activeContext: CanvasRenderingContext2D | null = null;
let activeTrack: CanvasCaptureMediaStreamTrack | null = null;
let frameListener: PluginListenerHandle | null = null;
let stoppedListener: PluginListenerHandle | null = null;
let firstFrameResolve: (() => void) | null = null;
let frameDecodePromise: Promise<void> = Promise.resolve();

export const isAndroidScreenSharePlatform = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const isAndroidScreenShareSupported = async (): Promise<boolean> => {
  if (!isAndroidScreenSharePlatform()) {
    return false;
  }

  try {
    const result = await AndroidScreenShare.isSupported();
    return !!result.supported;
  } catch (error) {
    console.warn('[AndroidScreenShare] Не удалось проверить поддержку:', error);
    return false;
  }
};

const removeAndroidScreenShareListeners = async (): Promise<void> => {
  await Promise.all([frameListener?.remove(), stoppedListener?.remove()]);
  frameListener = null;
  stoppedListener = null;
};

const resetAndroidScreenShareCanvas = (): void => {
  activeCanvas = null;
  activeContext = null;
  activeTrack = null;
  firstFrameResolve = null;
  frameDecodePromise = Promise.resolve();
};

const drawAndroidScreenShareFrame = (
  payload: AndroidScreenShareFrame
): void => {
  if (!activeCanvas || !activeContext || !payload.data) {
    return;
  }

  frameDecodePromise = frameDecodePromise
    .catch(() => undefined)
    .then(async () => {
      const canvas = activeCanvas;
      const context = activeContext;

      if (!canvas || !context) {
        return;
      }

      if (canvas.width !== payload.width || canvas.height !== payload.height) {
        canvas.width = payload.width;
        canvas.height = payload.height;
      }

      const frameResponse = await fetch(
        `data:image/jpeg;base64,${payload.data}`
      );
      const frameBlob = await frameResponse.blob();
      const bitmap = await createImageBitmap(frameBlob);

      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      activeTrack?.requestFrame();
      firstFrameResolve?.();
      firstFrameResolve = null;
    })
    .catch(error => {
      console.warn('[AndroidScreenShare] Не удалось отрисовать кадр:', error);
    });
};

const createAndroidScreenShareCanvasSession = (): AndroidScreenShareSession => {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });

  if (!context || typeof canvas.captureStream !== 'function') {
    throw new Error('Демонстрация экрана не поддерживается на этом устройстве');
  }

  canvas.width = 1;
  canvas.height = 1;
  context.fillStyle = '#000';
  context.fillRect(0, 0, 1, 1);

  activeCanvas = canvas;
  activeContext = context;

  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as
    | CanvasCaptureMediaStreamTrack
    | undefined;

  if (!track) {
    throw new Error('Не удалось подготовить видеотрек демонстрации экрана');
  }

  activeTrack = track;
  track.contentHint = 'detail';

  return {
    stream,
    track,
    stop: stopAndroidScreenShare
  };
};

const waitForAndroidScreenShareFirstFrame = async (): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let timeoutId: number = undefined;
    const complete = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    timeoutId = window.setTimeout(() => {
      if (firstFrameResolve === complete) {
        firstFrameResolve = null;
      }
      reject(new Error('Не удалось получить первый кадр демонстрации экрана'));
    }, ANDROID_SCREEN_SHARE_FIRST_FRAME_TIMEOUT_MS);

    firstFrameResolve = complete;
  });
};

const setupAndroidScreenShareListeners = async (): Promise<void> => {
  frameListener = await AndroidScreenShare.addListener(
    'screenShareFrame',
    drawAndroidScreenShareFrame
  );
  stoppedListener = await AndroidScreenShare.addListener(
    'screenShareStopped',
    () => {
      void stopAndroidScreenShare();
    }
  );
};

export const prepareAndroidScreenShare =
  async (): Promise<AndroidScreenShareSession | null> => {
    if (!isAndroidScreenSharePlatform()) {
      return null;
    }

    if (activeSession) {
      return activeSession;
    }

    const session = createAndroidScreenShareCanvasSession();
    activeSession = session;

    try {
      await setupAndroidScreenShareListeners();
      await AndroidScreenShare.prepare();
      await waitForAndroidScreenShareFirstFrame();
    } catch (error) {
      await stopAndroidScreenShare();
      throw error;
    }

    return session;
  };

export const stopAndroidScreenShare = async (): Promise<void> => {
  const session = activeSession;
  activeSession = null;
  resetAndroidScreenShareCanvas();

  session?.stream.getTracks().forEach(track => {
    track.stop();
  });

  await removeAndroidScreenShareListeners();

  try {
    if (isAndroidScreenSharePlatform()) {
      await AndroidScreenShare.stop();
    }
  } catch (error) {
    console.warn(
      '[AndroidScreenShare] Не удалось остановить демонстрацию:',
      error
    );
  }
};
