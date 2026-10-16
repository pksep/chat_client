import type { PluginListenerHandle } from '@capacitor/core';
import { reactive } from 'vue';
import type { IMedia } from '../components/interfaces/interfaces';
import { isAndroidNativePlatform, NativeFile } from './native-file-bridge';
import { getConfig } from './useConfig';
import { buildMediaObjectUrl } from '../utils/media-url';
import { createTelemetryTraceId, recordTelemetryEvent } from './useTelemetry';

type NativeDownloadPhase =
  | 'unknown'
  | 'checking'
  | 'opening'
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
const pendingNativeChecks = new Map<string, Promise<boolean>>();
const pendingNativeOpens = new Map<string, Promise<boolean>>();
const pendingNativeClicks = new Map<string, Promise<boolean>>();
const nativeStatusCheckedAt = new Map<string, number>();
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
  media: IMedia,
  force = false
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const current = nativeFileDownloadStates[key];
  if (current?.phase === 'downloading' || current?.phase === 'opening')
    return Boolean(current.localUri);
  const pending = pendingNativeChecks.get(key);
  if (pending) return pending;
  if (!force && Date.now() - (nativeStatusCheckedAt.get(key) || 0) < 30_000)
    return current?.phase === 'downloaded';

  const checking: NativeFileDownloadState = {
    ...current,
    phase: 'checking',
    percent: null
  };
  nativeFileDownloadStates[key] = checking;
  const check = (async () => {
    try {
      const status = await NativeFile.getFileStatus(
        getNativeFileOptions(media)
      );
      // Ответ старой проверки не должен затереть завершившуюся загрузку.
      if (
        nativeFileDownloadStates[key] === checking ||
        nativeFileDownloadStates[key]?.phase === 'checking'
      ) {
        nativeFileDownloadStates[key] = {
          phase: status.downloaded ? 'downloaded' : 'not-downloaded',
          percent: null,
          localUri: status.downloaded ? status.path : undefined,
          fileName: status.fileName,
          mimeType: status.mimeType
        };
        nativeStatusCheckedAt.set(key, Date.now());
      }
      return status.downloaded;
    } catch (error) {
      console.warn('Failed to check native file status:', error);
      if (nativeFileDownloadStates[key]?.phase === 'checking')
        nativeFileDownloadStates[key] = { phase: 'unknown', percent: null };
      return false;
    } finally {
      pendingNativeChecks.delete(key);
    }
  })();
  pendingNativeChecks.set(key, check);
  return check;
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
      nativeStatusCheckedAt.set(key, Date.now());

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
  media: IMedia,
  clickTiming?: { startedAt: number; traceId: string; statusCheckMs: number }
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const pending = pendingNativeOpens.get(key);
  if (pending) return pending;
  const currentState = nativeFileDownloadStates[key];
  nativeFileDownloadStates[key] = {
    ...currentState,
    phase: 'opening',
    percent: null
  };
  const startedAt = clickTiming?.startedAt ?? performance.now();
  const traceId = clickTiming?.traceId || createTelemetryTraceId('file-open');
  const record = (stage: string, payload: Record<string, unknown> = {}) =>
    recordTelemetryEvent({
      category: 'chat',
      name: `chat.file_open.${stage}`,
      traceId,
      entityType: 'media',
      entityId: media.id,
      level: stage === 'failed' ? 'error' : 'info',
      payload: {
        extension: getFileExtension(media.originName),
        size: media.size,
        hasLocalUri: Boolean(currentState?.localUri),
        statusCheckMs: clickTiming?.statusCheckMs ?? 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        ...payload
      }
    });
  record('requested');
  const open = (async () => {
    try {
      const result = await NativeFile.openDownloadedFile({
        ...getNativeFileOptions(media),
        localUri: currentState?.localUri,
        fileName:
          currentState?.fileName || getNativeFileOptions(media).fileName,
        mimeType: currentState?.mimeType || getNativeFileOptions(media).mimeType
      });
      nativeFileDownloadStates[key] = {
        ...currentState,
        localUri: result.path,
        mimeType: result.mimeType,
        phase: 'downloaded',
        percent: null
      };
      record('viewer_launched', { nativeTimings: result.timings });
      return true;
    } catch (error) {
      const missing = (error as { code?: string })?.code === 'FILE_NOT_FOUND';
      nativeFileDownloadStates[key] = missing
        ? { phase: 'not-downloaded', percent: null }
        : { ...currentState, phase: 'downloaded', percent: null };
      if (missing) nativeStatusCheckedAt.delete(key);
      record('failed', {
        code: (error as { code?: string })?.code || 'UNKNOWN'
      });
      throw error;
    } finally {
      pendingNativeOpens.delete(key);
    }
  })();
  pendingNativeOpens.set(key, open);
  return open;
};

export const handleNativeFileClick = async (
  media: IMedia
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isAndroidNativePlatform() || !media.path || !key) {
    return false;
  }

  const pending = pendingNativeClicks.get(key);
  if (pending) return pending;
  const click = (async () => {
    let state = getNativeFileDownloadState(media);
    if (state.phase === 'downloading' || state.phase === 'opening') return true;
    const startedAt = performance.now();
    const traceId = createTelemetryTraceId('file-open');
    recordTelemetryEvent({
      category: 'chat',
      name: 'chat.file_open.clicked',
      traceId,
      entityType: 'media',
      entityId: media.id,
      payload: {
        extension: getFileExtension(media.originName),
        size: media.size,
        phase: state.phase
      }
    });
    let statusCheckMs = 0;
    if (
      state.phase === 'unknown' ||
      state.phase === 'checking' ||
      state.phase === 'error'
    ) {
      await refreshNativeFileDownloadStatus(media);
      statusCheckMs = Math.round(performance.now() - startedAt);
      state = getNativeFileDownloadState(media);
    }
    if (state.phase === 'downloaded') {
      try {
        await openDownloadedNativeFile(media, {
          startedAt,
          traceId,
          statusCheckMs
        });
      } catch (error) {
        console.warn('Failed to open downloaded native file:', error);
      }
    } else {
      await downloadNativeFileToDownloads(media);
    }
    return true;
  })();
  pendingNativeClicks.set(key, click);
  try {
    return await click;
  } finally {
    pendingNativeClicks.delete(key);
  }
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
