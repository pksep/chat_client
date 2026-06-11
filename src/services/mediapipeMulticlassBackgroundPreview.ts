import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import {
  CALL_BACKGROUND_ASSET_PATHS,
  MEDIAPIPE_MULTICLASS_SEGMENTER_MODEL_ASSET_PATH
} from './callBackgroundProcessorConfig';

export type MediapipeMulticlassMaskProfile =
  | 'full-person'
  | 'no-accessories'
  | 'body-core';

export type MediapipeMulticlassBackgroundPreviewStats = {
  segmentationTimeMs: number;
  processingTimeMs: number;
};

export type MediapipeMulticlassBackgroundPreviewOptions = {
  backgroundImageUrl: string;
  edgeBlurAmount: number;
  foregroundThreshold: number;
  maskProfile: MediapipeMulticlassMaskProfile;
  onError?: (message: string) => void;
  onFrameProcessed?: (stats: MediapipeMulticlassBackgroundPreviewStats) => void;
  outputCanvas: HTMLCanvasElement;
  sourceVideo: HTMLVideoElement;
};

export type MediapipeMulticlassBackgroundPreviewController = {
  stop: () => void;
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
const SEGMENTATION_INPUT_MAX_WIDTH = 192;
const PREVIEW_SEGMENTATION_INTERVAL_MS = 80;

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

const toErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : 'MediaPipe preview failed';

export const createMediapipeMulticlassBackgroundPreview = async (
  options: MediapipeMulticlassBackgroundPreviewOptions
): Promise<MediapipeMulticlassBackgroundPreviewController> => {
  const [imageSegmenter, backgroundImage] = await Promise.all([
    getImageSegmenter(),
    loadBackgroundImage(options.backgroundImageUrl)
  ]);

  const outputContext = options.outputCanvas.getContext('2d');

  if (!outputContext) {
    throw new Error('MediaPipe preview canvas is not available');
  }

  const maskCanvas = document.createElement('canvas');
  const blurredMaskCanvas = document.createElement('canvas');
  const segmentationCanvas = document.createElement('canvas');
  const segmentationMaskCanvas = document.createElement('canvas');
  const sourceFrameCanvas = document.createElement('canvas');
  const maskContext = maskCanvas.getContext('2d');
  const segmentationContext = segmentationCanvas.getContext('2d', {
    alpha: false
  });
  const segmentationMaskContext = segmentationMaskCanvas.getContext('2d');
  const sourceFrameContext = sourceFrameCanvas.getContext('2d', {
    alpha: false
  });

  if (
    !maskContext ||
    !segmentationContext ||
    !segmentationMaskContext ||
    !sourceFrameContext
  ) {
    throw new Error('MediaPipe preview mask canvas is not available');
  }

  let frameTimerId: number | null = null;
  let isStopped = false;
  let isProcessingFrame = false;
  let didReportError = false;
  let latestMaskSource: CanvasImageSource | null = null;
  let latestForegroundFrameSource: CanvasImageSource | null = null;

  const stop = (): void => {
    isStopped = true;
    if (frameTimerId !== null) {
      window.clearTimeout(frameTimerId);
      frameTimerId = null;
    }
    outputContext.clearRect(
      0,
      0,
      options.outputCanvas.width,
      options.outputCanvas.height
    );
  };

  const renderCompositedFrame = (width: number, height: number): void => {
    ensureCanvasSize(options.outputCanvas, width, height);

    outputContext.save();
    outputContext.clearRect(0, 0, width, height);

    if (latestForegroundFrameSource) {
      outputContext.drawImage(latestForegroundFrameSource, 0, 0, width, height);
    } else {
      outputContext.drawImage(options.sourceVideo, 0, 0, width, height);
    }

    if (latestMaskSource) {
      outputContext.globalCompositeOperation = 'destination-in';
      outputContext.drawImage(latestMaskSource, 0, 0, width, height);
      outputContext.globalCompositeOperation = 'destination-over';
      drawCoverImage(outputContext, backgroundImage, width, height);
    }

    outputContext.restore();
  };

  const renderNextFrame = (): void => {
    if (isStopped) {
      return;
    }

    frameTimerId = window.setTimeout(
      () => void processFrame(),
      PREVIEW_SEGMENTATION_INTERVAL_MS
    );
  };

  const processFrame = async (): Promise<void> => {
    if (
      isStopped ||
      isProcessingFrame ||
      options.sourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !options.sourceVideo.videoWidth ||
      !options.sourceVideo.videoHeight
    ) {
      renderNextFrame();
      return;
    }

    isProcessingFrame = true;

    try {
      const width = options.sourceVideo.videoWidth;
      const height = options.sourceVideo.videoHeight;

      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 1 ||
        height < 1
      ) {
        renderNextFrame();
        return;
      }

      options.sourceVideo.width = width;
      options.sourceVideo.height = height;

      ensureCanvasSize(options.outputCanvas, width, height);
      ensureCanvasSize(sourceFrameCanvas, width, height);
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
      sourceFrameContext.clearRect(0, 0, width, height);
      sourceFrameContext.drawImage(options.sourceVideo, 0, 0, width, height);

      segmentationContext.clearRect(
        0,
        0,
        segmentationWidth,
        segmentationHeight
      );
      segmentationContext.drawImage(
        sourceFrameCanvas,
        0,
        0,
        segmentationWidth,
        segmentationHeight
      );

      const startedAt = performance.now();
      const segmentationStartedAt = performance.now();
      const segmentationResult = imageSegmenter.segmentForVideo(
        segmentationCanvas,
        performance.now()
      );

      if (isStopped) {
        segmentationResult.close();
        return;
      }

      const segmentationTimeMs = performance.now() - segmentationStartedAt;
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

      if (isStopped) {
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
      latestForegroundFrameSource = sourceFrameCanvas;
      renderCompositedFrame(width, height);

      options.onFrameProcessed?.({
        segmentationTimeMs,
        processingTimeMs: performance.now() - startedAt
      });
    } catch (error) {
      if (!didReportError) {
        didReportError = true;
        options.onError?.(toErrorMessage(error));
      }

      stop();
      return;
    } finally {
      isProcessingFrame = false;
    }

    if (!isStopped) {
      renderNextFrame();
    }
  };

  renderNextFrame();

  return {
    stop
  };
};
