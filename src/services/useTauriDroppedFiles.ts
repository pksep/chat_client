import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { UnlistenFn } from '@tauri-apps/api/event';

interface TauriDroppedFilePayload {
  bytes: number[];
  lastModified?: number | null;
  mimeType?: string;
  name: string;
}

interface BindTauriFileDropOptions {
  getTargetElement: () => HTMLElement | null;
  onDragStateChange?: (isDragging: boolean) => void;
  onFilesDropped: (files: File[]) => void;
}

const isTauriRuntime = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

const getFallbackFileName = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);

  return parts[parts.length - 1] || `dropped-file-${Date.now()}`;
};

const readDroppedFile = async (path: string): Promise<File | null> => {
  try {
    const payload = await invoke<TauriDroppedFilePayload>('read_dropped_file', {
      path
    });
    const bytes = new Uint8Array(payload.bytes);

    return new File([bytes], payload.name || getFallbackFileName(path), {
      type: payload.mimeType || '',
      lastModified: payload.lastModified || Date.now()
    });
  } catch (error) {
    console.warn('Failed to read Tauri dropped file:', error);
    return null;
  }
};

const resolveDroppedFiles = async (paths: string[]): Promise<File[]> => {
  const files = await Promise.all(paths.map(readDroppedFile));

  return files.filter((file): file is File => !!file);
};

const isElementVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
};

export const bindTauriFileDrop = async ({
  getTargetElement,
  onDragStateChange,
  onFilesDropped
}: BindTauriFileDropOptions): Promise<UnlistenFn | null> => {
  if (!isTauriRuntime()) {
    return null;
  }

  return getCurrentWebview().onDragDropEvent(async event => {
    const payload = event.payload;
    const targetElement = getTargetElement();

    if (!targetElement || !isElementVisible(targetElement)) {
      onDragStateChange?.(false);
      return;
    }

    if (payload.type === 'enter' || payload.type === 'over') {
      onDragStateChange?.(true);
      return;
    }

    if (payload.type === 'leave') {
      onDragStateChange?.(false);
      return;
    }

    if (payload.type !== 'drop' || !payload.paths.length) {
      onDragStateChange?.(false);
      return;
    }

    onDragStateChange?.(false);

    const files = await resolveDroppedFiles(payload.paths);

    if (files.length) {
      onFilesDropped(files);
    }
  });
};
