import { Capacitor, registerPlugin } from '@capacitor/core';
import type { IMedia } from '../components/interfaces/interfaces';
import { getConfig } from './useConfig';

interface NativeFilePlugin {
  openFile(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ path: string; mimeType: string }>;
  downloadFile(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ downloadId: number; fileName: string }>;
  downloadBase64(options: {
    base64Data: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ uri: string; fileName: string }>;
}

declare global {
  interface Window {
    __CHAT_NATIVE_FILE__?: {
      isAndroidNativePlatform: () => boolean;
      downloadFile: (options: {
        url: string;
        fileName?: string;
        mimeType?: string;
      }) => Promise<{ downloadId: number; fileName: string }>;
      downloadBase64: (options: {
        base64Data: string;
        fileName?: string;
        mimeType?: string;
      }) => Promise<{ uri: string; fileName: string }>;
    };
  }
}

const NativeFile = registerPlugin<NativeFilePlugin>('NativeFile');

const FILE_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed'
};

const isAndroidNativePlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const buildAbsoluteFileUrl = (path: string) => {
  if (/^(https?:|blob:|data:)/i.test(path)) {
    return path;
  }

  const config = getConfig();
  return `${config.CHAT_PATH_TO_FILE_CDN}/${path}`;
};

const getFileExtension = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const cleanValue = value.split('?')[0];
  const match = cleanValue.match(/\.([^.]+)$/);

  return match?.[1]?.toLowerCase() || '';
};

const guessMimeType = (media: IMedia) => {
  const extension =
    getFileExtension(media.originName) || getFileExtension(media.path);

  return FILE_MIME_TYPES[extension];
};

export const isNativePdfMedia = (media: IMedia) =>
  getFileExtension(media.originName) === 'pdf' ||
  getFileExtension(media.path) === 'pdf';

export const openNativeFile = async (media: IMedia): Promise<boolean> => {
  if (!isAndroidNativePlatform() || !media.path) {
    return false;
  }

  await NativeFile.openFile({
    url: buildAbsoluteFileUrl(media.path),
    fileName: media.originName || 'file',
    mimeType: guessMimeType(media)
  });

  return true;
};

export const downloadNativeFile = async (media: IMedia): Promise<boolean> => {
  if (!isAndroidNativePlatform() || !media.path) {
    return false;
  }

  await NativeFile.downloadFile({
    url: buildAbsoluteFileUrl(media.path),
    fileName: media.originName || 'file',
    mimeType: guessMimeType(media)
  });

  return true;
};

export const registerNativeFileBridge = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.__CHAT_NATIVE_FILE__ = {
    isAndroidNativePlatform,
    downloadFile: options => NativeFile.downloadFile(options),
    downloadBase64: options => NativeFile.downloadBase64(options)
  };
};
