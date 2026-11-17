import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { NativeFilePlugin } from './native-file-bridge';
import { buildMediaDownloadUrl } from '../utils/media-download';
import { deferWebUpdateReload } from './web-update-activity';

type FileOptions = Parameters<NativeFilePlugin['getFileStatus']>[0];
type FileStatus = Awaited<ReturnType<NativeFilePlugin['getFileStatus']>>;

const normalizeFileOptions = <T extends FileOptions>(options: T): T => {
  // API может вернуть bigint-размер строкой; Rust IPC ожидает целое число.
  const size = Number(options.size);
  return {
    ...options,
    size: Number.isSafeInteger(size) && size >= 0 ? size : undefined
  };
};

const invokeFileAction = async (
  command: string,
  args: Record<string, unknown>
): Promise<FileStatus> => {
  const finish = deferWebUpdateReload();
  try {
    return await invoke<FileStatus>(command, args);
  } catch (error) {
    const { showErrorNotification } = await import(
      '../composables/useNotifications'
    );
    showErrorNotification(error);
    throw error;
  } finally {
    finish();
  }
};

export const TauriFile = {
  getFileStatus: (options: FileOptions) =>
    invoke<FileStatus>('desktop_file_status', {
      options: normalizeFileOptions(options)
    }),
  downloadFileToDownloads: (
    options: Parameters<NativeFilePlugin['downloadFileToDownloads']>[0]
  ) =>
    invokeFileAction('desktop_file_download', {
      options: {
        ...normalizeFileOptions(options),
        url: buildMediaDownloadUrl(options.url, options.fileName)
      }
    }),
  openDownloadedFile: (
    options: FileOptions
  ): ReturnType<NativeFilePlugin['openDownloadedFile']> =>
    invokeFileAction('desktop_file_open', {
      options: normalizeFileOptions(options)
    }),
  async downloadFile(options: FileOptions) {
    const result = await TauriFile.downloadFileToDownloads({
      ...options,
      requestId: options.url
    });
    return { downloadId: 0, fileName: result.fileName };
  },
  async downloadBase64(
    options: Parameters<NativeFilePlugin['downloadBase64']>[0]
  ) {
    const result = await invokeFileAction('desktop_file_save', { options });
    return { uri: result.path, fileName: result.fileName };
  },
  async openFile(options: FileOptions) {
    await TauriFile.downloadFileToDownloads({
      ...options,
      requestId: options.url
    });
    return TauriFile.openDownloadedFile(options);
  },
  async addListener(
    _event: 'fileDownloadProgress',
    callback: Parameters<NativeFilePlugin['addListener']>[1]
  ) {
    const unlisten = await listen<Parameters<typeof callback>[0]>(
      'sep-chat://file-download-progress',
      event => callback(event.payload)
    );
    return { remove: async () => unlisten() };
  },
  showInFolder: (options: FileOptions) =>
    invokeFileAction('desktop_file_open', {
      options: normalizeFileOptions(options),
      reveal: true
    })
};
