import type { IMessage } from '../components/interfaces/interfaces';
import { authedUser, getChatAuthSession } from '../composables/useAuth';

const DB_NAME = 'chat-sync-shadow-db';
const DB_VERSION = 2;
const EVENT_LOG_STORE = 'eventLog';
const TOPIC_SNAPSHOT_STORE = 'topicSnapshots';
const READ_STATE_STORE = 'readStates';
const SYNC_META_STORE = 'syncMeta';
const SHADOW_SYNC_FLAG_KEY = 'chat.shadowSync.enabled';
const MAX_EVENT_LOG_RECORDS_PER_USER = 300;

const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline',
  'timestamp',
  'receivedAt'
]);
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
const scheduledEventLogPrunes = new Set<string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

export type ShadowSyncSource = 'http' | 'ws' | 'local';

export type ShadowChatEventType =
  | 'bootstrap_history'
  | 'new_message'
  | 'edit_message'
  | 'delete_message'
  | 'pin_message'
  | 'reaction_updated'
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

const getTopicCacheKey = (topicId: string, userId: string) =>
  `${userId || 'anonymous'}:${topicId}`;

const getMetaKey = (key: string, userId: string) =>
  `${userId || 'anonymous'}:${key}`;

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

  return Array.from(mergedByKey.values()).sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  );
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
          resolve((request.result as ShadowChatEventRecord[] | undefined) || []);
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
): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(payload);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
): Promise<void> => {
  if (!getShadowSyncEnabled() || !topicId || !userId) {
    return;
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
    const mergedMessages = opts?.replace
      ? mergeMessages([], messages)
      : messages.length > 0
        ? mergeMessages(existing, messages)
        : existing;

    if (!mergedMessages.length) {
      const db = await openDb();

      if (!db) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(TOPIC_SNAPSHOT_STORE, 'readwrite');
        const store = tx.objectStore(TOPIC_SNAPSHOT_STORE);
        const request = store.delete(cacheKey);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      return;
    }

    const payload: ShadowTopicSnapshotRecord = {
      cacheKey,
      userId,
      topicId,
      messages: serializeValue(mergedMessages) as IMessage[],
      updatedAt: new Date().toISOString(),
      source
    };

    await putRecord(TOPIC_SNAPSHOT_STORE, payload);
  } catch (error) {
    console.warn('Failed to save shadow topic snapshot:', error);
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

  const lastReadMessage = [...messages]
    .filter(message => message.senderUserId !== userId && message.isReadByMe)
    .sort(
      (left, right) => getMessageTimestamp(right) - getMessageTimestamp(left)
    )[0];

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
    const existingItems =
      (await loadShadowSyncMeta<T[]>(key, userId)) || [];
    const nextItems = [...existingItems, value].slice(-(opts?.limit || 40));

    await saveShadowSyncMeta(key, nextItems, userId);
  } catch (error) {
    console.warn('Failed to append shadow sync meta list:', error);
  }
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
      sortRangeBoundary(left.fromCreatedAt) <= sortRangeBoundary(right.fromCreatedAt)
        ? left.fromMessageId
        : right.fromMessageId,
    toMessageId:
      sortRangeBoundary(left.toCreatedAt) >= sortRangeBoundary(right.toCreatedAt)
        ? left.toMessageId
        : right.toMessageId,
    fromCreatedAt: [left.fromCreatedAt, right.fromCreatedAt]
      .filter((value): value is string => !!value)
      .sort()[0] || null,
    toCreatedAt: [left.toCreatedAt, right.toCreatedAt]
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
  const timestamp = getMessageTimestamp(message);
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
): IMessage[] =>
  messages.filter(message => isMessageInRange(message, range));

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

  try {
    const record = await getRecord<ShadowSyncMetaRecord>(
      SYNC_META_STORE,
      cacheKey
    );
    const value =
      record?.value !== undefined
        ? (deserializeValue(record.value) as T)
        : null;

    shadowSyncMetaCache.set(cacheKey, value);

    return value;
  } catch (error) {
    console.warn('Failed to load shadow sync meta:', error);
    return null;
  }
};

export const saveShadowLoadedRange = async (
  topicId: string,
  messages: IMessage[],
  userId = getResolvedUserId()
): Promise<void> => {
  if (!topicId || !messages.length) {
    return;
  }

  const sortedMessages = [...messages].sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  );
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

  const existingRanges =
    (await loadShadowSyncMeta<ShadowLoadedRange[]>(
      `ranges:${topicId}`,
      userId
    )) || [];

  await saveShadowSyncMeta(
    `ranges:${topicId}`,
    mergeShadowLoadedRanges(existingRanges, nextRange),
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

  return (await loadShadowSyncMeta<ShadowLoadedRange[]>(
    `ranges:${topicId}`,
    userId
  )) || [];
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

  if (!Array.isArray(cachedValue)) {
    return cachedValue === null ? [] : undefined;
  }

  return cachedValue as ShadowLoadedRange[];
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
  const resolution = await resolveShadowTopicContext(topicId, messageId, opts, userId);
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

  const sortedMessages = [...messages].sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  );
  const targetMessage = sortedMessages.find(message => message.id === messageId);

  if (!targetMessage) {
    return {
      status: 'cursor_missing',
      messages: []
    };
  }

  const containingRange = getContainingRange(targetMessage, ranges);
  const rangeMessages = containingRange
    ? getMessagesForRange(sortedMessages, containingRange)
    : sortedMessages;
  const cursorIndex = rangeMessages.findIndex(message => message.id === messageId);

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

    return record?.messages
      ? mergeMessages([], deserializeValue(record.messages) as IMessage[])
      : [];
  } catch (error) {
    console.warn('Failed to load shadow topic snapshot:', error);
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
  const sortedMessages = [...messages].sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  );

  if (opts?.lastMessageId) {
    const cursorMessage = sortedMessages.find(message => message.id === opts.lastMessageId);

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
      const snapshotCursorIndex = sortedMessages.findIndex(
        message => message.id === opts.lastMessageId
      );
      const snapshotPage =
        snapshotCursorIndex > 0
          ? sortedMessages.slice(
              Math.max(0, snapshotCursorIndex - limit),
              snapshotCursorIndex
            )
          : [];

      if (snapshotPage.length > 0) {
        return {
          status: 'cache_hit',
          messages: snapshotPage
        };
      }

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
      const snapshotCursorIndex = sortedMessages.findIndex(
        message => message.id === opts.afterMessageId
      );
      const snapshotPage =
        snapshotCursorIndex >= 0 && snapshotCursorIndex < sortedMessages.length - 1
          ? sortedMessages.slice(
              snapshotCursorIndex + 1,
              snapshotCursorIndex + 1 + limit
            )
          : [];

      if (snapshotPage.length > 0) {
        return {
          status: 'cache_hit',
          messages: snapshotPage
        };
      }

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

  const latestRange = [...ranges].sort((left, right) =>
    (left.toCreatedAt || '').localeCompare(right.toCreatedAt || '')
  ).at(-1);

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
    shadowReadStateCache.set(getReadStateCacheKey(topicId, userId), readState);

    return readState;
  } catch (error) {
    console.warn('Failed to load shadow read state:', error);
    return null;
  }
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

    const payload: ShadowTopicSnapshotRecord = {
      cacheKey,
      userId,
      topicId,
      messages: serializeValue(filteredMessages) as IMessage[],
      updatedAt: new Date().toISOString(),
      source: 'local'
    };

    await putRecord(TOPIC_SNAPSHOT_STORE, payload);
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
