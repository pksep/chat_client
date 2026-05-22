import { computed, ref } from 'vue';
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';

interface NativeSharedFileDescriptor {
  filePath?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
  isMedia?: boolean;
}

interface ShareIntentPayload {
  shareId?: string;
  text?: string;
  receivedAt?: number;
  files?: NativeSharedFileDescriptor[];
}

export interface PendingShareBatch {
  id: string;
  text: string;
  files: File[];
  receivedAt: number;
}

interface ResolvedSharePayload {
  shareId?: string;
  text?: string;
  receivedAt?: number;
  files: File[];
}

interface ShareIntentPlugin {
  addListener(
    eventName: 'shareIntentReceived',
    listenerFunc: (payload: ShareIntentPayload) => void
  ): Promise<PluginListenerHandle>;
  consumePendingShareIntent(): Promise<ShareIntentPayload>;
}

const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent');

const pendingShareBatches = ref<PendingShareBatch[]>([]);
let shareIntentListener: PluginListenerHandle | null = null;
let isShareIntentInitialized = false;
let lastHandledShareKey = '';
let lastHandledShareAt = 0;

const isAndroidNativePlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const normalizeSharedText = (value?: string | null): string =>
  value?.trim() || '';

const getFallbackBatchId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const hasPayloadValues = (payload?: ShareIntentPayload | null): boolean =>
  Boolean(payload?.files?.length);

const buildSharedFile = async (
  descriptor: NativeSharedFileDescriptor
): Promise<File | null> => {
  const filePath = descriptor.filePath?.trim();

  if (!filePath) {
    return null;
  }

  const response = await fetch(Capacitor.convertFileSrc(filePath));

  if (!response.ok) {
    throw new Error(`Failed to load shared file: ${response.status}`);
  }

  const blob = await response.blob();
  const fileName = descriptor.name || `shared-file-${Date.now()}`;
  const mimeType =
    descriptor.mimeType || blob.type || 'application/octet-stream';

  return new File([blob], fileName, {
    type: mimeType,
    lastModified: descriptor.lastModified || Date.now()
  });
};

const resolveSharedFiles = async (
  payload: ShareIntentPayload
): Promise<File[]> => {
  const resolvedFiles = await Promise.all(
    (payload.files || []).map(buildSharedFile)
  );

  return resolvedFiles.filter((file): file is File => !!file);
};

const getResolvedSharePayloadKey = (payload: ResolvedSharePayload): string => {
  if (payload.shareId) {
    return payload.shareId;
  }

  const fileKey = (payload.files || [])
    .map(
      file =>
        `${file.name || ''}:${file.size || 0}:${file.lastModified || 0}:${file.type || ''}`
    )
    .join('|');

  return `${payload.receivedAt || 0}|${fileKey}|${normalizeSharedText(payload.text)}`;
};

const shouldHandleResolvedSharePayload = (
  payload: ResolvedSharePayload
): boolean => {
  const key = getResolvedSharePayloadKey(payload);
  const now = Date.now();

  if (key === lastHandledShareKey && now - lastHandledShareAt < 3000) {
    return false;
  }

  lastHandledShareKey = key;
  lastHandledShareAt = now;
  return true;
};

const queueResolvedShareFiles = async (
  payload: ResolvedSharePayload
): Promise<void> => {
  if (!payload.files.length || !shouldHandleResolvedSharePayload(payload)) {
    return;
  }

  pendingShareBatches.value = [
    ...pendingShareBatches.value,
    {
      id: payload.shareId || getFallbackBatchId(),
      text: normalizeSharedText(payload.text),
      files: payload.files.filter(Boolean),
      receivedAt: Number(payload.receivedAt) || Date.now()
    }
  ];
};

const queuePendingSharePayload = async (
  payload: ShareIntentPayload
): Promise<void> => {
  if (!hasPayloadValues(payload)) {
    return;
  }

  const files = await resolveSharedFiles(payload);

  await queueResolvedShareFiles({
    shareId: payload.shareId,
    text: payload.text,
    receivedAt: payload.receivedAt,
    files
  });
};

export const initShareIntentHandling = async (): Promise<void> => {
  if (isShareIntentInitialized) {
    return;
  }

  isShareIntentInitialized = true;

  if (!isAndroidNativePlatform()) {
    return;
  }

  shareIntentListener = await ShareIntent.addListener(
    'shareIntentReceived',
    payload => {
      void queuePendingSharePayload(payload).catch(error => {
        console.warn('Failed to process Android share intent:', error);
      });
    }
  );

  try {
    const pendingShareIntent = await ShareIntent.consumePendingShareIntent();

    if (hasPayloadValues(pendingShareIntent)) {
      await queuePendingSharePayload(pendingShareIntent);
    }
  } catch (error) {
    console.warn('Failed to consume pending Android share intent:', error);
  }
};

export const clearPendingShareBatches = (): void => {
  pendingShareBatches.value = [];
};

export const consumePendingShareBatches = (): PendingShareBatch[] => {
  const batches = [...pendingShareBatches.value];
  clearPendingShareBatches();
  return batches;
};

export const enqueuePendingShareFiles = async (
  files: File[] | FileList,
  text?: string
): Promise<void> => {
  const resolvedFiles = Array.isArray(files) ? files : Array.from(files);

  await queueResolvedShareFiles({
    files: resolvedFiles.filter(Boolean),
    text,
    receivedAt: Date.now()
  });
};

export const removeShareIntentListeners = async (): Promise<void> => {
  if (shareIntentListener) {
    await shareIntentListener.remove();
    shareIntentListener = null;
  }
  isShareIntentInitialized = false;
};

export const usePendingShareIntent = () => ({
  pendingShareBatches,
  hasPendingShareBatches: computed(() => pendingShareBatches.value.length > 0)
});
