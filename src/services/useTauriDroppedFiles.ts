import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { readTauriFiles } from './tauri-upload-files';
import { showErrorNotification } from '../composables/useNotifications';

interface BindTauriFileDropOptions {
  getTargetElement: () => HTMLElement | null;
  getContextKey: () => string;
  onDragStateChange: (isDragging: boolean) => void;
  onReadStateChange: (isReading: boolean) => void;
  onFilesDropped: (files: File[]) => void | Promise<void>;
}

export const bindTauriFileDrop = async ({
  getTargetElement,
  getContextKey,
  onDragStateChange,
  onReadStateChange,
  onFilesDropped
}: BindTauriFileDropOptions): Promise<UnlistenFn | null> => {
  if (!isTauri()) return null;
  let disposed = false;
  let lastDrop: { native: boolean; at: number } | undefined;
  let pendingReads = 0;
  const visibleTarget = () => {
    const element = getTargetElement();
    const rect = element?.getBoundingClientRect();
    return element && rect && rect.width > 0 && rect.height > 0
      ? element
      : null;
  };
  const acceptDrop = (native: boolean) => {
    const at = performance.now();
    if (lastDrop && lastDrop.native !== native && at - lastDrop.at < 500)
      return false;
    lastDrop = { native, at };
    return true;
  };
  const handlePaths = async (paths: string[]) => {
    const target = visibleTarget();
    if (!target || disposed || !paths.length || !acceptDrop(true)) return;
    const context = getContextKey();
    pendingReads++;
    onReadStateChange(true);
    try {
      const files = await readTauriFiles(paths);
      if (
        !disposed &&
        visibleTarget() === target &&
        getContextKey() === context &&
        files.length
      )
        await onFilesDropped(files);
    } finally {
      pendingReads--;
      if (!disposed) onReadStateChange(pendingReads > 0);
    }
  };
  // Внутри WebView бывают и обычные HTML drop (например, из другого окна
  // браузера). Tauri перехватываем отдельно, браузерный DropZone не меняем.
  const handleHtmlDrop = (event: DragEvent) => {
    if (disposed || !visibleTarget() || !event.dataTransfer?.files.length)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onDragStateChange(false);
    if (acceptDrop(false))
      void onFilesDropped(Array.from(event.dataTransfer.files));
  };
  const unlisten = await getCurrentWebview().onDragDropEvent(event => {
    if (disposed) return;
    const { payload } = event;
    if (!visibleTarget() || payload.type === 'leave') {
      onDragStateChange(false);
    } else if (payload.type === 'enter' || payload.type === 'over') {
      onDragStateChange(true);
    } else if (payload.type === 'drop') {
      onDragStateChange(false);
      void handlePaths(payload.paths).catch(showErrorNotification);
    }
  });
  window.addEventListener('drop', handleHtmlDrop, true);
  return () => {
    disposed = true;
    window.removeEventListener('drop', handleHtmlDrop, true);
    unlisten();
  };
};
