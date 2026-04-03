import type { IMessage } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';

const DB_NAME = 'chat-topic-messages-db';
const STORE_NAME = 'topicMessages';
const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline'
]);

interface CachedTopicMessages {
  cacheKey: string;
  topicId: string;
  userId: string;
  messages: IMessage[];
  updatedAt: string;
}

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(item => serializeValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue)
      ])
    );
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

const openDb = async (): Promise<IDBDatabase | null> => {
  if (!hasIndexedDb()) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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

        resolve(deserializeValue(result.messages) as IMessage[]);
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

    const cacheKey = getCacheKey(topicId, userId);
    const payload: CachedTopicMessages = {
      cacheKey,
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
