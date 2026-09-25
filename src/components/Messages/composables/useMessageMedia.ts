import { getConfig } from '../../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl
} from '../../../services/useMediaBlobCache';
import type { IMedia } from '../../interfaces/interfaces';
import { buildBrowserCompatibleImageUrl } from '../../../utils/media-format';
import { buildMediaObjectUrl } from '../../../utils/media-url';

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

    const mediaPath = isThumb ? media.thumbnailPath || media.path : media.path;

    if (!mediaPath) {
      return EMPTY_MEDIA_SRC;
    }

    const sourceUrl = buildMediaObjectUrl(
      config.CHAT_PATH_TO_FILE_CDN,
      mediaPath
    );
    return isThumb ? buildBrowserCompatibleImageUrl(sourceUrl) : sourceUrl;
  };

  const getSliderMediaPath = (media: IMedia) => {
    const sliderPath = buildBrowserCompatibleImageUrl(
      getFullMediaPath(media, false)
    );
    const pdfDetectionValue = media.originName || media.path || '';

    if (!/\.pdf(?:[?#]|$)/i.test(pdfDetectionValue)) {
      return sliderPath;
    }

    // YUI currently detects PDF URLs only when the full value ends in `.pdf`.
    // Keep cache-busting query parameters and add a request-safe fragment.
    return `${sliderPath.split('#')[0]}#document.pdf`;
  };

  const isSliderContentUrl = (
    fileUrl: string,
    options?: { includePdf?: boolean }
  ) => {
    const cleanUrl = fileUrl?.split(/[?#]/)[0] || '';
    const extensions =
      options?.includePdf === false
        ? 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|heic|heif|gif|bmp|tiff|ico|webm|mkv|avi|mov|qt|m4v'
        : 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|heic|heif|pdf|gif|bmp|tiff|ico|webm|mkv|avi|mov|qt|m4v';

    return new RegExp(`\\.(${extensions})$`, 'i').test(cleanUrl);
  };

  const getOriginalMediaUrl = (media: IMedia) => {
    if (media.localPath) {
      return media.localPath;
    }

    return getFullMediaPath(media, false);
  };

  const getRemoteThumbnailUrl = (media: IMedia): string | undefined => {
    if (!media.thumbnailPath || media.thumbnailPath === media.path) {
      return undefined;
    }

    return buildBrowserCompatibleImageUrl(
      buildMediaObjectUrl(config.CHAT_PATH_TO_FILE_CDN, media.thumbnailPath)
    );
  };

  const canDragMedia = (media: IMedia) =>
    Boolean(
      !media.isLoading && !media.uploadError && (media.localPath || media.path)
    );

  const handleDragStart = (event: DragEvent, media: IMedia) => {
    if (!event.dataTransfer || !canDragMedia(media)) {
      event.preventDefault();
      return;
    }

    const originalUrl = getOriginalMediaUrl(media);
    const fallbackUrl = media.path
      ? buildMediaObjectUrl(config.CHAT_PATH_TO_FILE_CDN, media.path)
      : originalUrl;

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData('text/uri-list', fallbackUrl);
    event.dataTransfer.setData('text/plain', fallbackUrl);
  };

  return {
    getFullMediaPath,
    getSliderMediaPath,
    isSliderContentUrl,
    handleDragStart,
    canDragMedia,
    primeMediaCache,
    isMediaPathReady,
    getRemoteThumbnailUrl,
    EMPTY_MEDIA_SRC
  };
}
