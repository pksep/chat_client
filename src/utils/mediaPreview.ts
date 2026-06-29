export const PREVIEW_MAX_WIDTH = 265;
export const PREVIEW_MAX_HEIGHT = 300;
export const PREVIEW_GRID_GAP = 2;

export interface MediaDimensions {
  width?: number;
  height?: number;
}

export interface MediaPreviewDimensions extends MediaDimensions {
  previewWidth?: number;
  previewHeight?: number;
  fillPreview?: boolean;
}

const VIDEO_THUMBNAIL_TIMESTAMPS = [0.1, 0.5, 1, 2];
const VIDEO_BLACK_FRAME_BRIGHTNESS_THRESHOLD = 10;
const VIDEO_METADATA_TIMEOUT_MS = 2500;
const VIDEO_THUMBNAIL_TIMEOUT_MS = 15000;
const VIDEO_FRAME_WAIT_TIMEOUT_MS = 120;
const VIDEO_READY_STATE_HAVE_CURRENT_DATA = 2;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (...args: unknown[]) => void) => number;
};

export const VIDEO_FALLBACK_THUMBNAIL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg width="640" height="360" viewBox="0 0 640 360" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="640" height="360" fill="#20242B"/>
<circle cx="320" cy="180" r="54" fill="#FFFFFF" fill-opacity="0.18"/>
<path d="M304 151L350 180L304 209V151Z" fill="#FFFFFF"/>
</svg>`
)}`;

export const getGridColumnsCount = (count: number): number => {
  if (count <= 1) return 1;
  if ([2, 3, 4].includes(count)) return 2;
  if ([6, 9, 10].includes(count)) return 3;
  if ([5, 7, 8].includes(count)) return 6;
  return 3;
};

export const getGridColumnSpan = (count: number, index: number): number => {
  if (count === 3 && index === 0) return 2;
  if (count === 5 && index < 2) return 3;
  if (count === 5 && index >= 2) return 2;
  if (count === 7 && index < 4) return 3;
  if (count === 7 && index >= 4) return 2;
  if (count === 8 && index < 2) return 3;
  if (count === 8 && index >= 2) return 2;
  if (count === 10 && index === 0) return 3;
  return 1;
};

export const getGridItemMaxWidth = (count: number, index: number): number => {
  const columns = getGridColumnsCount(count);
  const span = getGridColumnSpan(count, index);
  const totalGap = PREVIEW_GRID_GAP * (columns - 1);
  const columnWidth = (PREVIEW_MAX_WIDTH - totalGap) / columns;
  const itemGap = PREVIEW_GRID_GAP * (span - 1);

  return columnWidth * span + itemGap;
};

export const calculatePreviewDimensions = (
  dimensions: MediaDimensions,
  count: number,
  index: number
): MediaPreviewDimensions => {
  const { width, height } = dimensions;

  if (!width || !height) {
    return dimensions;
  }

  const maxWidth = getGridItemMaxWidth(count, index);
  const scale = Math.min(maxWidth / width, PREVIEW_MAX_HEIGHT / height, 1);

  return {
    width,
    height,
    previewWidth: Math.round(width * scale),
    previewHeight: Math.round(height * scale)
  };
};

export const getImageDimensions = (file: File): Promise<MediaDimensions> => {
  return new Promise(resolve => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };

    image.src = objectUrl;
  });
};

export const getVideoDimensions = (file: File): Promise<MediaDimensions> => {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      URL.revokeObjectURL(objectUrl);
    };

    const finish = (dimensions: MediaDimensions) => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve(dimensions);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      finish({
        width: video.videoWidth,
        height: video.videoHeight
      });
    };

    video.onerror = () => finish({});
    timeoutId = setTimeout(() => finish({}), VIDEO_METADATA_TIMEOUT_MS);

    video.src = objectUrl;
  });
};

export const getVideoThumbnail = (
  file: File,
  options?: { timeoutMs?: number }
): Promise<string | null> => {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const videoWithFrameCallback = video as VideoWithFrameCallback;
    const objectUrl = URL.createObjectURL(file);
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let hasStartedSeek = false;
    let currentSeekIndex = 0;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      URL.revokeObjectURL(objectUrl);
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    };

    const finish = (value: string | null) => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve(value);
    };

    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.top = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    if (document.body) {
      document.body.appendChild(video);
    }

    const captureFrame = (allowDarkFrame = false): string | null => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d', {
          willReadFrequently: true
        });
        if (!context || !canvas.width || !canvas.height) {
          return null;
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const sampleWidth = Math.min(canvas.width, 32);
        const sampleHeight = Math.min(canvas.height, 32);
        const imageData = context.getImageData(0, 0, sampleWidth, sampleHeight);
        let brightnessSum = 0;

        for (let index = 0; index < imageData.data.length; index += 4) {
          brightnessSum +=
            imageData.data[index] +
            imageData.data[index + 1] +
            imageData.data[index + 2];
        }

        const pixelsCount = imageData.data.length / 4;
        const averageBrightness =
          pixelsCount > 0 ? brightnessSum / (pixelsCount * 3) : 0;

        if (
          !allowDarkFrame &&
          averageBrightness <= VIDEO_BLACK_FRAME_BRIGHTNESS_THRESHOLD &&
          (!Number.isFinite(video.duration) || video.duration > 0.5)
        ) {
          return null;
        }

        return canvas.toDataURL('image/jpeg', 0.85);
      } catch {
        return null;
      }
    };

    function waitForDecodedFrame(callback: () => void) {
      let didRun = false;

      const run = () => {
        if (didRun || resolved) {
          return;
        }

        didRun = true;
        callback();
      };

      if (videoWithFrameCallback.requestVideoFrameCallback) {
        videoWithFrameCallback.requestVideoFrameCallback(run);
        setTimeout(run, VIDEO_FRAME_WAIT_TIMEOUT_MS);
        return;
      }

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
      setTimeout(run, VIDEO_FRAME_WAIT_TIMEOUT_MS);
    }

    function getSeekTime(timestamp: number): number {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        return timestamp;
      }

      return Math.min(timestamp, Math.max(video.duration - 0.05, 0));
    }

    function captureCurrentFrameOrSeekNext() {
      waitForDecodedFrame(() => {
        const thumbnail = captureFrame();

        if (thumbnail) {
          finish(thumbnail);
          return;
        }

        trySeekAtIndex(currentSeekIndex + 1);
      });
    }

    function trySeekAtIndex(index: number): void {
      currentSeekIndex = index;

      if (index >= VIDEO_THUMBNAIL_TIMESTAMPS.length) {
        waitForDecodedFrame(() => finish(captureFrame(true)));
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        finish(null);
        return;
      }

      hasStartedSeek = true;
      const nextTime = getSeekTime(VIDEO_THUMBNAIL_TIMESTAMPS[index]);

      try {
        if (
          video.readyState >= VIDEO_READY_STATE_HAVE_CURRENT_DATA &&
          Math.abs(video.currentTime - nextTime) < 0.05
        ) {
          captureCurrentFrameOrSeekNext();
          return;
        }

        video.currentTime = nextTime;
      } catch {
        waitForDecodedFrame(() => finish(captureFrame(true)));
      }
    }

    video.onloadedmetadata = () => {
      trySeekAtIndex(0);
    };

    video.onloadeddata = () => {
      if (!hasStartedSeek) {
        trySeekAtIndex(0);
      }
    };

    video.onseeked = () => {
      captureCurrentFrameOrSeekNext();
    };

    video.onerror = () => finish(null);
    timeoutId = setTimeout(
      () => finish(captureFrame(true)),
      options?.timeoutMs ?? VIDEO_THUMBNAIL_TIMEOUT_MS
    );
    video.src = objectUrl;
    video.load();
  });
};

export const getFileDimensions = async (
  file: File
): Promise<MediaDimensions> => {
  if (file.type.startsWith('image/')) {
    return getImageDimensions(file);
  }

  if (file.type.startsWith('video/')) {
    return getVideoDimensions(file);
  }

  return {};
};
