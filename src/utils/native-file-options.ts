import { MediaType } from '@pksep/zod-shared-chat';
import type { IMedia } from '../components/interfaces/interfaces';

// У изображений и видео size может относиться к исходнику до обработки сервером.
// Размер скачиваемого представления проверяется по HTTP Content-Length в native-коде.
export const getNativeDownloadSize = (media: IMedia): number | undefined =>
  media.type === MediaType.Image || media.type === MediaType.Video
    ? undefined
    : media.size;

export const nativeFileUrlKey = (value: string): string => {
  try {
    const url = new URL(value);
    for (const key of ['v', 'preview', 'downloadName'])
      url.searchParams.delete(key);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
};
