import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';

const DB_NAME = 'chat-offline-state-db';
const STORE_NAME = 'entities';
const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline'
]);

type CacheEntityType = 'topics' | 'users';

interface CachedEntity<T> {
  cacheKey: string;
  userId: string;
  type: CacheEntityType;
  items: T[];
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

const getCacheKey = (type: CacheEntityType, userId = getResolvedUserId()) =>
  `${userId || 'anonymous'}:${type}`;

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

const loadCachedEntity = async <T>(
  type: CacheEntityType,
  userId = getResolvedUserId()
): Promise<T[]> => {
  if (!userId) {
    return [];
  }

  try {
    const db = await openDb();

    if (!db) {
      return [];
    }

    const cacheKey = getCacheKey(type, userId);

    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        const result = request.result as CachedEntity<T> | undefined;
        resolve(
          result?.items ? (deserializeValue(result.items) as T[]) : ([] as T[])
        );
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn(`Failed to load cached ${type}:`, error);
    return [];
  }
};

const saveCachedEntity = async <T>(
  type: CacheEntityType,
  items: T[],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!userId) {
    return;
  }

  try {
    const db = await openDb();

    if (!db) {
      return;
    }

    const payload: CachedEntity<T> = {
      cacheKey: getCacheKey(type, userId),
      userId,
      type,
      items: serializeValue(items) as T[],
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
    console.warn(`Failed to save cached ${type}:`, error);
  }
};

export const loadCachedTopics = async (userId?: string): Promise<ITopic[]> =>
  loadCachedEntity<ITopic>('topics', userId);

export const saveCachedTopics = async (
  topics: ITopic[],
  userId?: string
): Promise<void> => saveCachedEntity<ITopic>('topics', topics, userId);

export const loadCachedUsers = async (userId?: string): Promise<IUser[]> =>
  loadCachedEntity<IUser>('users', userId);

export const saveCachedUsers = async (
  users: IUser[],
  userId?: string
): Promise<void> => saveCachedEntity<IUser>('users', users, userId);
