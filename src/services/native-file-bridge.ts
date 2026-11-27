import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import { startOperationNotification } from '../composables/useNotifications';

interface SliderOperationFeedback {
  success: () => void;
  error: (error?: unknown) => void;
}

interface NativeFileDownloadProgress {
  requestId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent?: number;
}

export interface NativeFilePlugin {
  getMessageUploadCapabilities(): Promise<{ version: number }>;
  prepareMessageUpload(
    options: Record<string, unknown>
  ): Promise<{ status: string }>;
  stageMessageUploadChunk(options: {
    id: string;
    index: number;
    offset: number;
    base64: string;
  }): Promise<void>;
  enqueueMessageUpload(options: { id: string }): Promise<void>;
  cancelMessageUpload(options: { id: string }): Promise<void>;
  retryMessageUpload(options: { id: string }): Promise<void>;
  getMessageUpload(options: { id: string }): Promise<{
    status:
      | 'missing'
      | 'staging'
      | 'queued'
      | 'uploading'
      | 'completed'
      | 'failed'
      | 'cancelled';
    fileIndex?: number;
    percent?: number;
    message?: unknown;
    error?: string;
  }>;
  addListener(
    eventName: 'fileDownloadProgress',
    listenerFunc: (payload: NativeFileDownloadProgress) => void
  ): Promise<PluginListenerHandle>;
  openFile(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ path: string; mimeType: string }>;
  openDownloadedFile(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    localUri?: string;
  }): Promise<{
    path: string;
    mimeType: string;
    timings?: { queueMs: number; lookupMs: number; launchMs: number };
  }>;
  getFileStatus(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
  }): Promise<{
    downloaded: boolean;
    path: string;
    fileName: string;
    mimeType: string;
  }>;
  downloadFile(options: {
    url: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ downloadId: number; fileName: string }>;
  downloadFileToDownloads(options: {
    requestId: string;
    url: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
  }): Promise<{ path: string; fileName: string; mimeType: string }>;
  downloadBase64(options: {
    base64Data: string;
    fileName?: string;
    mimeType?: string;
  }): Promise<{ uri: string; fileName: string }>;
}

declare global {
  interface Window {
    __CHAT_NATIVE_FILE__?: {
      beginCopy?: () => SliderOperationFeedback;
      beginDownload?: () => SliderOperationFeedback | null;
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

export const NativeFile = registerPlugin<NativeFilePlugin>('NativeFile');

export const isAndroidNativePlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const registerNativeFileBridge = () => {
  if (typeof window === 'undefined') {
    return;
  }

  window.__CHAT_NATIVE_FILE__ = {
    beginCopy: () => {
      const feedback = startOperationNotification('Копируем…');
      return {
        success: () => feedback.success('Скопировано'),
        error: () => feedback.error('Не удалось скопировать вложение')
      };
    },
    beginDownload: () => {
      // В Tauri основной загрузчик сам показывает проценты и итог сохранения.
      if (isTauri()) return null;
      const feedback = startOperationNotification('Начинаем скачивание…');
      return {
        success: () => feedback.success('Скачивание начато'),
        error: () => feedback.error('Не удалось скачать файл')
      };
    },
    // UI-kit использует это историческое имя для проверки нативных скачиваний.
    isAndroidNativePlatform: () => isAndroidNativePlatform() || isTauri(),
    downloadFile: async options =>
      isTauri()
        ? (await import('./tauri-file-bridge')).TauriFile.downloadFile(options)
        : NativeFile.downloadFile(options),
    downloadBase64: async options =>
      isTauri()
        ? (await import('./tauri-file-bridge')).TauriFile.downloadBase64(
            options
          )
        : NativeFile.downloadBase64(options)
  };
};
