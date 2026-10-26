import { openChatDatabase } from '../utils/chat-startup-databases';
import {
  discardStartupTopicRecords,
  takeStartupTopicRecord
} from '../utils/startup-topic-records';
import { reviveCachedDates as deserializeValue } from '../utils/revive-cached-dates';
import type { IMessage } from '../components/interfaces/interfaces';
import { mergeMessageSnapshots } from '../utils/merge-message-snapshots';
import { authedUser, getChatAuthSession } from '../composables/useAuth';
import { isIosWeb } from '../utils/ios-pwa-viewport';

const DB_NAME = 'chat-topic-messages-db';
const STORE_NAME = 'topicMessages';
const PINNED_MESSAGES_STORE_NAME = 'pinnedMessages';
const PENDING_UPLOADS_STORE_NAME = 'pendingUploads';
const PENDING_UPLOAD_META_STORE_NAME = 'pendingUploadMeta';
const PENDING_UPLOAD_CHUNKS_STORE_NAME = 'pendingUploadChunks';
const PENDING_UPLOADS_OPFS_DIRECTORY = 'pending-uploads';
const PENDING_UPLOAD_WORKER_THRESHOLD = 32 * 1024 * 1024;
const PENDING_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const PENDING_UPLOAD_WORKER_LOAD_TIMEOUT_MS = 5000;
const PENDING_UPLOAD_SERVICE_WORKER_URL =
  '/pending-upload-service-worker.js?v=20261026-1';
const PENDING_UPLOAD_SERVICE_WORKER_SCOPE = '/pending-upload-cache-v3/';

interface CachedTopicMessages {
  cacheKey: string;
  topicId: string;
  userId: string;
  messages: IMessage[];
  updatedAt: string;
}

interface CachedPinnedTopicMessages {
  cacheKey: string;
  topicId: string;
  userId: string;
  messages: IMessage[];
  updatedAt: string;
}

interface CachedPendingUpload {
  cacheKey: string;
  topicId: string;
  messageId: string;
  fileId: string;
  file?: File;
  fileBytes?: ArrayBuffer;
  opfsFileName?: string;
  originName?: string;
  contentType?: string;
  lastModified?: number;
  fileSize?: number;
  chunkCount?: number;
  isMedia: boolean;
  updatedAt: string;
}

interface PendingUploadLookup {
  cacheKey: string;
  topicId?: string;
  messageId?: string;
  fileId?: string;
}

interface CachedPendingUploadMeta {
  cacheKey: string;
  topicId: string;
  messageId: string;
  replyMessageId?: string;
  forwardMessageIds: string[];
  message?: IMessage;
  writeVersion?: string;
  updatedAt: string;
}

type PendingUploadWorkerAction = 'save' | 'load' | 'delete';

interface PendingUploadWorkerResponse {
  id: number;
  result?: CachedPendingUpload;
  error?: string;
  progress?: number;
}

let pendingUploadWorker: Worker | null = null;
let pendingUploadServiceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null =
  null;
let pendingUploadServiceWorkerRegistration: ServiceWorkerRegistration | null =
  null;
let pendingUploadWorkerRequestId = 0;
let pendingUploadMetaWriteRevision = 0;
const pendingUploadPageHandoffs = new Map<string, CachedPendingUpload>();
const pendingUploadWorkerRequests = new Map<
  number,
  {
    resolve: (value: CachedPendingUpload | undefined) => void;
    reject: (error: Error) => void;
    onProgress?: (percent: number) => void;
  }
>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getPendingUploadServiceWorker =
  async (): Promise<ServiceWorker | null> => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }

    if (!pendingUploadServiceWorkerRegistrationPromise) {
      pendingUploadServiceWorkerRegistrationPromise = (async () => {
        try {
          const registration = await navigator.serviceWorker.register(
            PENDING_UPLOAD_SERVICE_WORKER_URL,
            { scope: PENDING_UPLOAD_SERVICE_WORKER_SCOPE }
          );
          await registration.update().catch(() => undefined);

          if (registration.installing) {
            await new Promise<void>(resolve => {
              const installing = registration.installing;
              const timeoutId = window.setTimeout(resolve, 5000);

              installing?.addEventListener(
                'statechange',
                () => {
                  if (
                    installing.state === 'activated' ||
                    installing.state === 'redundant'
                  ) {
                    window.clearTimeout(timeoutId);
                    resolve();
                  }
                },
                { once: false }
              );
            });
          }

          return registration;
        } catch {
          return null;
        }
      })();
    }

    const registration = await pendingUploadServiceWorkerRegistrationPromise;

    if (!registration) {
      return null;
    }

    pendingUploadServiceWorkerRegistration = registration;

    return (
      registration.active || registration.waiting || registration.installing
    );
  };

const handoffPendingUploadsForRefresh = (): void => {
  const worker =
    pendingUploadServiceWorkerRegistration?.active ||
    pendingUploadServiceWorkerRegistration?.waiting;

  if (!worker || pendingUploadPageHandoffs.size === 0) {
    return;
  }

  pendingUploadPageHandoffs.forEach(payload => {
    try {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => channel.port1.close();
      channel.port1.onmessageerror = () => channel.port1.close();
      channel.port1.start();
      worker.postMessage({ type: 'PENDING_UPLOAD_SAVE', payload }, [
        channel.port2
      ]);
    } catch {
      // The in-memory file remains available when navigation is cancelled.
    }
  });
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', handoffPendingUploadsForRefresh);
}

const runPendingUploadServiceWorkerRequest = async (
  action: 'save' | 'persist' | 'wait' | 'cancel',
  payload: CachedPendingUpload | PendingUploadLookup,
  onProgress?: (percent: number) => void
): Promise<boolean | CachedPendingUpload> => {
  const worker = await getPendingUploadServiceWorker();

  if (!worker) {
    return false;
  }

  const channel = new MessageChannel();
  return await new Promise((resolve, reject) => {
    const timeoutMs =
      action === 'persist' || action === 'wait' ? 10 * 60 * 1000 : 10000;
    const timeoutId = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error('Pending upload service worker response timed out'));
    }, timeoutMs);

    channel.port1.onmessage = event => {
      const response = event.data as {
        type?: 'accepted' | 'progress' | 'file' | 'done' | 'error';
        progress?: number;
        active?: boolean;
        payload?: CachedPendingUpload;
        error?: string;
      };
      if (
        response.type === 'progress' &&
        typeof response.progress === 'number'
      ) {
        onProgress?.(response.progress);
        return;
      }

      if (response.type === 'file' && response.payload?.file) {
        channel.port1.close();
        window.clearTimeout(timeoutId);
        resolve(response.payload);
        return;
      }

      if (response.type === 'accepted' && action !== 'persist') {
        channel.port1.close();
        window.clearTimeout(timeoutId);
        resolve(true);
        return;
      }

      channel.port1.close();
      window.clearTimeout(timeoutId);

      if (response.type === 'error') {
        reject(
          new Error(response.error || 'Pending upload service worker failed')
        );
        return;
      }

      resolve(response.active !== false);
    };
    channel.port1.onmessageerror = () => {
      channel.port1.close();
      window.clearTimeout(timeoutId);
      reject(new Error('Invalid pending upload service worker response'));
    };
    channel.port1.start();

    if (action === 'save') {
      worker.postMessage({ type: 'PENDING_UPLOAD_SAVE', payload }, [
        channel.port2
      ]);
    } else if (action === 'persist') {
      worker.postMessage(
        {
          type: 'PENDING_UPLOAD_PERSIST',
          cacheKey: payload.cacheKey,
          topicId: payload.topicId,
          messageId: payload.messageId,
          fileId: payload.fileId
        },
        [channel.port2]
      );
    } else {
      worker.postMessage(
        {
          type:
            action === 'wait' ? 'PENDING_UPLOAD_WAIT' : 'PENDING_UPLOAD_CANCEL',
          cacheKey: payload.cacheKey,
          topicId: payload.topicId,
          messageId: payload.messageId,
          fileId: payload.fileId
        },
        [channel.port2]
      );
    }
  });
};

const waitForPendingUploadServiceWorkerFile = async (
  payload: PendingUploadLookup,
  onProgress?: (percent: number) => void
): Promise<CachedPendingUpload | null> => {
  const result = await runPendingUploadServiceWorkerRequest(
    'wait',
    payload,
    onProgress
  );

  if (typeof result === 'object' && result.file) {
    return result;
  }

  return null;
};

const serializeValue = (
  value: unknown,
  seenObjects = new WeakSet<object>()
): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item, seenObjects));
  }

  if (isPlainObject(value)) {
    if (seenObjects.has(value)) {
      return undefined;
    }

    seenObjects.add(value);

    const serializedObject = Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue, seenObjects)
      ])
    );

    seenObjects.delete(value);

    return serializedObject;
  }

  return value;
};

const getResolvedUserId = () =>
  authedUser.value?.id || getChatAuthSession()?.user?.id || '';

const getCacheKey = (topicId: string, userId = getResolvedUserId()) =>
  `${userId || 'anonymous'}:${topicId}`;

const getPendingUploadCacheKey = (
  topicId: string,
  messageId: string,
  fileId: string,
  userId = getResolvedUserId()
) => `${userId || 'anonymous'}:${topicId}:${messageId}:${fileId}`;

const getPendingUploadMetaCacheKey = (
  topicId: string,
  messageId: string,
  userId = getResolvedUserId()
) => `${userId || 'anonymous'}:${topicId}:${messageId}`;

const rejectPendingUploadWorkerRequests = (error: Error): void => {
  pendingUploadWorkerRequests.forEach(request => request.reject(error));
  pendingUploadWorkerRequests.clear();
};

const getPendingUploadWorker = (): Worker | null => {
  if (pendingUploadWorker) {
    return pendingUploadWorker;
  }

  if (typeof Worker === 'undefined') {
    return null;
  }

  try {
    const worker = new Worker(
      new URL('./pending-upload-cache.worker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.addEventListener(
      'message',
      (event: MessageEvent<PendingUploadWorkerResponse>) => {
        const request = pendingUploadWorkerRequests.get(event.data.id);

        if (!request) {
          return;
        }

        if (typeof event.data.progress === 'number') {
          request.onProgress?.(event.data.progress);
          return;
        }

        pendingUploadWorkerRequests.delete(event.data.id);

        if (event.data.error) {
          request.reject(new Error(event.data.error));
          return;
        }

        request.resolve(event.data.result);
      }
    );
    worker.addEventListener('error', () => {
      const error = new Error('Pending upload worker failed');
      rejectPendingUploadWorkerRequests(error);
      worker.terminate();
      pendingUploadWorker = null;
    });
    pendingUploadWorker = worker;
    return worker;
  } catch {
    return null;
  }
};

const runPendingUploadWorkerRequest = (
  action: PendingUploadWorkerAction,
  payload: CachedPendingUpload | { cacheKey: string },
  onProgress?: (percent: number) => void
): Promise<CachedPendingUpload | undefined> => {
  const worker = getPendingUploadWorker();

  if (!worker) {
    return Promise.reject(new Error('Pending upload worker is unavailable'));
  }

  pendingUploadWorkerRequestId += 1;
  const id = pendingUploadWorkerRequestId;

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const resolveRequest = (value: CachedPendingUpload | undefined): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve(value);
    };
    const rejectRequest = (error: Error): void => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      reject(error);
    };

    pendingUploadWorkerRequests.set(id, {
      resolve: resolveRequest,
      reject: rejectRequest,
      onProgress
    });

    if (action === 'load') {
      timeoutId = setTimeout(() => {
        pendingUploadWorkerRequests.delete(id);
        rejectRequest(new Error('Pending upload worker load timed out'));
      }, PENDING_UPLOAD_WORKER_LOAD_TIMEOUT_MS);
    }

    try {
      worker.postMessage({ id, action, payload });
    } catch (error) {
      pendingUploadWorkerRequests.delete(id);
      rejectRequest(
        error instanceof Error ? error : new Error('Failed to call worker')
      );
    }
  });
};

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

const getPendingUploadOpfsFileName = (cacheKey: string): string => {
  let first = 2166136261;
  let second = 2246822519;

  for (let index = 0; index < cacheKey.length; index += 1) {
    const code = cacheKey.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }

  return `pending-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
};

const getPendingUploadsOpfsDirectory = async (
  create: boolean
): Promise<FileSystemDirectoryHandle | null> => {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const storage = navigator.storage as StorageManagerWithDirectory | undefined;

  if (!storage?.getDirectory) {
    return null;
  }

  try {
    const root = await storage.getDirectory();
    return await root.getDirectoryHandle(PENDING_UPLOADS_OPFS_DIRECTORY, {
      create
    });
  } catch {
    return null;
  }
};

const loadDurablePendingUploadFile = async (
  cached: CachedPendingUpload
): Promise<File | null> => {
  if (cached.fileBytes) {
    return new File([cached.fileBytes], cached.originName || 'attachment', {
      type: cached.contentType || '',
      lastModified: cached.lastModified
    });
  }
  if (cached.chunkCount) {
    const db = await openDb();
    if (!db) return null;
    const chunks = await new Promise<
      { chunkIndex: number; data: Blob | ArrayBuffer }[]
    >((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readonly');
      const request = tx
        .objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME)
        .getAll(
          IDBKeyRange.bound(
            [cached.cacheKey, 0],
            [cached.cacheKey, cached.chunkCount - 1]
          )
        );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (chunks.length !== cached.chunkCount) return null;
    chunks.sort((first, second) => first.chunkIndex - second.chunkIndex);
    const file = new File(
      chunks.map(chunk => chunk.data),
      cached.originName,
      {
        type: cached.contentType,
        lastModified: cached.lastModified
      }
    );
    return cached.fileSize === undefined || file.size === cached.fileSize
      ? file
      : null;
  }
  if (!cached.opfsFileName) {
    return null;
  }

  const directory = await getPendingUploadsOpfsDirectory(false);

  if (!directory) {
    return null;
  }

  try {
    const handle = await directory.getFileHandle(cached.opfsFileName);
    const storedFile = await handle.getFile();
    return new File([storedFile], cached.originName || storedFile.name, {
      type: cached.contentType || storedFile.type,
      lastModified: cached.lastModified || storedFile.lastModified
    });
  } catch (error) {
    console.warn('Failed to load pending upload file from OPFS:', error);
    return null;
  }
};

const deletePendingUploadFileFromOpfs = async (
  cacheKey: string
): Promise<void> => {
  const directory = await getPendingUploadsOpfsDirectory(false);

  if (!directory) {
    return;
  }

  await directory
    .removeEntry(getPendingUploadOpfsFileName(cacheKey))
    .catch(() => undefined);
};

const getMessageCreatedTimestamp = (message: IMessage): number => {
  const timestamp =
    message.createdAt instanceof Date
      ? message.createdAt.getTime()
      : new Date(message.createdAt || 0).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const compareMessagesByPosition = (left: IMessage, right: IMessage): number => {
  const timeDiff =
    getMessageCreatedTimestamp(left) - getMessageCreatedTimestamp(right);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return (left.id || '').localeCompare(right.id || '');
};

const mergeCachedMessages = (
  existingMessages: IMessage[],
  incomingMessages: IMessage[]
): IMessage[] =>
  mergeMessageSnapshots([...existingMessages, ...incomingMessages]).sort(
    compareMessagesByPosition
  );

const openDb = (): Promise<IDBDatabase | null> => openChatDatabase(DB_NAME);

export const loadCachedTopicMessages = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  if (!topicId) {
    return [];
  }

  try {
    const db = await openDb();

    if (!db) {
      return [];
    }

    const cacheKey = getCacheKey(topicId, userId);

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result as CachedTopicMessages | undefined;

        if (!result?.messages) {
          resolve([]);
          return;
        }

        resolve(
          mergeCachedMessages(
            [],
            deserializeValue(result.messages) as IMessage[]
          )
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to load cached topic messages:', error);
    return [];
  }
};

export const saveCachedTopicMessages = async (
  topicId: string,
  messages: IMessage[],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !userId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const payload: CachedTopicMessages = {
      cacheKey: getCacheKey(topicId, userId),
      topicId,
      userId,
      messages: serializeValue(messages) as IMessage[],
      updatedAt: new Date().toISOString()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(payload);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to save cached topic messages:', error);
  }
};

export const clearCachedTopicMessages = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !userId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const cacheKey = getCacheKey(topicId, userId);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(cacheKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to clear cached topic messages:', error);
  }
};

export const loadCachedPinnedMessages = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<IMessage[] | null> => {
  if (!topicId) {
    return null;
  }

  try {
    const db = await openDb();

    if (!db) {
      return null;
    }

    const cacheKey = getCacheKey(topicId, userId);

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PINNED_MESSAGES_STORE_NAME, 'readonly');
      const store = tx.objectStore(PINNED_MESSAGES_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result as CachedPinnedTopicMessages | undefined;

        if (!result) {
          resolve(null);
          return;
        }

        resolve((deserializeValue(result.messages || []) as IMessage[]) || []);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to load cached pinned messages:', error);
    return null;
  }
};

export const saveCachedPinnedMessages = async (
  topicId: string,
  messages: IMessage[],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !userId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const payload: CachedPinnedTopicMessages = {
      cacheKey: getCacheKey(topicId, userId),
      topicId,
      userId,
      messages: serializeValue(messages) as IMessage[],
      updatedAt: new Date().toISOString()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PINNED_MESSAGES_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PINNED_MESSAGES_STORE_NAME);
      const request = store.put(payload);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to save cached pinned messages:', error);
  }
};

const savePendingUploadBytes = async (
  db: IDBDatabase,
  payload: CachedPendingUpload,
  onProgress?: (percent: number) => void
): Promise<void> => {
  const file = payload.file!;
  const write = (stores: string[], operation: (tx: IDBTransaction) => void) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(stores, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      operation(tx);
    });
  await write(
    [PENDING_UPLOADS_STORE_NAME, PENDING_UPLOAD_CHUNKS_STORE_NAME],
    tx => {
      tx.objectStore(PENDING_UPLOADS_STORE_NAME).delete(payload.cacheKey);
      tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME).delete(
        IDBKeyRange.bound(
          [payload.cacheKey, 0],
          [payload.cacheKey, Number.MAX_SAFE_INTEGER]
        )
      );
    }
  );
  const chunkCount = Math.ceil(file.size / PENDING_UPLOAD_CHUNK_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex++) {
    const start = chunkIndex * PENDING_UPLOAD_CHUNK_SIZE;
    const end = Math.min(file.size, start + PENDING_UPLOAD_CHUNK_SIZE);
    const data = await file.slice(start, end).arrayBuffer();
    if (data.byteLength !== end - start) {
      throw new Error('Не удалось прочитать файл. Выберите его ещё раз.');
    }
    await write([PENDING_UPLOAD_CHUNKS_STORE_NAME], tx => {
      tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME).put({
        cacheKey: payload.cacheKey,
        chunkIndex,
        data
      });
    });
    onProgress?.(Math.round(((chunkIndex + 1) / chunkCount) * 100));
  }
  await write([PENDING_UPLOADS_STORE_NAME], tx => {
    tx.objectStore(PENDING_UPLOADS_STORE_NAME).put({
      ...payload,
      file: undefined,
      originName: file.name,
      contentType: file.type,
      lastModified: file.lastModified,
      fileSize: file.size,
      chunkCount
    });
  });
};

export const savePendingUploadFile = async (params: {
  topicId: string;
  messageId: string;
  fileId: string;
  file: File;
  isMedia: boolean;
  userId?: string;
  onProgress?: (percent: number) => void;
}): Promise<void> => {
  if (!params.topicId || !params.messageId || !params.fileId) {
    return;
  }

  try {
    params.onProgress?.(1);
    const db = await openDb();

    if (!db) {
      return;
    }

    const cacheKey = getPendingUploadCacheKey(
      params.topicId,
      params.messageId,
      params.fileId,
      params.userId
    );
    const payload: CachedPendingUpload = {
      cacheKey,
      topicId: params.topicId,
      messageId: params.messageId,
      fileId: params.fileId,
      file: params.file,
      isMedia: params.isMedia,
      updatedAt: new Date().toISOString()
    };

    if (params.file.size >= PENDING_UPLOAD_WORKER_THRESHOLD) {
      // WebKit может потерять доступ к File после передачи в worker.
      // Байты камеры читаем здесь порциями и сохраняем до начала отправки.
      if (isIosWeb()) {
        await savePendingUploadBytes(db, payload, params.onProgress);
        return;
      }
      // Multipart upload must not start until the complete source file is in
      // durable browser storage. A service worker can finish this copy across
      // a refresh; the next page then resumes multipart from OPFS.
      pendingUploadPageHandoffs.set(cacheKey, payload);
      const accepted = await runPendingUploadServiceWorkerRequest(
        'save',
        payload
      ).catch(error => {
        console.warn('Failed to hand off pending upload:', error);
        return false;
      });
      const persisted = accepted
        ? await runPendingUploadServiceWorkerRequest(
            'persist',
            payload,
            params.onProgress
          ).catch(error => {
            console.warn('Failed to persist pending upload in worker:', error);
            return false;
          })
        : false;

      if (persisted !== true) {
        await runPendingUploadWorkerRequest('save', payload, params.onProgress);
      }

      pendingUploadPageHandoffs.delete(cacheKey);
      return;
    }

    if (isIosWeb()) {
      // WebKit может отклонить File при записи в IndexedDB, в том числе фото
      // камеры. Байты сохраняются надёжно и восстанавливаются после перезапуска.
      payload.fileBytes = await params.file.arrayBuffer();
      payload.originName = params.file.name;
      payload.contentType = params.file.type;
      payload.lastModified = params.file.lastModified;
      delete payload.file;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      store.put(payload);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    params.onProgress?.(100);
  } catch (error) {
    console.warn('Failed to save pending upload file:', error);
    throw error;
  }
};

export const loadPendingUploadFile = async (
  topicId: string,
  messageId: string,
  fileId: string,
  userId = getResolvedUserId(),
  onProgress?: (percent: number) => void
): Promise<{ file: File; isMedia: boolean } | null> => {
  if (!topicId || !messageId || !fileId) {
    return null;
  }

  try {
    const db = await openDb();

    if (!db) {
      return null;
    }

    const cacheKey = getPendingUploadCacheKey(
      topicId,
      messageId,
      fileId,
      userId
    );

    if (isIosWeb()) {
      const cached = await new Promise<CachedPendingUpload | undefined>(
        (resolve, reject) => {
          const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readonly');
          const request = tx
            .objectStore(PENDING_UPLOADS_STORE_NAME)
            .get(cacheKey);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        }
      );
      if (cached) {
        const file =
          (await loadDurablePendingUploadFile(cached)) || cached.file;
        if (file) return { file, isMedia: cached.isMedia };
      }
    }

    try {
      // If refresh happened while the durable copy was still running, wait
      // for it. Once complete, the file is loaded from OPFS below.
      const activeResult = await waitForPendingUploadServiceWorkerFile(
        { cacheKey, topicId, messageId, fileId },
        onProgress
      );

      if (activeResult?.file) {
        return {
          file: activeResult.file,
          isMedia: activeResult.isMedia
        };
      }

      const completedResult = await runPendingUploadWorkerRequest('load', {
        cacheKey
      });

      if (completedResult) {
        const file =
          (await loadDurablePendingUploadFile(completedResult)) ||
          completedResult.file;

        if (!file) {
          await runPendingUploadWorkerRequest('delete', { cacheKey }).catch(
            () => undefined
          );
          await deletePendingUploadFileFromOpfs(cacheKey);
          return null;
        }

        return {
          file,
          isMedia: completedResult.isMedia
        };
      }
    } catch (error) {
      console.warn('Failed to load pending upload file in worker:', error);
    }

    const fallbackResult = await new Promise<{
      file: File;
      isMedia: boolean;
    } | null>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readonly');
      const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = async () => {
        const records = request.result as CachedPendingUpload[];
        const result =
          records.find(record => record.cacheKey === cacheKey) ||
          records.find(
            record =>
              record.topicId === topicId &&
              record.messageId === messageId &&
              record.fileId === fileId
          );

        if (!result) {
          resolve(null);
          return;
        }

        const file =
          (await loadDurablePendingUploadFile(result)) || result.file;

        if (!file) {
          resolve(null);
          return;
        }

        resolve({
          file,
          isMedia: result.isMedia
        });
      };
      request.onerror = () => reject(request.error);
    });

    if (!fallbackResult) {
      // A service worker terminated during the initial pre-1% staging can
      // leave only an incomplete OPFS entry. No multipart session has started
      // yet, so remove every local fragment before exposing the retry state.
      await runPendingUploadWorkerRequest('delete', { cacheKey }).catch(
        () => undefined
      );
      await deletePendingUploadFileFromOpfs(cacheKey);
    }

    return fallbackResult;
  } catch (error) {
    console.warn('Failed to load pending upload file:', error);
    return null;
  }
};

export const deletePendingUploadFile = async (
  topicId: string,
  messageId: string,
  fileId: string,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !messageId || !fileId) {
    return;
  }

  const cacheKey = getPendingUploadCacheKey(topicId, messageId, fileId, userId);
  pendingUploadPageHandoffs.delete(cacheKey);

  try {
    const db = await openDb();

    await runPendingUploadServiceWorkerRequest('cancel', {
      cacheKey,
      topicId,
      messageId,
      fileId
    }).catch(() => false);

    try {
      await runPendingUploadWorkerRequest('delete', { cacheKey });
      return;
    } catch (error) {
      console.warn('Failed to delete pending upload file in worker:', error);
    }

    if (db) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
        const request = store.delete(cacheKey);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.warn('Failed to delete pending upload file:', error);
  } finally {
    await deletePendingUploadFileFromOpfs(cacheKey);
  }
};

export const deletePendingUploadFilesForMessage = async (
  topicId: string,
  messageId: string,
  knownFileIds: string[] = [],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !messageId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const [uploadRecords, metaRecords] = await Promise.all([
      new Promise<CachedPendingUpload[]>((resolve, reject) => {
        const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readonly');
        const request = tx.objectStore(PENDING_UPLOADS_STORE_NAME).getAll();
        request.onsuccess = () =>
          resolve(request.result as CachedPendingUpload[]);
        request.onerror = () => reject(request.error);
      }),
      new Promise<CachedPendingUploadMeta[]>((resolve, reject) => {
        const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readonly');
        const request = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME).getAll();
        request.onsuccess = () =>
          resolve(request.result as CachedPendingUploadMeta[]);
        request.onerror = () => reject(request.error);
      })
    ]);

    const matchingUploads = uploadRecords.filter(
      record => record.topicId === topicId && record.messageId === messageId
    );
    const matchingMeta = metaRecords.find(
      record => record.topicId === topicId && record.messageId === messageId
    );
    const fileIds = new Set([
      ...knownFileIds,
      ...matchingUploads.map(record => record.fileId),
      ...(matchingMeta?.message?.media || []).map(media => media.id)
    ]);
    const cacheKeys = new Set(matchingUploads.map(record => record.cacheKey));

    pendingUploadPageHandoffs.forEach((record, cacheKey) => {
      if (record.topicId === topicId && record.messageId === messageId) {
        cacheKeys.add(cacheKey);
        fileIds.add(record.fileId);
        pendingUploadPageHandoffs.delete(cacheKey);
      }
    });

    fileIds.forEach(fileId => {
      cacheKeys.add(
        getPendingUploadCacheKey(topicId, messageId, fileId, userId)
      );
    });

    await Promise.all(
      Array.from(fileIds).map(fileId =>
        runPendingUploadServiceWorkerRequest('cancel', {
          cacheKey: getPendingUploadCacheKey(
            topicId,
            messageId,
            fileId,
            userId
          ),
          topicId,
          messageId,
          fileId
        }).catch(() => false)
      )
    );

    await Promise.all(
      Array.from(cacheKeys).map(cacheKey =>
        runPendingUploadWorkerRequest('delete', { cacheKey }).catch(
          () => undefined
        )
      )
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        [PENDING_UPLOADS_STORE_NAME, PENDING_UPLOAD_CHUNKS_STORE_NAME],
        'readwrite'
      );
      const uploadStore = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      const chunkStore = tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME);
      const chunkIndex = chunkStore.index('cacheKey');

      cacheKeys.forEach(cacheKey => {
        uploadStore.delete(cacheKey);
        const request = chunkIndex.openKeyCursor(IDBKeyRange.only(cacheKey));
        request.onsuccess = () => {
          const cursor = request.result;

          if (!cursor) {
            return;
          }

          chunkStore.delete(cursor.primaryKey);
          cursor.continue();
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await Promise.all(
      Array.from(cacheKeys).map(cacheKey =>
        deletePendingUploadFileFromOpfs(cacheKey)
      )
    );
  } catch (error) {
    console.warn('Failed to delete pending upload files for message:', error);
  }
};

export const savePendingUploadMeta = async (params: {
  topicId: string;
  messageId: string;
  replyMessageId?: string;
  forwardMessageIds: string[];
  message?: IMessage;
  userId?: string;
}): Promise<void> => {
  discardStartupTopicRecords();
  if (!params.topicId || !params.messageId) {
    return;
  }

  const updatedAt = new Date().toISOString();
  pendingUploadMetaWriteRevision += 1;
  const writeVersion = `${updatedAt}:${pendingUploadMetaWriteRevision
    .toString()
    .padStart(12, '0')}`;

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const payload: CachedPendingUploadMeta = {
      cacheKey: getPendingUploadMetaCacheKey(
        params.topicId,
        params.messageId,
        params.userId
      ),
      topicId: params.topicId,
      messageId: params.messageId,
      replyMessageId: params.replyMessageId,
      forwardMessageIds: params.forwardMessageIds,
      message: params.message
        ? (serializeValue(params.message) as IMessage)
        : undefined,
      writeVersion,
      updatedAt
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME);
      const request = store.get(payload.cacheKey);

      request.onsuccess = () => {
        const existing = request.result as CachedPendingUploadMeta | undefined;
        const existingVersion = existing?.writeVersion || existing?.updatedAt;

        if (existingVersion && existingVersion > writeVersion) {
          return;
        }

        store.put(payload);
      };
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to save pending upload meta:', error);
  }
};

export const loadPendingUploadMessages = async (
  topicId: string,
  userId = getResolvedUserId(),
  loadMissingMessages?: (messageIds: string[]) => Promise<IMessage[]>
): Promise<IMessage[]> => {
  if (!topicId) {
    return [];
  }

  try {
    const db = await openDb();

    if (!db) {
      return [];
    }

    const cacheKeyPrefix = `${userId || 'anonymous'}:${topicId}:`;

    const prepared = takeStartupTopicRecord<CachedPendingUploadMeta[]>(
      DB_NAME,
      PENDING_UPLOAD_META_STORE_NAME,
      `${userId || 'anonymous'}:${topicId}`
    );
    const readCurrent = () =>
      new Promise<CachedPendingUploadMeta[]>((resolve, reject) => {
        const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readonly');
        const store = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME);
        // Ключи этого топика начинаются с ':', следующий символ ';' ограничивает
        // диапазон без чтения вложений других топиков и пользователей.
        const request = store.getAll(
          IDBKeyRange.bound(
            cacheKeyPrefix,
            `${userId || 'anonymous'}:${topicId};`,
            false,
            true
          )
        );

        request.onsuccess = () =>
          resolve(request.result as CachedPendingUploadMeta[]);
        request.onerror = () => reject(request.error);
      });
    const records = prepared
      ? await prepared.catch(readCurrent)
      : await readCurrent();
    const matching = records.filter(
      record =>
        record.topicId === topicId && record.cacheKey.startsWith(cacheKeyPrefix)
    );
    const messages = matching
      .filter(record => record.message)
      .map(record => deserializeValue(record.message) as IMessage);
    const missingIds = matching
      .filter(record => !record.message)
      .map(record => record.messageId);
    if (missingIds.length && loadMissingMessages) {
      try {
        messages.push(...(await loadMissingMessages(missingIds)));
      } catch (error) {
        console.warn(
          'Не удалось восстановить неотправленный текст из истории:',
          error
        );
      }
    }
    return messages;
  } catch (error) {
    console.warn('Failed to load pending upload messages:', error);
    return [];
  }
};

export const loadPendingUploadMeta = async (
  topicId: string,
  messageId: string,
  userId = getResolvedUserId()
): Promise<{ replyMessageId?: string; forwardMessageIds: string[] } | null> => {
  if (!topicId || !messageId) {
    return null;
  }

  try {
    const db = await openDb();

    if (!db) {
      return null;
    }

    const cacheKey = getPendingUploadMetaCacheKey(topicId, messageId, userId);

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readonly');
      const store = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result as CachedPendingUploadMeta | undefined;

        if (!result) {
          resolve(null);
          return;
        }

        resolve({
          replyMessageId: result.replyMessageId,
          forwardMessageIds: result.forwardMessageIds || []
        });
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to load pending upload meta:', error);
    return null;
  }
};

export const deletePendingUploadMeta = async (
  topicId: string,
  messageId: string,
  userId = getResolvedUserId()
): Promise<void> => {
  discardStartupTopicRecords();
  if (!topicId || !messageId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const cacheKey = getPendingUploadMetaCacheKey(topicId, messageId, userId);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME);
      const request = store.delete(cacheKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to delete pending upload meta:', error);
  }
};
