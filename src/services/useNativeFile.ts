import type { PluginListenerHandle } from '@capacitor/core';
import { reactive } from 'vue';
import type { IMedia } from '../components/interfaces/interfaces';
import { isAndroidNativePlatform, NativeFile } from './native-file-bridge';
import { getConfig } from './useConfig';
import { buildMediaObjectUrl } from '../utils/media-url';

type NativeDownloadPhase =
  | 'unknown'
  | 'not-downloaded'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface NativeFileDownloadState {
  phase: NativeDownloadPhase;
  percent: number | null;
  localUri?: string;
  fileName?: string;
  mimeType?: string;
}

const nativeFileDownloadStates = reactive<
  Record<string, NativeFileDownloadState>
>({});
const pendingNativeDownloads = new Map<string, Promise<boolean>>();
let nativeProgressListenerPromise: Promise<PluginListenerHandle | null> | null =
  null;

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

const buildAbsoluteFileUrl = (path: string) => {
  if (/^(https?:|blob:|data:)/i.test(path)) {
    return path;
  }

  const config = getConfig();
  return buildMediaObjectUrl(config.CHAT_PATH_TO_FILE_CDN, path);
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

const getNativeFileKey = (media: IMedia) =>
  media.path || media.id || media.originName || '';

const getNativeFileOptions = (media: IMedia) => ({
  url: buildAbsoluteFileUrl(media.path),
  fileName: media.originName || 'file',
  mimeType: guessMimeType(media),
  size: media.size
});

const ensureNativeProgressListener = async () => {
  if (nativeProgressListenerPromise) {
    return nativeProgressListenerPromise;
  }

  if (!isAndroidNativePlatform()) {
    nativeProgressListenerPromise = Promise.resolve(null);
    return nativeProgressListenerPromise;
  }

  nativeProgressListenerPromise = NativeFile.addListener(
    'fileDownloadProgress',
    payload => {
      const currentState = nativeFileDownloadStates[payload.requestId];

      if (!currentState || currentState.phase !== 'downloading') {
        return;
      }

      nativeFileDownloadStates[payload.requestId] = {
        ...currentState,
        phase: 'downloading',
        percent:
          typeof payload.percent === 'number'
            ? Math.max(0, Math.min(100, payload.percent))
            : currentState.percent
      };
    }
  ).catch(error => {
    console.warn('Failed to listen native file download progress:', error);
    return null;
  });

  return nativeProgressListenerPromise;
};

export const isNativePdfMedia = (media: IMedia) =>
  getFileExtension(media.originName) === 'pdf' ||
  getFileExtension(media.path) === 'pdf';

export const isNativeFileDownloadSupported = () => isAndroidNativePlatform();

export const getNativeFileDownloadState = (
  media: IMedia
): NativeFileDownloadState => {
  const key = getNativeFileKey(media);

  return nativeFileDownloadStates[key] || { phase: 'unknown', percent: null };
};

export const refreshNativeFileDownloadStatus = async (
  media: IMedia
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  if (nativeFileDownloadStates[key]?.phase === 'downloading') {
    return false;
  }

  try {
    const status = await NativeFile.getFileStatus(getNativeFileOptions(media));

    nativeFileDownloadStates[key] = {
      phase: status.downloaded ? 'downloaded' : 'not-downloaded',
      percent: null
    };

    return status.downloaded;
  } catch (error) {
    console.warn('Failed to check native file status:', error);
    nativeFileDownloadStates[key] = { phase: 'unknown', percent: null };
    return false;
  }
};

export const downloadNativeFileToDownloads = async (
  media: IMedia
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const pendingDownload = pendingNativeDownloads.get(key);
  if (pendingDownload) {
    return pendingDownload;
  }

  nativeFileDownloadStates[key] = {
    phase: 'downloading',
    percent: null
  };

  const download = (async () => {
    await ensureNativeProgressListener();

    try {
      const downloadedFile = await NativeFile.downloadFileToDownloads({
        requestId: key,
        ...getNativeFileOptions(media)
      });

      nativeFileDownloadStates[key] = {
        phase: 'downloaded',
        percent: null,
        localUri: downloadedFile.path,
        fileName: downloadedFile.fileName,
        mimeType: downloadedFile.mimeType
      };

      return true;
    } catch (error) {
      console.warn('Failed to download native file:', error);
      nativeFileDownloadStates[key] = {
        phase: 'error',
        percent: null
      };
      return false;
    } finally {
      pendingNativeDownloads.delete(key);
    }
  })();

  pendingNativeDownloads.set(key, download);
  return download;
};

export const openDownloadedNativeFile = async (
  media: IMedia
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const currentState = nativeFileDownloadStates[key];

  await NativeFile.openDownloadedFile({
    ...getNativeFileOptions(media),
    localUri: currentState?.localUri,
    fileName: currentState?.fileName || getNativeFileOptions(media).fileName,
    mimeType: currentState?.mimeType || getNativeFileOptions(media).mimeType
  });
  nativeFileDownloadStates[key] = {
    ...currentState,
    phase: 'downloaded',
    percent: null
  };

  return true;
};

export const handleNativeFileClick = async (
  media: IMedia
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const state = getNativeFileDownloadState(media);

  if (state.phase === 'downloading') {
    return true;
  }

  if (state.phase === 'downloaded') {
    try {
      await openDownloadedNativeFile(media);
    } catch (error) {
      console.warn('Failed to open downloaded native file:', error);
      nativeFileDownloadStates[key] = {
        ...state,
        phase: 'error',
        percent: null
      };
    }
    return true;
  }

  if (state.phase === 'not-downloaded') {
    await downloadNativeFileToDownloads(media);
    return true;
  }

  nativeFileDownloadStates[key] = {
    phase: 'downloading',
    percent: null
  };

  let isDownloaded = false;

  try {
    const status = await NativeFile.getFileStatus(getNativeFileOptions(media));
    isDownloaded = status.downloaded;
  } catch (error) {
    console.warn('Failed to check native file before download:', error);
  }

  if (isDownloaded) {
    try {
      await openDownloadedNativeFile(media);
    } catch (error) {
      console.warn('Failed to open downloaded native file:', error);
      nativeFileDownloadStates[key] = {
        ...nativeFileDownloadStates[key],
        phase: 'error',
        percent: null
      };
    }
    return true;
  }

  await downloadNativeFileToDownloads(media);
  return true;
};

export const openNativeFile = async (media: IMedia): Promise<boolean> => {
  if (!isAndroidNativePlatform() || !media.path) {
    return false;
  }

  await NativeFile.openFile(getNativeFileOptions(media));

  return true;
};

export const downloadNativeFile = async (media: IMedia): Promise<boolean> => {
  if (!isAndroidNativePlatform() || !media.path) {
    return false;
  }

  await NativeFile.downloadFile(getNativeFileOptions(media));

  return true;
};
