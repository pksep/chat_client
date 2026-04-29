import { getConfig } from '../../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl,
  prefetchMediaObjectUrl
} from '../../../services/useMediaBlobCache';
import type { IMedia } from '../../interfaces/interfaces';

export function useMessageMedia() {
  const config = getConfig();
  const EMPTY_MEDIA_SRC =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  const getPreferredMediaPath = (media: IMedia, isThumb = true) =>
    isThumb ? media.thumbnailPath || media.path : media.path;

  const setCachedObjectUrlOnMedia = (
    media: IMedia,
    path: string,
    objectUrl: string,
    isThumb: boolean
  ) => {
    if (isThumb && (media.thumbnailPath || media.path) === path) {
      media.localThumbnailPath = objectUrl;
      return;
    }

    if (media.path === path) {
      media.localPath = objectUrl;
    }
  };

  const isMediaPathReady = (media: IMedia, isThumb = true) => {
    if (isThumb && media.localThumbnailPath) {
      return true;
    }

    if (media.localPath && (isThumb || !media.path)) {
      return true;
    }

    const preferredPath = getPreferredMediaPath(media, isThumb);
    return Boolean(preferredPath && getCachedMediaObjectUrl(preferredPath));
  };

  const primeMediaCache = (media: IMedia, opts?: { includeOriginal?: boolean }) => {
    const thumbnailPath = media.thumbnailPath || media.path;

    if (thumbnailPath) {
      void ensureMediaObjectUrl(thumbnailPath).then(objectUrl => {
        if (objectUrl) {
          setCachedObjectUrlOnMedia(media, thumbnailPath, objectUrl, true);
        }
      });
    }

    if (opts?.includeOriginal && media.path && media.path !== thumbnailPath) {
      void ensureMediaObjectUrl(media.path).then(objectUrl => {
        if (objectUrl) {
          setCachedObjectUrlOnMedia(media, media.path, objectUrl, false);
        }
      });
    }
  };

  const getFullMediaPath = (media: IMedia, isThumb = true) => {
    if (isThumb && media.localThumbnailPath) {
      return media.localThumbnailPath;
    }

    if (media.localPath && (isThumb || !media.path)) {
      return media.localPath;
    }

    const preferredPath = getPreferredMediaPath(media, isThumb);
    const cachedObjectUrl = getCachedMediaObjectUrl(preferredPath);

    if (cachedObjectUrl) {
      setCachedObjectUrlOnMedia(media, preferredPath, cachedObjectUrl, isThumb);
      return cachedObjectUrl;
    }

    if (preferredPath) {
      prefetchMediaObjectUrl(preferredPath);
      void ensureMediaObjectUrl(preferredPath).then(objectUrl => {
        if (objectUrl) {
          setCachedObjectUrlOnMedia(media, preferredPath, objectUrl, isThumb);
        }
      });
    }

    if (media.path?.endsWith('.gif')) {
      return `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`;
    }

    return EMPTY_MEDIA_SRC;
  };

  const isSliderContentUrl = (fileUrl: string) => {
    return fileUrl?.match(
      /\.(jpg|jpeg|png|webp|svg|mp4|mp3|avif|pdf|mov|gif|bmp|tiff|ico|webm|mkv|avi|qt|m4v)$/i
    );
  };

  const handleDragStart = (event: DragEvent, media: IMedia) => {
    const originalUrl = getFullMediaPath(media, false);

    event.dataTransfer?.setData('text/uri-list', originalUrl);
    event.dataTransfer?.setData('text/plain', originalUrl);
  };

  return {
    getFullMediaPath,
    isSliderContentUrl,
    handleDragStart,
    primeMediaCache,
    isMediaPathReady,
    EMPTY_MEDIA_SRC
  };
}
