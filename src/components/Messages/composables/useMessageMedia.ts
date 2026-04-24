import { getConfig } from '../../../services/useConfig';
import type { IMedia } from '../../interfaces/interfaces';

export function useMessageMedia() {
  const config = getConfig();

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
    handleDragStart
  };
}
