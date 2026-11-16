import { invoke, isTauri } from '@tauri-apps/api/core';
import { getConfig } from './useConfig';
import { buildMediaObjectUrl } from '../utils/media-url';
import { getUploadFileSizeError } from './useChatSDK/multipart-upload';
import { showErrorNotification } from '../composables/useNotifications';
import type { IMedia } from '../components/interfaces/interfaces';

interface LocalFileInfo {
  name: string;
  mimeType: string;
  lastModified?: number;
  size: number;
}

interface LocalSource {
  path: string;
  digest: string;
  fileName: string;
}

// Редактор создаёт новые File для фото. Сверяем содержимое, чтобы после
// редактирования картинки не открывать её прежний исходник.
const sources = new Map<string, LocalSource[]>();
const fileDigests = new WeakMap<File, string>();
const fileSources = new WeakMap<File, LocalSource>();
const sourceKey = (file: File) => `${file.size}:${file.lastModified}`;
const digestBytes = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join(
    ''
  );
};

export const readTauriFiles = async (paths: string[]): Promise<File[]> => {
  const files: File[] = [];
  // Не читаем несколько крупных вложений одновременно.
  for (const path of paths) {
    try {
      const info = await invoke<LocalFileInfo>('desktop_file_read_info', {
        path
      });
      const sizeError = getUploadFileSizeError(info);
      if (sizeError) throw new Error(sizeError);
      const response = await invoke<ArrayBuffer | number[]>(
        'read_dropped_file',
        {
          path
        }
      );
      const bytes =
        response instanceof ArrayBuffer
          ? response
          : new Uint8Array(response).buffer;
      if (bytes.byteLength !== info.size)
        throw new Error(
          'Файл изменился во время чтения. Выберите его ещё раз.'
        );
      const digest = await digestBytes(bytes);
      const file = new File([bytes], info.name, {
        type: info.mimeType || '',
        lastModified: info.lastModified ?? Date.now()
      });
      fileDigests.set(file, digest);
      const source = { path, digest, fileName: info.name };
      fileSources.set(file, source);
      const key = sourceKey(file);
      const candidates = sources.get(key) || [];
      sources.set(key, [
        source,
        ...candidates.filter(source => source.path !== path)
      ]);
      files.push(file);
    } catch (error) {
      showErrorNotification(error);
    }
  }
  return files;
};

export const registerTauriUploadedFile = async (
  file: File,
  uploadedPath: string
): Promise<void> => {
  if (!isTauri()) return;
  const candidates = sources.get(sourceKey(file));
  if (!candidates?.length) return;
  try {
    const digest =
      fileDigests.get(file) || (await digestBytes(await file.arrayBuffer()));
    fileDigests.set(file, digest);
    const source =
      fileSources.get(file) ||
      candidates.find(
        candidate =>
          candidate.digest === digest && candidate.fileName.trim() === file.name
      ) ||
      candidates.find(candidate => candidate.digest === digest);
    if (!source) return;
    await invoke('desktop_file_register_source', {
      path: source.path,
      sha256: digest,
      options: {
        url: buildMediaObjectUrl(
          getConfig().CHAT_PATH_TO_FILE_CDN,
          uploadedPath
        ),
        fileName: file.name,
        size: file.size,
        mimeType: file.type
      }
    });
    const { refreshNativeFileDownloadStatus } = await import('./useNativeFile');
    await refreshNativeFileDownloadStatus(
      {
        id: uploadedPath,
        path: uploadedPath,
        originName: file.name,
        size: file.size
      } as IMedia,
      true
    );
  } catch {
    // Отправка уже завершена. Если исходник исчез, вложение можно скачать.
    console.warn('Не удалось сохранить расположение отправленного файла');
  }
};
