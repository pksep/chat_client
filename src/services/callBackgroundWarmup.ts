import { BackgroundProcessor } from '@livekit/track-processors';

const CALL_BACKGROUND_ASSET_PATHS = {
  tasksVisionFileSet: '/call-background/wasm',
  modelAssetPath: '/call-background/selfie_segmenter.tflite'
};

let processorWarmupPromise: Promise<void> | null = null;
const warmedImageUrls = new Map<string, Promise<void>>();

const canWarmProcessor = (): boolean =>
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  'captureStream' in HTMLCanvasElement.prototype;

const warmImage = async (imageUrl: string): Promise<void> => {
  if (!imageUrl) {
    return;
  }

  const existingPromise = warmedImageUrls.get(imageUrl);

  if (existingPromise) {
    return existingPromise;
  }

  const nextPromise = new Promise<void>(resolve => {
    const image = new Image();

    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = imageUrl;

    if (typeof image.decode === 'function') {
      image.decode().then(resolve).catch(resolve);
    }
  });

  warmedImageUrls.set(imageUrl, nextPromise);
  await nextPromise;
};

const warmProcessor = async (): Promise<void> => {
  if (processorWarmupPromise) {
    return processorWarmupPromise;
  }

  processorWarmupPromise = (async () => {
    if (!canWarmProcessor()) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;

    const context = canvas.getContext('2d');
    context?.fillRect(0, 0, canvas.width, canvas.height);

    const stream = canvas.captureStream(1);
    const track = stream.getVideoTracks()[0];

    if (!track) {
      stream.getTracks().forEach(streamTrack => streamTrack.stop());
      return;
    }

    const videoElement = document.createElement('video');
    const processor = BackgroundProcessor(
      {
        mode: 'background-blur',
        blurRadius: 8,
        assetPaths: CALL_BACKGROUND_ASSET_PATHS
      },
      'call-background-warmup'
    );

    try {
      await processor.init({
        kind: 'video' as never,
        track,
        element: videoElement
      } as never);
    } catch (error) {
      console.warn('[CallBackground] Failed to warm processor:', error);
      processorWarmupPromise = null;
    } finally {
      try {
        await processor.destroy();
      } catch (error) {
        console.warn(
          '[CallBackground] Failed to destroy warm processor:',
          error
        );
      }

      stream.getTracks().forEach(streamTrack => streamTrack.stop());
    }
  })();

  return processorWarmupPromise;
};

export const prewarmCallBackgroundAssets = async (
  imageUrl?: string | null
): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  await Promise.allSettled([
    warmProcessor(),
    imageUrl ? warmImage(imageUrl) : Promise.resolve()
  ]);
};
