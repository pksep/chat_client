import { openChatDatabase } from '../utils/chat-startup-databases';
import { reviveCachedDates as deserializeValue } from '../utils/revive-cached-dates';
import { toRaw } from 'vue';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';
import { isTopicSyncState, type TopicSyncState } from '../utils/topic-sync';
import { getConfig } from './useConfig';
import {
  clearTopicPreviewFreshness,
  saveTopicPreviewFreshness
} from '../utils/startup-topic-freshness';

const DB_NAME = 'chat-offline-state-db';
const STORE_NAME = 'entities';
const FAST_TOPICS_CACHE_PREFIX = 'chat-offline-fast-topics-v1';
const UNREAD_SUMMARIES_CACHE_PREFIX = 'chat-offline-unread-topics-v1';

type CacheEntityType = 'topics' | 'users' | 'topics-sync';

interface CachedEntity<T> {
  cacheKey: string;
  userId: string;
  type: CacheEntityType;
  items: T[];
  updatedAt: string;
  topicSync?: TopicSyncState;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const serializeValue = (value: unknown): unknown => {
  // Снимок не должен обходить реактивные getter для каждого вложенного поля.
  value = toRaw(value);
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

const getResolvedUserId = () =>
  authedUser.value?.id || getChatAuthSession()?.user?.id || '';

const getCacheKey = (type: CacheEntityType, userId = getResolvedUserId()) =>
  `${userId || 'anonymous'}:${type}`;

const getFastTopicsCacheKey = (userId = getResolvedUserId()) =>
  `${FAST_TOPICS_CACHE_PREFIX}:${userId || 'anonymous'}`;

export const loadCachedUnreadTopicSummaries = (userId?: string): ITopic[] => {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const items = JSON.parse(
      window.localStorage.getItem(
        `${UNREAD_SUMMARIES_CACHE_PREFIX}:${userId}`
      ) || '[]'
    );
    return Array.isArray(items)
      ? items.filter(item => typeof item?.id === 'string')
      : [];
  } catch {
    return [];
  }
};

export const saveCachedUnreadTopicSummaries = (
  items: ITopic[],
  userId?: string
): void => {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(
      `${UNREAD_SUMMARIES_CACHE_PREFIX}:${userId}`,
      JSON.stringify(serializeValue(items))
    );
  } catch (error) {
    console.warn('Не удалось сохранить счётчики непрочитанных чатов:', error);
  }
};

export const loadFastCachedTopics = <T = ITopic>(
  userId = getResolvedUserId()
): T[] | null => {
  if (typeof window === 'undefined' || !userId) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getFastTopicsCacheKey(userId));

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (!Array.isArray(parsedValue)) {
      return null;
    }

    return deserializeValue(parsedValue) as T[];
  } catch (error) {
    console.warn('Failed to load fast cached topics:', error);
    return null;
  }
};

const saveFastCachedTopics = <T>(
  topics: T[],
  userId = getResolvedUserId(),
  confirmedAt = 0
): void => {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  const apiUrl = getConfig().CHAT_API_DOMAIN || '';
  // Другая вкладка или фоновый снимок не подтверждают свежесть своего кеша.
  clearTopicPreviewFreshness(userId);
  try {
    window.localStorage.setItem(
      getFastTopicsCacheKey(userId),
      JSON.stringify(serializeValue(topics))
    );
    saveTopicPreviewFreshness(apiUrl, userId, confirmedAt);
  } catch (error) {
    console.warn('Failed to save fast cached topics:', error);
  }
};

const openDb = (): Promise<IDBDatabase | null> => openChatDatabase(DB_NAME);

export const loadCachedTopicSyncSnapshot = async (userId?: string) => {
  if (!userId) return null;
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise<{ topics: ITopic[]; sync: TopicSyncState } | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx
          .objectStore(STORE_NAME)
          .get(getCacheKey('topics-sync', userId));
        request.onsuccess = () => {
          const cached = request.result as CachedEntity<ITopic> | undefined;
          resolve(
            cached &&
              Array.isArray(cached.items) &&
              isTopicSyncState(cached.topicSync)
              ? {
                  topics: deserializeValue(cached.items) as ITopic[],
                  sync: cached.topicSync
                }
              : null
          );
        };
        request.onerror = () => reject(request.error);
      }
    );
  } catch (error) {
    console.warn('Не удалось прочитать подтверждённый снимок чатов:', error);
    return null;
  }
};

const loadCachedEntity = async <T>(
  type: CacheEntityType,
  userId = getResolvedUserId()
): Promise<T[]> => {
  if (!userId) {
    return [];
  }

  try {
    if (type === 'topics') {
      const fastTopics = loadFastCachedTopics<T>(userId);

      if (fastTopics?.length) {
        return fastTopics;
      }
    }

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
        const items = result?.items
          ? (deserializeValue(result.items) as T[])
          : ([] as T[]);

        if (type === 'topics' && items.length) {
          saveFastCachedTopics(items, userId);
        }

        resolve(items);
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
  userId = getResolvedUserId(),
  topicSync?: TopicSyncState | null,
  confirmedAt = 0
): Promise<void> => {
  if (!userId) {
    return;
  }

  if (type === 'topics') {
    saveFastCachedTopics(items, userId, confirmedAt);
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

    if (topicSync) payload.topicSync = topicSync;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      // Подтверждённый снимок хранится отдельно: локальная запись из другой
      // вкладки не должна связать старые карточки с более новым курсором.
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn(`Failed to save cached ${type}:`, error);
  }
};

export const loadCachedTopics = async (userId?: string): Promise<ITopic[]> =>
  loadCachedEntity<ITopic>('topics', userId);

export const saveCachedTopics = async (
  topics: ITopic[],
  userId?: string,
  confirmedAt?: number
): Promise<void> =>
  saveCachedEntity<ITopic>('topics', topics, userId, undefined, confirmedAt);

export const saveCachedTopicSyncSnapshot = (
  topics: ITopic[],
  sync: TopicSyncState | null,
  userId?: string
): Promise<void> =>
  saveCachedEntity('topics-sync', sync ? topics : [], userId, sync);

export const loadCachedUsers = async (userId?: string): Promise<IUser[]> =>
  loadCachedEntity<IUser>('users', userId);

export const saveCachedUsers = async (
  users: IUser[],
  userId?: string
): Promise<void> => saveCachedEntity<IUser>('users', users, userId);
