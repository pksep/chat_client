import { reviveCachedDates } from '../utils/revive-cached-dates';
import type { IMessage } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';

const DB_NAME = 'chat-sync-shadow-db';
const DB_VERSION = 3;
const EVENT_LOG_STORE = 'eventLog';
const TOPIC_SNAPSHOT_STORE = 'topicSnapshots';
const TOPIC_PREVIEW_STORE = 'topicPreviews';
const READ_STATE_STORE = 'readStates';
const SYNC_META_STORE = 'syncMeta';
const SHADOW_SYNC_FLAG_KEY = 'chat.shadowSync.enabled';
const SHADOW_LOADED_RANGES_VERSION = 2;
const MAX_EVENT_LOG_RECORDS_PER_USER = 300;
const TOPIC_PREVIEW_MESSAGES_LIMIT = 48;
const DELETED_MESSAGES_META_PREFIX = 'deletedMessages:';
const DELETED_MESSAGE_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline',
  'timestamp',
  'receivedAt'
]);
const deserializeValue = (value: unknown): unknown =>
  reviveCachedDates(value, DATE_KEYS);

export interface ShadowReadStateValue {
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}

export interface ShadowLoadedRange {
  fromMessageId: string | null;
  toMessageId: string | null;
  fromCreatedAt: string | null;
  toCreatedAt: string | null;
  updatedAt: string;
}

interface ShadowLoadedRangesState {
  version: number;
  ranges: ShadowLoadedRange[];
}

export interface ShadowTopicPageOptions {
  limit?: number;
  lastMessageId?: string;
  afterMessageId?: string;
}

export interface ShadowTopicContextOptions {
  beforeLimit?: number;
  afterLimit?: number;
}

export interface ShadowRangeResolution<T> {
  status:
    | 'cache_hit'
    | 'no_snapshot'
    | 'cursor_missing'
    | 'range_gap'
    | 'range_edge';
  messages: T[];
}

const shadowReadStateCache = new Map<string, ShadowReadStateValue | null>();
const shadowSyncMetaCache = new Map<string, unknown>();
const shadowReadStateLoads = new Map<
  string,
  Promise<ShadowReadStateValue | null>
>();
const shadowSyncMetaLoads = new Map<string, Promise<unknown>>();
const scheduledEventLogPrunes = new Set<string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export type ShadowSyncSource = 'http' | 'ws' | 'local';

export type ShadowChatEventType =
  | 'bootstrap_history'
  | 'new_message'
  | 'edit_message'
  | 'delete_message'
  | 'clear_history'
  | 'pin_message'
  | 'reaction_updated'
  | 'reaction_seen'
  | 'read_state'
  | 'topic_changed';

interface ShadowChatEventRecord {
  id: string;
  userId: string;
  topicId: string;
  type: ShadowChatEventType;
  source: ShadowSyncSource;
  payload: unknown;
  timestamp: string;
}

interface ShadowTopicSnapshotRecord {
  cacheKey: string;
  userId: string;
  topicId: string;
  messages: IMessage[];
  updatedAt: string;
  source: ShadowSyncSource;
}

interface ShadowReadStateRecord {
  cacheKey: string;
  userId: string;
  topicId: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  updatedAt: string;
  source: ShadowSyncSource;
}

interface ShadowSyncMetaRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCurrentShadowLoadedRangesState = (
  value: unknown
): value is ShadowLoadedRangesState =>
  isPlainObject(value) &&
  value.version === SHADOW_LOADED_RANGES_VERSION &&
  Array.isArray(value.ranges);

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

const getResolvedUserId = () =>
  authedUser.value?.id || getChatAuthSession()?.user?.id || '';

const getTopicCacheKey = (topicId: string, userId: string) =>
  `${userId || 'anonymous'}:${topicId}`;

const getMetaKey = (key: string, userId: string) =>
  `${userId || 'anonymous'}:${key}`;

const getDeletedMessagesMetaKey = (topicId: string): string =>
  `${DELETED_MESSAGES_META_PREFIX}${topicId}`;

const getReadStateCacheKey = (topicId: string, userId: string) =>
  `${userId || 'anonymous'}:${topicId}`;

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

const mergeMessages = (
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

      if (!db.objectStoreNames.contains(EVENT_LOG_STORE)) {
        db.createObjectStore(EVENT_LOG_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(TOPIC_SNAPSHOT_STORE)) {
        db.createObjectStore(TOPIC_SNAPSHOT_STORE, { keyPath: 'cacheKey' });
      }

      if (!db.objectStoreNames.contains(TOPIC_PREVIEW_STORE)) {
        db.createObjectStore(TOPIC_PREVIEW_STORE, { keyPath: 'cacheKey' });
      }

      if (!db.objectStoreNames.contains(READ_STATE_STORE)) {
        db.createObjectStore(READ_STATE_STORE, { keyPath: 'cacheKey' });
      }

      if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
        db.createObjectStore(SYNC_META_STORE, { keyPath: 'key' });
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

const getShadowSyncEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const storedValue = window.localStorage.getItem(SHADOW_SYNC_FLAG_KEY);

  if (storedValue === null) {
    return true;
  }

  return storedValue !== 'false';
};

const pruneShadowEventLog = async (userId: string): Promise<void> => {
  const db = await openDb();

  if (!db || !userId) {
    return;
  }

  try {
    const records = await new Promise<ShadowChatEventRecord[]>(
      (resolve, reject) => {
        const tx = db.transaction(EVENT_LOG_STORE, 'readonly');
        const store = tx.objectStore(EVENT_LOG_STORE);
        const request = store.getAll();

        request.onsuccess = () =>
          resolve(
            (request.result as ShadowChatEventRecord[] | undefined) || []
          );
        request.onerror = () => reject(request.error);
      }
    );

    const userRecords = records
      .filter(record => record.userId === userId)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    const recordsToDelete = userRecords.slice(
      0,
      Math.max(0, userRecords.length - MAX_EVENT_LOG_RECORDS_PER_USER)
    );

    if (recordsToDelete.length === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, 'readwrite');
      const store = tx.objectStore(EVENT_LOG_STORE);

      recordsToDelete.forEach(record => {
        store.delete(record.id);
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to prune shadow chat event log:', error);
  }
};

const scheduleShadowEventLogPrune = (userId: string): void => {
  if (!userId || scheduledEventLogPrunes.has(userId)) {
    return;
  }

  scheduledEventLogPrunes.add(userId);

  setTimeout(() => {
    void pruneShadowEventLog(userId).finally(() => {
      scheduledEventLogPrunes.delete(userId);
    });
  }, 1000);
};

const putRecord = async <T extends object>(
  storeName: string,
  payload: T
): Promise<boolean> => {
  const db = await openDb();

  if (!db) {
    return false;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(payload);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return true;
};

const getRecord = async <T>(
  storeName: string,
  key: IDBValidKey
): Promise<T | null> => {
  const db = await openDb();

  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () =>
      resolve((request.result as T | undefined) || null);
    request.onerror = () => reject(request.error);
  });
};

const putTopicSnapshotRecords = async (
  payload: ShadowTopicSnapshotRecord
): Promise<boolean> => {
  const db = await openDb();

  if (!db) {
    return false;
  }

  const previewPayload: ShadowTopicSnapshotRecord = {
    ...payload,
    messages: payload.messages.slice(-TOPIC_PREVIEW_MESSAGES_LIMIT)
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [TOPIC_SNAPSHOT_STORE, TOPIC_PREVIEW_STORE],
      'readwrite'
    );
    tx.objectStore(TOPIC_SNAPSHOT_STORE).put(payload);
    tx.objectStore(TOPIC_PREVIEW_STORE).put(previewPayload);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  return true;
};

const deleteTopicSnapshotRecords = async (cacheKey: string): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [TOPIC_SNAPSHOT_STORE, TOPIC_PREVIEW_STORE],
      'readwrite'
    );
    tx.objectStore(TOPIC_SNAPSHOT_STORE).delete(cacheKey);
    tx.objectStore(TOPIC_PREVIEW_STORE).delete(cacheKey);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

export const recordShadowChatEvent = async (params: {
  topicId: string;
  type: ShadowChatEventType;
  source: ShadowSyncSource;
  payload: unknown;
  userId?: string;
}): Promise<void> => {
  const userId = params.userId || getResolvedUserId();

  if (!getShadowSyncEnabled() || !params.topicId || !userId) {
    return;
  }

  try {
    const now = new Date().toISOString();
    const payload: ShadowChatEventRecord = {
      id: `${userId}:${params.topicId}:${now}:${crypto.randomUUID()}`,
      userId,
      topicId: params.topicId,
      type: params.type,
      source: params.source,
      payload: serializeValue(params.payload),
      timestamp: now
    };

    await putRecord(EVENT_LOG_STORE, payload);
    scheduleShadowEventLogPrune(userId);
  } catch (error) {
    console.warn('Failed to record shadow chat event:', error);
  }
};

export const saveShadowTopicSnapshot = async (
  topicId: string,
  messages: IMessage[],
  source: ShadowSyncSource,
  userId = getResolvedUserId(),
  opts?: { replace?: boolean }
): Promise<boolean> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return false;
  }

  try {
    const cacheKey = getTopicCacheKey(topicId, userId);
    const existing = opts?.replace
      ? []
      : (
          await getRecord<ShadowTopicSnapshotRecord>(
            TOPIC_SNAPSHOT_STORE,
            cacheKey
          )
        )?.messages || [];
    const incomingMessages = await filterShadowDeletedMessages(
      topicId,
      messages,
      userId
    );
    const existingMessages = await filterShadowDeletedMessages(
      topicId,
      existing,
      userId
    );
    const mergedMessages = opts?.replace
      ? mergeMessages([], incomingMessages)
      : incomingMessages.length > 0
        ? mergeMessages(existingMessages, incomingMessages)
        : existingMessages;

    if (!mergedMessages.length) {
      await deleteTopicSnapshotRecords(cacheKey);

      return true;
    }

    const payload: ShadowTopicSnapshotRecord = {
      cacheKey,
      userId,
      topicId,
      messages: serializeValue(mergedMessages) as IMessage[],
      updatedAt: new Date().toISOString(),
      source
    };

    return await putTopicSnapshotRecords(payload);
  } catch (error) {
    console.warn('Failed to save shadow topic snapshot:', error);
    return false;
  }
};

export const saveShadowReadState = async (
  topicId: string,
  lastReadMessageId: string | null,
  lastReadAt: string | null,
  source: ShadowSyncSource,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return;
  }

  try {
    shadowReadStateCache.set(getReadStateCacheKey(topicId, userId), {
      lastReadMessageId,
      lastReadAt
    });

    const payload: ShadowReadStateRecord = {
      cacheKey: getTopicCacheKey(topicId, userId),
      userId,
      topicId,
      lastReadMessageId,
      lastReadAt,
      updatedAt: new Date().toISOString(),
      source
    };

    await putRecord(READ_STATE_STORE, payload);
  } catch (error) {
    console.warn('Failed to save shadow read state:', error);
  }
};

export const syncShadowReadStateFromMessages = async (
  topicId: string,
  messages: IMessage[],
  source: ShadowSyncSource,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!getShadowSyncEnabled() || !topicId || !userId || !messages.length) {
    return;
  }

  let lastReadMessage: IMessage | undefined;
  let lastReadTimestamp = Number.NEGATIVE_INFINITY;

  for (const message of messages) {
    if (message.senderUserId === userId || !message.isReadByMe) {
      continue;
    }

    const timestamp = getMessageCreatedTimestamp(message);
    if (timestamp >= lastReadTimestamp) {
      lastReadMessage = message;
      lastReadTimestamp = timestamp;
    }
  }

  await saveShadowReadState(
    topicId,
    lastReadMessage?.id || null,
    lastReadMessage?.createdAt
      ? new Date(lastReadMessage.createdAt).toISOString()
      : null,
    source,
    userId
  );
};

export const saveShadowSyncMeta = async (
  key: string,
  value: unknown,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!getShadowSyncEnabled() || !key || !userId) {
    return;
  }

  try {
    shadowSyncMetaCache.set(getMetaKey(key, userId), value);

    const payload: ShadowSyncMetaRecord = {
      key: getMetaKey(key, userId),
      value: serializeValue(value),
      updatedAt: new Date().toISOString()
    };

    await putRecord(SYNC_META_STORE, payload);
  } catch (error) {
    console.warn('Failed to save shadow sync meta:', error);
  }
};

export const appendShadowSyncMetaList = async <T>(
  key: string,
  value: T,
  opts?: { limit?: number; userId?: string }
): Promise<void> => {
  const userId = opts?.userId || getResolvedUserId();

  if (!getShadowSyncEnabled() || !key || !userId) {
    return;
  }

  try {
    const existingItems = (await loadShadowSyncMeta<T[]>(key, userId)) || [];
    const nextItems = [...existingItems, value].slice(-(opts?.limit || 40));

    await saveShadowSyncMeta(key, nextItems, userId);
  } catch (error) {
    console.warn('Failed to append shadow sync meta list:', error);
  }
};

export const loadShadowDeletedMessageIds = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<Set<string>> => {
  const deletedMessages =
    (await loadShadowSyncMeta<Record<string, string>>(
      getDeletedMessagesMetaKey(topicId),
      userId
    )) || {};
  const now = Date.now();
  const activeIds = Object.entries(deletedMessages)
    .filter(([, deletedAt]) => {
      const deletedTimestamp = new Date(deletedAt).getTime();
      return (
        !Number.isNaN(deletedTimestamp) &&
        now - deletedTimestamp < DELETED_MESSAGE_TOMBSTONE_TTL_MS
      );
    })
    .map(([messageId]) => messageId);

  return new Set(activeIds);
};

export const markShadowTopicMessageDeleted = async (
  topicId: string,
  messageId: string,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!getShadowSyncEnabled() || !topicId || !messageId || !userId) {
    return;
  }

  const key = getDeletedMessagesMetaKey(topicId);
  const existing =
    (await loadShadowSyncMeta<Record<string, string>>(key, userId)) || {};
  const now = new Date().toISOString();
  const cutoff = Date.now() - DELETED_MESSAGE_TOMBSTONE_TTL_MS;
  const next = Object.fromEntries(
    Object.entries({
      ...existing,
      [messageId]: now
    }).filter(([, deletedAt]) => {
      const deletedTimestamp = new Date(deletedAt).getTime();
      return !Number.isNaN(deletedTimestamp) && deletedTimestamp >= cutoff;
    })
  );

  await saveShadowSyncMeta(key, next, userId);
};

const filterShadowDeletedMessages = async (
  topicId: string,
  messages: IMessage[],
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  if (!messages.length) {
    return messages;
  }

  const deletedMessageIds = await loadShadowDeletedMessageIds(topicId, userId);

  if (!deletedMessageIds.size) {
    return messages;
  }

  return messages.filter(message => !deletedMessageIds.has(message.id));
};

const mergeShadowLoadedRanges = (
  existingRanges: ShadowLoadedRange[],
  incomingRange: ShadowLoadedRange
): ShadowLoadedRange[] => {
  const sortRangeBoundary = (value: string | null) => value || '';
  const normalizedRanges = [...existingRanges, incomingRange]
    .map(range => ({
      ...range,
      fromCreatedAt: range.fromCreatedAt || null,
      toCreatedAt: range.toCreatedAt || null
    }))
    .sort((left, right) =>
      sortRangeBoundary(left.fromCreatedAt).localeCompare(
        sortRangeBoundary(right.fromCreatedAt)
      )
    );
  const merged: ShadowLoadedRange[] = [];

  const overlaps = (left: ShadowLoadedRange, right: ShadowLoadedRange) => {
    if (
      !left.fromCreatedAt ||
      !left.toCreatedAt ||
      !right.fromCreatedAt ||
      !right.toCreatedAt
    ) {
      return (
        left.fromMessageId === right.fromMessageId ||
        left.toMessageId === right.toMessageId ||
        left.toMessageId === right.fromMessageId ||
        left.fromMessageId === right.toMessageId
      );
    }

    return !(
      right.toCreatedAt < left.fromCreatedAt ||
      right.fromCreatedAt > left.toCreatedAt
    );
  };

  const mergePair = (
    left: ShadowLoadedRange,
    right: ShadowLoadedRange
  ): ShadowLoadedRange => ({
    fromMessageId:
      sortRangeBoundary(left.fromCreatedAt) <=
      sortRangeBoundary(right.fromCreatedAt)
        ? left.fromMessageId
        : right.fromMessageId,
    toMessageId:
      sortRangeBoundary(left.toCreatedAt) >=
      sortRangeBoundary(right.toCreatedAt)
        ? left.toMessageId
        : right.toMessageId,
    fromCreatedAt:
      [left.fromCreatedAt, right.fromCreatedAt]
        .filter((value): value is string => !!value)
        .sort()[0] || null,
    toCreatedAt:
      [left.toCreatedAt, right.toCreatedAt]
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) || null,
    updatedAt:
      [left.updatedAt, right.updatedAt]
        .filter((value): value is string => !!value)
        .sort()
        .at(-1) || new Date().toISOString()
  });

  normalizedRanges.forEach(range => {
    const previous = merged.at(-1);

    if (!previous) {
      merged.push(range);
      return;
    }

    if (overlaps(previous, range)) {
      merged[merged.length - 1] = mergePair(previous, range);
      return;
    }

    merged.push(range);
  });

  return merged;
};

const isMessageInRange = (
  message: IMessage,
  range: ShadowLoadedRange
): boolean => {
  const timestamp = getMessageCreatedTimestamp(message);
  const fromTimestamp = range.fromCreatedAt
    ? new Date(range.fromCreatedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTimestamp = range.toCreatedAt
    ? new Date(range.toCreatedAt).getTime()
    : Number.POSITIVE_INFINITY;

  return timestamp >= fromTimestamp && timestamp <= toTimestamp;
};

const getMessagesForRange = (
  messages: IMessage[],
  range: ShadowLoadedRange
): IMessage[] => messages.filter(message => isMessageInRange(message, range));

const isTimestampInRange = (
  timestamp: number,
  range: ShadowLoadedRange
): boolean => {
  const fromTimestamp = range.fromCreatedAt
    ? new Date(range.fromCreatedAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTimestamp = range.toCreatedAt
    ? new Date(range.toCreatedAt).getTime()
    : Number.POSITIVE_INFINITY;

  return timestamp >= fromTimestamp && timestamp <= toTimestamp;
};

const getContainingRange = (
  message: IMessage,
  ranges: ShadowLoadedRange[]
): ShadowLoadedRange | null =>
  ranges.find(range => isMessageInRange(message, range)) || null;

export const loadShadowSyncMeta = async <T>(
  key: string,
  userId = getResolvedUserId()
): Promise<T | null> => {
  if (!getShadowSyncEnabled() || !key || !userId) {
    return null;
  }

  const cacheKey = getMetaKey(key, userId);
  const cachedValue = shadowSyncMetaCache.get(cacheKey);

  if (cachedValue !== undefined) {
    return cachedValue as T;
  }

  let loading = shadowSyncMetaLoads.get(cacheKey);
  if (!loading) {
    loading = (async () => {
      try {
        const record = await getRecord<ShadowSyncMetaRecord>(
          SYNC_META_STORE,
          cacheKey
        );
        const value =
          record?.value !== undefined
            ? (deserializeValue(record.value) as T)
            : null;

        // Запись, пришедшая во время чтения, новее результата этого запроса.
        const currentValue = shadowSyncMetaCache.get(cacheKey);
        if (currentValue !== undefined) return currentValue;
        shadowSyncMetaCache.set(cacheKey, value);

        return value;
      } catch (error) {
        console.warn('Failed to load shadow sync meta:', error);
        return null;
      } finally {
        shadowSyncMetaLoads.delete(cacheKey);
      }
    })();
    shadowSyncMetaLoads.set(cacheKey, loading);
  }
  return loading as Promise<T | null>;
};

export const saveShadowLoadedRange = async (
  topicId: string,
  messages: IMessage[],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !messages.length) {
    return;
  }

  const sortedMessages = [...messages].sort(compareMessagesByPosition);
  const firstMessage = sortedMessages[0];
  const lastMessage = sortedMessages[sortedMessages.length - 1];

  const nextRange: ShadowLoadedRange = {
    fromMessageId: firstMessage?.id || null,
    toMessageId: lastMessage?.id || null,
    fromCreatedAt: firstMessage?.createdAt
      ? new Date(firstMessage.createdAt).toISOString()
      : null,
    toCreatedAt: lastMessage?.createdAt
      ? new Date(lastMessage.createdAt).toISOString()
      : null,
    updatedAt: new Date().toISOString()
  };

  const existingRanges = await loadShadowLoadedRanges(topicId, userId);

  await saveShadowSyncMeta(
    `ranges:${topicId}`,
    {
      version: SHADOW_LOADED_RANGES_VERSION,
      ranges: mergeShadowLoadedRanges(existingRanges, nextRange)
    } satisfies ShadowLoadedRangesState,
    userId
  );
};

export const loadShadowLoadedRanges = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<ShadowLoadedRange[]> => {
  if (!topicId) {
    return [];
  }

  const state = await loadShadowSyncMeta<unknown>(`ranges:${topicId}`, userId);

  return isCurrentShadowLoadedRangesState(state) ? state.ranges : [];
};

export const getCachedShadowLoadedRanges = (
  topicId: string,
  userId = getResolvedUserId()
): ShadowLoadedRange[] | undefined => {
  if (!topicId || !userId) {
    return undefined;
  }

  const cachedValue = shadowSyncMetaCache.get(
    getMetaKey(`ranges:${topicId}`, userId)
  );

  if (cachedValue === undefined) {
    return undefined;
  }

  return isCurrentShadowLoadedRangesState(cachedValue)
    ? cachedValue.ranges
    : [];
};

export const hasCachedShadowLoadedRanges = (
  topicId: string,
  userId = getResolvedUserId()
): boolean => getCachedShadowLoadedRanges(topicId, userId) !== undefined;

export const isShadowTimestampCoveredByCachedRanges = (
  topicId: string,
  timestamp: number,
  userId = getResolvedUserId()
): boolean => {
  if (!topicId || !userId || !Number.isFinite(timestamp) || timestamp <= 0) {
    return false;
  }

  const ranges = getCachedShadowLoadedRanges(topicId, userId);

  if (!ranges?.length) {
    return false;
  }

  return ranges.some(range => isTimestampInRange(timestamp, range));
};

export const loadShadowTopicContext = async (
  topicId: string,
  messageId: string,
  opts?: ShadowTopicContextOptions,
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  const resolution = await resolveShadowTopicContext(
    topicId,
    messageId,
    opts,
    userId
  );
  return resolution.messages;
};

export const resolveShadowTopicContext = async (
  topicId: string,
  messageId: string,
  opts?: ShadowTopicContextOptions,
  userId = getResolvedUserId()
): Promise<ShadowRangeResolution<IMessage>> => {
  if (!topicId || !messageId) {
    return {
      status: 'cursor_missing',
      messages: []
    };
  }

  const [messages, ranges] = await Promise.all([
    loadShadowTopicSnapshot(topicId, userId),
    loadShadowLoadedRanges(topicId, userId)
  ]);

  if (!messages.length) {
    return {
      status: 'no_snapshot',
      messages: []
    };
  }

  const sortedMessages = [...messages].sort(compareMessagesByPosition);
  const targetMessage = sortedMessages.find(
    message => message.id === messageId
  );

  if (!targetMessage) {
    return {
      status: 'cursor_missing',
      messages: []
    };
  }

  const containingRange = getContainingRange(targetMessage, ranges);

  if (!containingRange) {
    return {
      status: 'range_gap',
      messages: []
    };
  }

  const rangeMessages = getMessagesForRange(sortedMessages, containingRange);
  const cursorIndex = rangeMessages.findIndex(
    message => message.id === messageId
  );

  if (cursorIndex < 0) {
    return {
      status: 'range_gap',
      messages: []
    };
  }

  const beforeLimit = Math.max(0, opts?.beforeLimit || 40);
  const afterLimit = Math.max(0, opts?.afterLimit || 40);
  const startIndex = Math.max(0, cursorIndex - beforeLimit);
  const endIndex = Math.min(rangeMessages.length, cursorIndex + afterLimit + 1);

  return {
    status: 'cache_hit',
    messages: rangeMessages.slice(startIndex, endIndex)
  };
};

export const loadShadowTopicSnapshot = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return [];
  }

  try {
    const record = await getRecord<ShadowTopicSnapshotRecord>(
      TOPIC_SNAPSHOT_STORE,
      getTopicCacheKey(topicId, userId)
    );

    const messages = record?.messages
      ? mergeMessages([], deserializeValue(record.messages) as IMessage[])
      : [];

    return filterShadowDeletedMessages(topicId, messages, userId);
  } catch (error) {
    console.warn('Failed to load shadow topic snapshot:', error);
    return [];
  }
};

export const loadShadowTopicPreview = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return [];
  }

  try {
    const record = await getRecord<ShadowTopicSnapshotRecord>(
      TOPIC_PREVIEW_STORE,
      getTopicCacheKey(topicId, userId)
    );
    const messages = record?.messages
      ? mergeMessages([], deserializeValue(record.messages) as IMessage[])
      : [];

    return filterShadowDeletedMessages(topicId, messages, userId);
  } catch (error) {
    console.warn('Failed to load shadow topic preview:', error);
    return [];
  }
};

export const loadShadowTopicPage = async (
  topicId: string,
  opts?: ShadowTopicPageOptions,
  userId = getResolvedUserId()
): Promise<IMessage[]> => {
  const resolution = await resolveShadowTopicPage(topicId, opts, userId);
  return resolution.messages;
};

export const resolveShadowTopicPage = async (
  topicId: string,
  opts?: ShadowTopicPageOptions,
  userId = getResolvedUserId()
): Promise<ShadowRangeResolution<IMessage>> => {
  const [messages, ranges] = await Promise.all([
    loadShadowTopicSnapshot(topicId, userId),
    loadShadowLoadedRanges(topicId, userId)
  ]);

  if (!messages.length) {
    return {
      status: 'no_snapshot',
      messages: []
    };
  }

  const limit = Math.max(1, opts?.limit || 50);
  const sortedMessages = [...messages].sort(compareMessagesByPosition);

  if (opts?.lastMessageId) {
    const cursorMessage = sortedMessages.find(
      message => message.id === opts.lastMessageId
    );

    if (!cursorMessage) {
      return {
        status: 'cursor_missing',
        messages: []
      };
    }

    const containingRange = getContainingRange(cursorMessage, ranges);
    const rangeMessages = containingRange
      ? getMessagesForRange(sortedMessages, containingRange)
      : [];
    const cursorIndex = rangeMessages.findIndex(
      message => message.id === opts.lastMessageId
    );

    if (cursorIndex <= 0) {
      return {
        status: containingRange ? 'range_edge' : 'range_gap',
        messages: []
      };
    }

    const startIndex = Math.max(0, cursorIndex - limit);
    return {
      status: 'cache_hit',
      messages: rangeMessages.slice(startIndex, cursorIndex)
    };
  }

  if (opts?.afterMessageId) {
    const cursorMessage = sortedMessages.find(
      message => message.id === opts.afterMessageId
    );

    if (!cursorMessage) {
      return {
        status: 'cursor_missing',
        messages: []
      };
    }

    const containingRange = getContainingRange(cursorMessage, ranges);
    const rangeMessages = containingRange
      ? getMessagesForRange(sortedMessages, containingRange)
      : [];
    const cursorIndex = rangeMessages.findIndex(
      message => message.id === opts.afterMessageId
    );

    if (cursorIndex < 0 || cursorIndex >= rangeMessages.length - 1) {
      return {
        status: containingRange ? 'range_edge' : 'range_gap',
        messages: []
      };
    }

    return {
      status: 'cache_hit',
      messages: rangeMessages.slice(cursorIndex + 1, cursorIndex + 1 + limit)
    };
  }

  const latestRange = [...ranges]
    .sort((left, right) =>
      (left.toCreatedAt || '').localeCompare(right.toCreatedAt || '')
    )
    .at(-1);

  if (!latestRange) {
    return {
      status: 'cache_hit',
      messages: sortedMessages.slice(-limit)
    };
  }

  return {
    status: 'cache_hit',
    messages: getMessagesForRange(sortedMessages, latestRange).slice(-limit)
  };
};

export const loadShadowReadState = async (
  topicId: string,
  userId = getResolvedUserId()
): Promise<ShadowReadStateValue | null> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return null;
  }

  const cacheKey = getReadStateCacheKey(topicId, userId);
  let loading = shadowReadStateLoads.get(cacheKey);
  if (!loading) {
    const previousValue = shadowReadStateCache.get(cacheKey);
    loading = (async () => {
      try {
        const record = await getRecord<ShadowReadStateRecord>(
          READ_STATE_STORE,
          getTopicCacheKey(topicId, userId)
        );

        const readState = record
          ? {
              lastReadMessageId: record.lastReadMessageId || null,
              lastReadAt: record.lastReadAt || null
            }
          : null;
        const currentValue = shadowReadStateCache.get(cacheKey);
        if (currentValue !== previousValue) return currentValue || null;
        shadowReadStateCache.set(cacheKey, readState);

        return readState;
      } catch (error) {
        console.warn('Failed to load shadow read state:', error);
        return null;
      } finally {
        shadowReadStateLoads.delete(cacheKey);
      }
    })();
    shadowReadStateLoads.set(cacheKey, loading);
  }
  return loading;
};

export const deleteShadowTopicMessage = async (
  topicId: string,
  messageId: string,
  userId = getResolvedUserId()
): Promise<void> => {
  if (!getShadowSyncEnabled() || !topicId || !messageId || !userId) {
    return;
  }

  try {
    await markShadowTopicMessageDeleted(topicId, messageId, userId);

    const cacheKey = getTopicCacheKey(topicId, userId);
    const existing = await getRecord<ShadowTopicSnapshotRecord>(
      TOPIC_SNAPSHOT_STORE,
      cacheKey
    );

    if (!existing?.messages?.length) {
      return;
    }

    const filteredMessages = (
      deserializeValue(existing.messages) as IMessage[]
    ).filter(message => message.id !== messageId);

    await saveShadowTopicSnapshot(topicId, filteredMessages, 'local', userId, {
      replace: true
    });
  } catch (error) {
    console.warn('Failed to delete shadow topic message:', error);
  }
};

export const getCachedShadowReadState = (
  topicId: string,
  userId = getResolvedUserId()
): ShadowReadStateValue | null | undefined => {
  if (!topicId || !userId) {
    return undefined;
  }

  return shadowReadStateCache.get(getReadStateCacheKey(topicId, userId));
};

export const hasCachedShadowReadState = (
  topicId: string,
  userId = getResolvedUserId()
): boolean => {
  if (!topicId || !userId) {
    return false;
  }

  return shadowReadStateCache.has(getReadStateCacheKey(topicId, userId));
};

export const isShadowSyncEnabled = (): boolean => getShadowSyncEnabled();
