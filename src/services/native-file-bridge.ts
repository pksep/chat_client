import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';

interface NativeFileDownloadProgress {
  requestId: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent?: number;
}

export interface NativeFilePlugin {
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
  }): Promise<{ path: string; mimeType: string }>;
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
    isAndroidNativePlatform,
    downloadFile: options => NativeFile.downloadFile(options),
    downloadBase64: options => NativeFile.downloadBase64(options)
  };
};
