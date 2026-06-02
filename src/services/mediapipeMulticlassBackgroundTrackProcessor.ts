import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import type { LocalVideoTrack } from 'livekit-client';
import {
  CALL_BACKGROUND_ASSET_PATHS,
  MEDIAPIPE_MULTICLASS_SEGMENTER_MODEL_ASSET_PATH
} from './callBackgroundProcessorConfig';
import type { MediapipeMulticlassMaskProfile } from './mediapipeMulticlassBackgroundPreview';

type LiveKitVideoProcessor = Parameters<LocalVideoTrack['setProcessor']>[0];

type MediapipeMulticlassBackgroundTrackProcessorOptions = {
  backgroundImageUrl: string;
  edgeBlurAmount: number;
  foregroundThreshold: number;
  maskProfile: MediapipeMulticlassMaskProfile;
  outputFps?: number;
};

const backgroundImageCache = new Map<string, Promise<HTMLImageElement>>();
let wasmFilesetPromise: Promise<
  Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
> | null = null;
let imageSegmenterPromise: Promise<ImageSegmenter> | null = null;

const MASK_PROFILE_CLASS_INDICES: Record<
  MediapipeMulticlassMaskProfile,
  number[]
> = {
  'full-person': [1, 2, 3, 4, 5],
  'no-accessories': [1, 2, 3, 4],
  'body-core': [1, 2, 3]
};
const SEGMENTATION_INPUT_MAX_WIDTH = 256;
const SEGMENTATION_INTERVAL_MS = 45;
const DEFAULT_OUTPUT_FPS = 24;

const getVisionFileset = async () => {
  if (!wasmFilesetPromise) {
    wasmFilesetPromise = FilesetResolver.forVisionTasks(
      CALL_BACKGROUND_ASSET_PATHS.tasksVisionFileSet
    ).catch(error => {
      wasmFilesetPromise = null;
      throw error;
    });
  }

  return wasmFilesetPromise;
};

const getImageSegmenter = async (): Promise<ImageSegmenter> => {
  if (!imageSegmenterPromise) {
    imageSegmenterPromise = (async () => {
      const wasmFileset = await getVisionFileset();

      return ImageSegmenter.createFromOptions(wasmFileset, {
        baseOptions: {
          delegate: 'GPU',
          modelAssetPath: MEDIAPIPE_MULTICLASS_SEGMENTER_MODEL_ASSET_PATH
        },
        outputCategoryMask: false,
        outputConfidenceMasks: true,
        runningMode: 'VIDEO'
      });
    })().catch(error => {
      imageSegmenterPromise = null;
      throw error;
    });
  }

  return imageSegmenterPromise;
};

const loadBackgroundImage = async (
  imageUrl: string
): Promise<HTMLImageElement> => {
  if (!imageUrl) {
    throw new Error('Virtual background image is not selected');
  }

  const existingImagePromise = backgroundImageCache.get(imageUrl);

  if (existingImagePromise) {
    return existingImagePromise;
  }

  const nextImagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = 'anonymous';
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode();
        }
      } catch {
        //
      }

      resolve(image);
    };
    image.onerror = () =>
      reject(new Error('Failed to load the virtual background image'));
    image.src = imageUrl;
  }).catch(error => {
    backgroundImageCache.delete(imageUrl);
    throw error;
  });

  backgroundImageCache.set(imageUrl, nextImagePromise);
  return nextImagePromise;
};

const ensureCanvasSize = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): void => {
  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
};

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
): void => {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!imageWidth || !imageHeight) {
    return;
  }

  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
};

const blurMaskImage = (
  maskCanvas: HTMLCanvasElement,
  blurredMaskCanvas: HTMLCanvasElement,
  edgeBlurAmount: number
): CanvasImageSource => {
  if (edgeBlurAmount <= 0) {
    return maskCanvas;
  }

  ensureCanvasSize(blurredMaskCanvas, maskCanvas.width, maskCanvas.height);

  const blurredMaskContext = blurredMaskCanvas.getContext('2d');

  if (!blurredMaskContext) {
    return maskCanvas;
  }

  blurredMaskContext.clearRect(
    0,
    0,
    blurredMaskCanvas.width,
    blurredMaskCanvas.height
  );
  blurredMaskContext.save();
  blurredMaskContext.filter = `blur(${edgeBlurAmount}px)`;
  blurredMaskContext.drawImage(maskCanvas, 0, 0);
  blurredMaskContext.restore();

  return blurredMaskCanvas;
};

const buildMaskImageData = (
  confidenceMasks: Float32Array[],
  width: number,
  height: number,
  foregroundThreshold: number,
  maskProfile: MediapipeMulticlassMaskProfile
): ImageData => {
  const selectedClassIndices = MASK_PROFILE_CLASS_INDICES[maskProfile];
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
    let foregroundConfidence = 0;

    for (const classIndex of selectedClassIndices) {
      const classMask = confidenceMasks[classIndex];

      if (!classMask) {
        continue;
      }

      foregroundConfidence += classMask[pixelIndex] || 0;
    }

    foregroundConfidence = Math.min(1, foregroundConfidence);

    const normalizedAlpha =
      foregroundConfidence <= foregroundThreshold
        ? 0
        : Math.min(
            1,
            (foregroundConfidence - foregroundThreshold) /
              Math.max(0.001, 1 - foregroundThreshold)
          );

    rgba[pixelIndex * 4] = 0;
    rgba[pixelIndex * 4 + 1] = 0;
    rgba[pixelIndex * 4 + 2] = 0;
    rgba[pixelIndex * 4 + 3] = Math.round(normalizedAlpha * 255);
  }

  return new ImageData(rgba, width, height);
};

const toVideoElement = (
  element?: HTMLMediaElement
): HTMLVideoElement | undefined =>
  element instanceof HTMLVideoElement ? element : undefined;

export const prewarmMediapipeMulticlassBackgroundProcessor = async (
  imageUrl?: string | null
): Promise<void> => {
  await Promise.allSettled([
    getImageSegmenter(),
    imageUrl ? loadBackgroundImage(imageUrl) : Promise.resolve()
  ]);
};

export const createMediapipeMulticlassBackgroundTrackProcessor = (
  options: MediapipeMulticlassBackgroundTrackProcessorOptions
): LiveKitVideoProcessor => {
  const outputCanvas = document.createElement('canvas');
  const maskCanvas = document.createElement('canvas');
  const blurredMaskCanvas = document.createElement('canvas');
  const segmentationCanvas = document.createElement('canvas');
  const segmentationMaskCanvas = document.createElement('canvas');

  const outputContext = outputCanvas.getContext('2d');
  const maskContext = maskCanvas.getContext('2d');
  const segmentationContext = segmentationCanvas.getContext('2d', {
    alpha: false
  });
  const segmentationMaskContext = segmentationMaskCanvas.getContext('2d');

  if (
    !outputContext ||
    !maskContext ||
    !segmentationContext ||
    !segmentationMaskContext
  ) {
    throw new Error('Call background processor canvas is not available');
  }

  const outputStream = outputCanvas.captureStream(
    options.outputFps || DEFAULT_OUTPUT_FPS
  );
  const processedTrack = outputStream.getVideoTracks()[0];

  if (!processedTrack) {
    outputStream.getTracks().forEach(track => track.stop());
    throw new Error('Failed to create processed video track');
  }

  let sourceVideo: HTMLVideoElement | undefined;
  let backgroundImage: HTMLImageElement | null = null;
  let imageSegmenter: ImageSegmenter | null = null;
  let frameTimerId: number | null = null;
  let renderFrameId: number | null = null;
  let latestMaskSource: CanvasImageSource | null = null;
  let isDestroyed = false;
  let isProcessingFrame = false;

  const stopLoops = (): void => {
    if (frameTimerId !== null) {
      window.clearTimeout(frameTimerId);
      frameTimerId = null;
    }

    if (renderFrameId !== null) {
      window.cancelAnimationFrame(renderFrameId);
      renderFrameId = null;
    }
  };

  const drawFrame = (): void => {
    if (isDestroyed) {
      return;
    }

    if (
      sourceVideo &&
      sourceVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      sourceVideo.videoWidth &&
      sourceVideo.videoHeight
    ) {
      const width = sourceVideo.videoWidth;
      const height = sourceVideo.videoHeight;

      ensureCanvasSize(outputCanvas, width, height);

      outputContext.save();
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(sourceVideo, 0, 0, width, height);

      if (latestMaskSource && backgroundImage) {
        outputContext.globalCompositeOperation = 'destination-in';
        outputContext.drawImage(latestMaskSource, 0, 0, width, height);
        outputContext.globalCompositeOperation = 'destination-over';
        drawCoverImage(outputContext, backgroundImage, width, height);
      }

      outputContext.restore();
    }

    renderFrameId = window.requestAnimationFrame(drawFrame);
  };

  const renderNextSegmentationFrame = (): void => {
    if (isDestroyed) {
      return;
    }

    frameTimerId = window.setTimeout(
      () => void processSegmentationFrame(),
      SEGMENTATION_INTERVAL_MS
    );
  };

  const processSegmentationFrame = async (): Promise<void> => {
    if (
      isDestroyed ||
      isProcessingFrame ||
      !sourceVideo ||
      !imageSegmenter ||
      sourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !sourceVideo.videoWidth ||
      !sourceVideo.videoHeight
    ) {
      renderNextSegmentationFrame();
      return;
    }

    isProcessingFrame = true;

    try {
      const width = sourceVideo.videoWidth;
      const height = sourceVideo.videoHeight;

      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 1 ||
        height < 1
      ) {
        renderNextSegmentationFrame();
        return;
      }

      const segmentationScale = Math.min(
        1,
        SEGMENTATION_INPUT_MAX_WIDTH / width
      );
      const segmentationWidth = Math.max(
        1,
        Math.round(width * segmentationScale)
      );
      const segmentationHeight = Math.max(
        1,
        Math.round(height * segmentationScale)
      );

      ensureCanvasSize(
        segmentationCanvas,
        segmentationWidth,
        segmentationHeight
      );
      ensureCanvasSize(
        segmentationMaskCanvas,
        segmentationWidth,
        segmentationHeight
      );
      ensureCanvasSize(maskCanvas, width, height);

      segmentationContext.clearRect(
        0,
        0,
        segmentationWidth,
        segmentationHeight
      );
      segmentationContext.drawImage(
        sourceVideo,
        0,
        0,
        segmentationWidth,
        segmentationHeight
      );

      const segmentationResult = imageSegmenter.segmentForVideo(
        segmentationCanvas,
        performance.now()
      );

      if (isDestroyed) {
        segmentationResult.close();
        return;
      }

      const confidenceMasks = segmentationResult.confidenceMasks;

      if (!confidenceMasks?.length) {
        segmentationResult.close();
        throw new Error('MediaPipe multiclass segmenter returned no masks');
      }

      const maskImage = buildMaskImageData(
        confidenceMasks.map(mask => mask.getAsFloat32Array()),
        segmentationWidth,
        segmentationHeight,
        options.foregroundThreshold,
        options.maskProfile
      );

      segmentationResult.close();

      if (isDestroyed) {
        return;
      }

      segmentationMaskContext.putImageData(maskImage, 0, 0);
      maskContext.clearRect(0, 0, width, height);
      maskContext.drawImage(segmentationMaskCanvas, 0, 0, width, height);
      latestMaskSource = blurMaskImage(
        maskCanvas,
        blurredMaskCanvas,
        options.edgeBlurAmount
      );
    } catch (error) {
      console.warn(
        '[LiveKit] MediaPipe multiclass background frame failed:',
        error
      );
    } finally {
      isProcessingFrame = false;
    }

    if (!isDestroyed) {
      renderNextSegmentationFrame();
    }
  };

  const processor: LiveKitVideoProcessor = {
    name: 'mediapipe-multiclass-background',
    processedTrack,
    async init(initOptions) {
      sourceVideo = toVideoElement(initOptions.element);

      const [nextSegmenter, nextBackgroundImage] = await Promise.all([
        getImageSegmenter(),
        loadBackgroundImage(options.backgroundImageUrl)
      ]);

      if (isDestroyed) {
        return;
      }

      imageSegmenter = nextSegmenter;
      backgroundImage = nextBackgroundImage;

      if (renderFrameId === null) {
        renderFrameId = window.requestAnimationFrame(drawFrame);
      }
      if (frameTimerId === null) {
        renderNextSegmentationFrame();
      }
    },
    async restart(restartOptions) {
      sourceVideo = toVideoElement(restartOptions.element);
    },
    async destroy() {
      isDestroyed = true;
      stopLoops();
      latestMaskSource = null;
      outputContext.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
      outputStream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });
    }
  };

  return processor;
};
