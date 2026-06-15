import { getConfig } from '../../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl
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

  const primeMediaCache = (
    media: IMedia,
    opts?: { includeOriginal?: boolean }
  ) => {
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

    if (media.path.endsWith('.gif')) {
      return `${config.CHAT_PATH_TO_FILE_CDN}/${media.path}`;
    }

    return `${config.CHAT_PATH_TO_FILE_CDN}/${isThumb ? media.thumbnailPath : media.path}`;
  };

  const isSliderContentUrl = (
    fileUrl: string,
    options?: { includePdf?: boolean }
  ) => {
    const cleanUrl = fileUrl?.split(/[?#]/)[0] || '';
    const extensions =
      options?.includePdf === false
        ? 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|gif|bmp|tiff|ico|webm|mkv|avi|qt|m4v'
        : 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|pdf|gif|bmp|tiff|ico|webm|mkv|avi|qt|m4v';

    return new RegExp(`\\.(${extensions})$`, 'i').test(cleanUrl);
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
