import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { readTauriFiles } from './tauri-upload-files';
import { showErrorNotification } from '../composables/useNotifications';

export interface TauriFileDragState {
  dragging: boolean;
  hasMedia: boolean;
  position: { x: number; y: number } | null;
}

interface BindTauriFileDropOptions {
  getTargetElement: () => HTMLElement | null;
  getContextKey: () => string;
  isMediaDrop: (position: { x: number; y: number }) => boolean;
  onDragStateChange: (state: TauriFileDragState) => void;
  onReadStateChange: (isReading: boolean) => void;
  onFilesDropped: (files: File[], onlyMedia: boolean) => void | Promise<void>;
}

export const bindTauriFileDrop = async ({
  getTargetElement,
  getContextKey,
  isMediaDrop,
  onDragStateChange,
  onReadStateChange,
  onFilesDropped
}: BindTauriFileDropOptions): Promise<UnlistenFn | null> => {
  if (!isTauri()) return null;
  let disposed = false;
  let lastDrop: { native: boolean; at: number } | undefined;
  let pendingReads = 0;
  let dragState: TauriFileDragState = {
    dragging: false,
    hasMedia: false,
    position: null
  };
  const updateDragState = (state: Partial<TauriFileDragState>) => {
    dragState = { ...dragState, ...state };
    onDragStateChange(dragState);
  };
  const nativeHasMedia = (paths: string[]) =>
    paths.some(path =>
      /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|mp4|m4v|mov|webm|avi|mkv)$/i.test(
        path
      )
    );
  const htmlHasFiles = (transfer: DataTransfer | null) =>
    transfer?.types.includes('Files') ||
    Array.from(transfer?.items || []).some(item => item.kind === 'file');
  const htmlHasMedia = (transfer: DataTransfer) =>
    Array.from(transfer.items).some(
      item => item.kind === 'file' && /^(image|video)\//i.test(item.type)
    ) || nativeHasMedia(Array.from(transfer.files).map(file => file.name));
  const logicalPosition = (position: { x: number; y: number }) => {
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } })
        .userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent;
    // Wry 0.57 передаёт координаты Cocoa в points, а Windows — в физических px.
    const scale = /mac/i.test(platform) ? 1 : window.devicePixelRatio || 1;
    return { x: position.x / scale, y: position.y / scale };
  };
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
  const handlePaths = async (paths: string[], onlyMedia: boolean) => {
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
        await onFilesDropped(files, onlyMedia);
    } finally {
      pendingReads--;
      if (!disposed) onReadStateChange(pendingReads > 0);
    }
  };
  // HTML drop и native drop используют один выбор; браузерный DropZone
  // остаётся штатным, поскольку эти обработчики подключаются только в Tauri.
  const handleHtmlDrag = (event: DragEvent) => {
    if (disposed || !visibleTarget() || !htmlHasFiles(event.dataTransfer))
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateDragState({
      dragging: true,
      hasMedia:
        (dragState.dragging && dragState.hasMedia) ||
        htmlHasMedia(event.dataTransfer!),
      position: { x: event.clientX, y: event.clientY }
    });
  };
  const handleHtmlDrop = (event: DragEvent) => {
    if (disposed || !visibleTarget() || !event.dataTransfer?.files.length)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const onlyMedia =
      (dragState.hasMedia || htmlHasMedia(event.dataTransfer)) &&
      isMediaDrop({ x: event.clientX, y: event.clientY });
    updateDragState({ dragging: false });
    if (acceptDrop(false))
      void Promise.resolve(
        onFilesDropped(Array.from(event.dataTransfer.files), onlyMedia)
      ).catch(showErrorNotification);
  };
  const handleHtmlLeave = (event: DragEvent) => {
    if (event.clientX === 0 && event.clientY === 0)
      updateDragState({ dragging: false });
  };
  const endDrag = () => updateDragState({ dragging: false });
  const unlisten = await getCurrentWebview().onDragDropEvent(event => {
    if (disposed) return;
    const { payload } = event;
    if (!visibleTarget() || payload.type === 'leave') {
      endDrag();
    } else if (payload.type === 'enter' || payload.type === 'over') {
      updateDragState({
        dragging: true,
        ...(payload.type === 'enter'
          ? { hasMedia: nativeHasMedia(payload.paths) }
          : {}),
        position: logicalPosition(payload.position)
      });
    } else if (payload.type === 'drop') {
      updateDragState({
        hasMedia: nativeHasMedia(payload.paths),
        position: logicalPosition(payload.position)
      });
      const onlyMedia =
        nativeHasMedia(payload.paths) &&
        isMediaDrop(logicalPosition(payload.position));
      void handlePaths(payload.paths, onlyMedia).catch(showErrorNotification);
      endDrag();
    }
  });
  window.addEventListener('dragenter', handleHtmlDrag, true);
  window.addEventListener('dragover', handleHtmlDrag, true);
  window.addEventListener('dragleave', handleHtmlLeave, true);
  window.addEventListener('dragend', endDrag, true);
  window.addEventListener('drop', handleHtmlDrop, true);
  return () => {
    disposed = true;
    window.removeEventListener('dragenter', handleHtmlDrag, true);
    window.removeEventListener('dragover', handleHtmlDrag, true);
    window.removeEventListener('dragleave', handleHtmlLeave, true);
    window.removeEventListener('dragend', endDrag, true);
    window.removeEventListener('drop', handleHtmlDrop, true);
    unlisten();
  };
};
