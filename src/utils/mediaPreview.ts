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
}

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

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        width: video.videoWidth,
        height: video.videoHeight
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({});
    };

    video.src = objectUrl;
  });
};

export const getVideoThumbnail = (file: File): Promise<string | null> => {
  return new Promise(resolve => {
    const video = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let resolved = false;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    const finish = (value: string | null) => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve(value);
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      const captureFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const context = canvas.getContext('2d');
          if (!context || !canvas.width || !canvas.height) {
            finish(null);
            return;
          }

          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          finish(null);
        }
      };

      if (video.duration > 0.1) {
        video.onseeked = captureFrame;
        video.currentTime = 0.1;
        return;
      }

      captureFrame();
    };

    video.onerror = () => finish(null);
    video.src = objectUrl;
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
