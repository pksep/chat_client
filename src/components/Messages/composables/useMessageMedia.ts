import { getConfig } from '../../../services/useConfig';
import {
  ensureMediaObjectUrl,
  getCachedMediaObjectUrl,
  isInquiryFile
} from '../../../services/useMediaBlobCache';
import type { IMedia } from '../../interfaces/interfaces';
import { buildBrowserCompatibleImageUrl } from '../../../utils/media-format';
import { buildMediaObjectUrl } from '../../../utils/media-url';

interface MessageMediaHelpers {
  getFullMediaPath: (media: IMedia, isThumb?: boolean) => string;
  getSliderMediaPath: (media: IMedia) => string;
  isSliderContentUrl: (
    fileUrl: string,
    options?: { includePdf?: boolean }
  ) => boolean;
  handleDragStart: (event: DragEvent, media: IMedia) => void;
  canDragMedia: (media: IMedia) => boolean;
  primeMediaCache: (
    media: IMedia,
    opts?: { includeOriginal?: boolean }
  ) => void;
  isMediaPathReady: (media: IMedia, isThumb?: boolean) => boolean;
  getRemoteThumbnailUrl: (media: IMedia) => string | undefined;
  EMPTY_MEDIA_SRC: string;
}

export function useMessageMedia(): MessageMediaHelpers {
  const config = getConfig();
  const EMPTY_MEDIA_SRC =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  const getPreferredMediaPath = (media: IMedia, isThumb = true): string =>
    isThumb ? media.thumbnailPath || media.path : media.path;

  const setCachedObjectUrlOnMedia = (
    media: IMedia,
    path: string,
    objectUrl: string,
    isThumb: boolean
  ): void => {
    if (isThumb && (media.thumbnailPath || media.path) === path) {
      media.localThumbnailPath = objectUrl;
    }

    if (media.path === path) {
      media.localPath = objectUrl;
    }
  };

  const isMediaPathReady = (media: IMedia, isThumb = true): boolean => {
    const preferredPath = getPreferredMediaPath(media, isThumb);
    if (preferredPath && isInquiryFile(preferredPath)) {
      return Boolean(getCachedMediaObjectUrl(preferredPath));
    }

    if (isThumb && media.localThumbnailPath) {
      return true;
    }

    if (media.localPath && (isThumb || !media.path)) {
      return true;
    }

    return Boolean(preferredPath && getCachedMediaObjectUrl(preferredPath));
  };

  const primeMediaCache = (
    media: IMedia,
    opts?: { includeOriginal?: boolean }
  ): void => {
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

  const getFullMediaPath = (media: IMedia, isThumb = true): string => {
    const preferredPath = getPreferredMediaPath(media, isThumb);

    // Приватный файл нельзя открывать через CDN или прямой src без Bearer.
    // Не используем старые blob-ссылки из восстановленного сообщения.
    if (preferredPath && isInquiryFile(preferredPath)) {
      return getCachedMediaObjectUrl(preferredPath) || EMPTY_MEDIA_SRC;
    }

    if (isThumb && media.localThumbnailPath) {
      return media.localThumbnailPath;
    }

    if (media.localPath && (isThumb || !media.path)) {
      return media.localPath;
    }

    const cachedObjectUrl = getCachedMediaObjectUrl(preferredPath);
    if (cachedObjectUrl) {
      return cachedObjectUrl;
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

  const getSliderMediaPath = (media: IMedia): string => {
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
  ): boolean => {
    const cleanUrl = fileUrl?.split(/[?#]/)[0] || '';
    const extensions =
      options?.includePdf === false
        ? 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|heic|heif|gif|bmp|tiff|ico|webm|mkv|avi|mov|qt|m4v'
        : 'jpg|jpeg|png|webp|svg|mp4|mp3|avif|heic|heif|pdf|gif|bmp|tiff|ico|webm|mkv|avi|mov|qt|m4v';

    return new RegExp(`\\.(${extensions})$`, 'i').test(cleanUrl);
  };

  const getOriginalMediaUrl = (media: IMedia): string => {
    if (isInquiryFile(media.path || '')) {
      return getFullMediaPath(media, false);
    }

    if (media.localPath) {
      return media.localPath;
    }

    return getFullMediaPath(media, false);
  };

  const getRemoteThumbnailUrl = (media: IMedia): string | undefined => {
    if (!media.thumbnailPath || media.thumbnailPath === media.path) {
      return undefined;
    }
    if (isInquiryFile(media.thumbnailPath)) return getFullMediaPath(media);

    return buildBrowserCompatibleImageUrl(
      buildMediaObjectUrl(config.CHAT_PATH_TO_FILE_CDN, media.thumbnailPath)
    );
  };

  const canDragMedia = (media: IMedia): boolean =>
    Boolean(
      !media.isLoading &&
        !media.uploadError &&
        (media.localPath || media.path) &&
        (!isInquiryFile(media.path || '') ||
          getCachedMediaObjectUrl(media.path))
    );

  const handleDragStart = (event: DragEvent, media: IMedia): void => {
    if (!event.dataTransfer || !canDragMedia(media)) {
      event.preventDefault();
      return;
    }

    const originalUrl = getOriginalMediaUrl(media);
    const fallbackUrl =
      media.path && !isInquiryFile(media.path)
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
