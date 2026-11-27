import type { PluginListenerHandle } from '@capacitor/core';
import { reactive } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { TauriFile } from './tauri-file-bridge';
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
  | 'cancelling'
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
const nativeDownloadAttempts = new Map<
  string,
  { key: string; requestId: string; cancelled: boolean; started: boolean }
>();
const pendingNativeChecks = new Map<string, Promise<boolean>>();
const pendingNativeOpens = new Map<string, Promise<boolean>>();
const pendingNativeClicks = new Map<string, Promise<boolean>>();
const nativeStatusCheckedAt = new Map<string, number>();
let nativeProgressListenerPromise: Promise<PluginListenerHandle | null> | null =
  null;

const nativeFileBridge = () => (isTauri() ? TauriFile : NativeFile);

export const isNativeFileMediaSupported = (media: IMedia): boolean =>
  isNativeFileDownloadSupported() &&
  // Файлы обращений открываются через существующую проверку прав и blob.
  !(isTauri() && /^manager-private\//i.test(media.path));

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
  (isTauri() && media.path ? buildAbsoluteFileUrl(media.path) : media.path) ||
  media.id ||
  media.originName ||
  '';

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

  if (!isNativeFileDownloadSupported()) {
    nativeProgressListenerPromise = Promise.resolve(null);
    return nativeProgressListenerPromise;
  }

  nativeProgressListenerPromise = nativeFileBridge()
    .addListener('fileDownloadProgress', payload => {
      const attempt = [...nativeDownloadAttempts.values()].find(
        item => item.requestId === payload.requestId
      );
      const key = attempt?.key ?? payload.requestId;
      if (attempt?.cancelled && isTauri()) {
        void TauriFile.cancelDownload(attempt.requestId).catch(() => undefined);
        return;
      }
      const currentState = nativeFileDownloadStates[key];

      if (!currentState || currentState.phase !== 'downloading') {
        return;
      }

      nativeFileDownloadStates[key] = {
        ...currentState,
        phase: 'downloading',
        percent:
          typeof payload.percent === 'number' &&
          Number.isFinite(payload.percent)
            ? Math.max(0, Math.min(100, payload.percent))
            : currentState.percent
      };
    })
    .catch(error => {
      console.warn('Failed to listen native file download progress:', error);
      return null;
    });

  return nativeProgressListenerPromise;
};

export const isNativePdfMedia = (media: IMedia) =>
  getFileExtension(media.originName) === 'pdf' ||
  getFileExtension(media.path) === 'pdf';

export const isNativeFileDownloadSupported = () =>
  isAndroidNativePlatform() || isTauri();

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

  if (!isNativeFileMediaSupported(media) || !media.path || !key) {
    return false;
  }

  const current = nativeFileDownloadStates[key];
  if (
    current &&
    ['downloading', 'cancelling', 'opening'].includes(current.phase)
  )
    return Boolean(current.localUri);
  const pending = pendingNativeChecks.get(key);
  if (pending) return pending;
  if (!force && Date.now() - (nativeStatusCheckedAt.get(key) || 0) < 30_000)
    return current?.phase === 'downloaded';

  // Фоновая проверка не должна скрывать уже известный значок файла.
  if (current?.phase !== 'downloaded' && current?.phase !== 'not-downloaded') {
    nativeFileDownloadStates[key] = {
      ...current,
      phase: 'checking',
      percent: null
    };
  }
  const checkedState = nativeFileDownloadStates[key];
  const check = (async () => {
    try {
      const status = await nativeFileBridge().getFileStatus(
        getNativeFileOptions(media)
      );
      // Ответ старой проверки не должен затереть завершившуюся загрузку.
      if (nativeFileDownloadStates[key] === checkedState) {
        const nextState: NativeFileDownloadState = {
          phase: status.downloaded ? 'downloaded' : 'not-downloaded',
          percent: null,
          localUri: status.downloaded ? status.path : undefined,
          fileName: status.fileName,
          mimeType: status.mimeType
        };
        if (
          checkedState.phase !== nextState.phase ||
          checkedState.localUri !== nextState.localUri ||
          checkedState.fileName !== nextState.fileName ||
          checkedState.mimeType !== nextState.mimeType
        ) {
          nativeFileDownloadStates[key] = nextState;
        }
        nativeStatusCheckedAt.set(key, Date.now());
      }
      return status.downloaded;
    } catch (error) {
      console.warn('Failed to check native file status:', error);
      if (
        nativeFileDownloadStates[key] === checkedState &&
        checkedState.phase === 'checking'
      )
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

  if (!isNativeFileMediaSupported(media) || !media.path || !key) {
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

  const attempt = {
    key,
    requestId: isTauri() ? crypto.randomUUID() : key,
    cancelled: false,
    started: false
  };
  nativeDownloadAttempts.set(key, attempt);

  const download = (async () => {
    try {
      await ensureNativeProgressListener();
      if (attempt.cancelled) {
        nativeFileDownloadStates[key] = {
          phase: 'not-downloaded',
          percent: null
        };
        return false;
      }
      attempt.started = true;
      const downloadedFile = await nativeFileBridge().downloadFileToDownloads({
        requestId: attempt.requestId,
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
      const cancelled =
        (error as { code?: string })?.code === 'FILE_DOWNLOAD_CANCELLED';
      if (!cancelled) console.warn('Failed to download native file:', error);
      nativeFileDownloadStates[key] = {
        phase: cancelled ? 'not-downloaded' : 'error',
        percent: null
      };
      return false;
    } finally {
      pendingNativeDownloads.delete(key);
      nativeDownloadAttempts.delete(key);
    }
  })();

  pendingNativeDownloads.set(key, download);
  return download;
};

export const canCancelNativeFileDownload = (media: IMedia): boolean =>
  isTauri() &&
  ['downloading', 'cancelling'].includes(
    getNativeFileDownloadState(media).phase
  );

export const cancelNativeFileDownload = async (
  media: IMedia
): Promise<void> => {
  const key = getNativeFileKey(media);
  const attempt = nativeDownloadAttempts.get(key);
  if (!isTauri() || !attempt) return;
  attempt.cancelled = true;
  nativeFileDownloadStates[key] = {
    ...nativeFileDownloadStates[key],
    phase: 'cancelling'
  };
  try {
    if (attempt.started) await TauriFile.cancelDownload(attempt.requestId);
    await pendingNativeDownloads.get(key);
  } catch (error) {
    attempt.cancelled = false;
    if (nativeDownloadAttempts.get(key) === attempt) {
      nativeFileDownloadStates[key] = {
        ...nativeFileDownloadStates[key],
        phase: 'downloading'
      };
    }
    throw error;
  }
};

export const openDownloadedNativeFile = async (
  media: IMedia,
  clickTiming?: { startedAt: number; traceId: string; statusCheckMs: number }
): Promise<boolean> => {
  const key = getNativeFileKey(media);

  if (!isNativeFileMediaSupported(media) || !media.path || !key) {
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
      const result = await nativeFileBridge().openDownloadedFile({
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

  if (!isNativeFileMediaSupported(media) || !media.path || !key) {
    return false;
  }

  const pending = pendingNativeClicks.get(key);
  if (pending) return pending;
  const click = (async () => {
    let state = getNativeFileDownloadState(media);
    if (['downloading', 'cancelling', 'opening'].includes(state.phase))
      return true;
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
  if (!isNativeFileMediaSupported(media) || !media.path) {
    return false;
  }

  await nativeFileBridge().openFile(getNativeFileOptions(media));

  return true;
};

export const downloadNativeFile = async (media: IMedia): Promise<boolean> => {
  if (!isNativeFileMediaSupported(media) || !media.path) {
    return false;
  }

  if (isTauri()) {
    await downloadNativeFileToDownloads(media);
  } else {
    await NativeFile.downloadFile(getNativeFileOptions(media));
  }

  return true;
};

export const canShowNativeFileInFolder = (media?: IMedia | null): boolean =>
  isTauri() &&
  !!media &&
  getNativeFileDownloadState(media).phase === 'downloaded';

export const showNativeFileInFolder = async (media: IMedia): Promise<void> => {
  if (!isTauri()) return;
  if (!(await refreshNativeFileDownloadStatus(media, true))) return;
  await TauriFile.showInFolder(getNativeFileOptions(media)).catch(error => {
    console.warn('Не удалось показать файл в папке:', error);
  });
};
