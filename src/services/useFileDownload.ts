import { Capacitor, registerPlugin } from '@capacitor/core';
import type { IMedia } from '../components/interfaces/interfaces';
import { getConfig } from './useConfig';
import { ensureMediaObjectUrl } from './useMediaBlobCache';

interface NativeFileDownloadPlugin {
  downloadFile(options: {
    url: string;
    fileName: string;
    mimeType?: string | null;
  }): Promise<{ downloadId: string }>;
}

const FileDownload = registerPlugin<NativeFileDownloadPlugin>('FileDownload');
const ANDROID_DOWNLOAD_LOG_TAG = '[MessageFileDownload][Android]';

const getFileUrl = (path: string) => {
  const config = getConfig();
  return `${config.CHAT_PATH_TO_FILE_CDN}/${path}`;
};

export const getDownloadFileName = (fileName?: string | null) =>
  (fileName || 'file').replace(/[\\/:*?"<>|]/g, '_');

const getMimeTypeFromFileName = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'txt':
      return 'text/plain';
    case 'zip':
      return 'application/zip';
    case 'rar':
      return 'application/vnd.rar';
    case '7z':
      return 'application/x-7z-compressed';
    default:
      return 'application/octet-stream';
  }
};

const triggerAnchorDownload = (url: string, fileName: string) => {
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadMessageFile = async (media: IMedia) => {
  if (!media.path) {
    throw new Error('Message file path is empty');
  }

  const fileName = getDownloadFileName(media.originName);
  const fileUrl = getFileUrl(media.path);
  const mimeType = getMimeTypeFromFileName(fileName);

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    console.info(`${ANDROID_DOWNLOAD_LOG_TAG} Starting native download`, {
      fileName,
      fileUrl,
      mimeType
    });

    return FileDownload.downloadFile({
      url: fileUrl,
      fileName,
      mimeType
    });
  }

  const cachedObjectUrl = await ensureMediaObjectUrl(media.path);
  triggerAnchorDownload(cachedObjectUrl || fileUrl, fileName);

  return { downloadId: '' };
};
