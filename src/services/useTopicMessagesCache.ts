import type { IMessage } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';

const DB_NAME = 'chat-topic-messages-db';
const DB_VERSION = 5;
const STORE_NAME = 'topicMessages';
const PINNED_MESSAGES_STORE_NAME = 'pinnedMessages';
const PENDING_UPLOADS_STORE_NAME = 'pendingUploads';
const PENDING_UPLOAD_META_STORE_NAME = 'pendingUploadMeta';
const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline'
]);
let dbPromise: Promise<IDBDatabase | null> | null = null;

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
  file: File;
  isMedia: boolean;
  updatedAt: string;
}

interface CachedPendingUploadMeta {
  cacheKey: string;
  topicId: string;
  messageId: string;
  replyMessageId?: string;
  forwardMessageIds: string[];
  updatedAt: string;
}

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const deserializeValue = (value: unknown, key?: string): unknown => {
  if (typeof value === 'string' && key && DATE_KEYS.has(key)) {
    return new Date(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => deserializeValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        deserializeValue(nestedValue, nestedKey)
      ])
    );
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

const getMessageTimestamp = (message: IMessage): number => {
  const candidates = [message.updatedAt, message.deletedAt, message.createdAt];

  for (const candidate of candidates) {
    const timestamp =
      candidate instanceof Date
        ? candidate.getTime()
        : new Date(candidate || 0).getTime();

    if (!Number.isNaN(timestamp) && timestamp > 0) {
      return timestamp;
    }
  }

  return 0;
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

const parseMessageEx = (
  message: Pick<IMessage, 'ex'>
): Record<string, unknown> | null => {
  if (!message.ex) {
    return null;
  }

  try {
    return JSON.parse(message.ex);
  } catch {
    return null;
  }
};

const getMessageStableKey = (message: IMessage): string | null => {
  if (!message?.id) {
    return null;
  }

  const clientId = parseMessageEx(message)?.clientId;

  if (typeof clientId === 'string' && clientId.length > 0) {
    return `client:${clientId}`;
  }

  return `id:${message.id}`;
};

const mergeCachedMessages = (
  existingMessages: IMessage[],
  incomingMessages: IMessage[]
): IMessage[] => {
  const mergedByKey = new Map<string, IMessage>();

  existingMessages.forEach(message => {
    const stableKey = getMessageStableKey(message);

    if (stableKey) {
      mergedByKey.set(stableKey, message);
    }
  });

  incomingMessages.forEach(message => {
    const stableKey = getMessageStableKey(message);

    if (!stableKey) {
      return;
    }

    const existingMessage = mergedByKey.get(stableKey);

    if (!existingMessage) {
      mergedByKey.set(stableKey, message);
      return;
    }

    if (getMessageTimestamp(message) >= getMessageTimestamp(existingMessage)) {
      mergedByKey.set(stableKey, {
        ...existingMessage,
        ...message
      });
    }
  });

  return Array.from(mergedByKey.values()).sort(compareMessagesByPosition);
};

const openDb = async (): Promise<IDBDatabase | null> => {
  if (!hasIndexedDb()) {
    return null;
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }

      if (!db.objectStoreNames.contains(PINNED_MESSAGES_STORE_NAME)) {
        db.createObjectStore(PINNED_MESSAGES_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      }

      if (!db.objectStoreNames.contains(PENDING_UPLOADS_STORE_NAME)) {
        db.createObjectStore(PENDING_UPLOADS_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      }

      if (!db.objectStoreNames.contains(PENDING_UPLOAD_META_STORE_NAME)) {
        db.createObjectStore(PENDING_UPLOAD_META_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
};

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

export const savePendingUploadFile = async (params: {
  topicId: string;
  messageId: string;
  fileId: string;
  file: File;
  isMedia: boolean;
  userId?: string;
}): Promise<void> => {
  if (!params.topicId || !params.messageId || !params.fileId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const payload: CachedPendingUpload = {
      cacheKey: getPendingUploadCacheKey(
        params.topicId,
        params.messageId,
        params.fileId,
        params.userId
      ),
      topicId: params.topicId,
      messageId: params.messageId,
      fileId: params.fileId,
      file: params.file,
      isMedia: params.isMedia,
      updatedAt: new Date().toISOString()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      store.put(payload);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to save pending upload file:', error);
  }
};

export const loadPendingUploadFile = async (
  topicId: string,
  messageId: string,
  fileId: string,
  userId = getResolvedUserId()
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

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readonly');
      const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result as CachedPendingUpload | undefined;

        if (!result?.file) {
          resolve(null);
          return;
        }

        resolve({
          file: result.file,
          isMedia: result.isMedia
        });
      };
      request.onerror = () => reject(request.error);
    });
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

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const cacheKey = getPendingUploadCacheKey(
      topicId,
      messageId,
      fileId,
      userId
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOADS_STORE_NAME);
      const request = store.delete(cacheKey);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Failed to delete pending upload file:', error);
  }
};

export const savePendingUploadMeta = async (params: {
  topicId: string;
  messageId: string;
  replyMessageId?: string;
  forwardMessageIds: string[];
  userId?: string;
}): Promise<void> => {
  if (!params.topicId || !params.messageId) {
    return;
  }

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
      updatedAt: new Date().toISOString()
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PENDING_UPLOAD_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PENDING_UPLOAD_META_STORE_NAME);
      store.put(payload);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to save pending upload meta:', error);
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
