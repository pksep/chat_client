import { Capacitor } from '@capacitor/core';
import { withNetworkTimeout } from '../utils/network-timeout';
import { collectTopicPages } from '../utils/topic-pagination';
import type {
  ChatBackgroundSnapshotImportOptions,
  ChatBackgroundSyncRequest,
  ChatBackgroundSyncSession,
  ChatBackgroundSyncSnapshot,
  ChatBackgroundSyncStatus
} from './useChatBackgroundSync';
import { importChatBackgroundSnapshot } from './useChatBackgroundSync';

const DB_NAME = 'chat-web-background-sync-db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const SESSION_KEY = 'session';
const SNAPSHOT_KEY = 'snapshot';
const STATUS_KEY = 'status';
const PENDING_HINTS_KEY = 'pendingHints';
const DEFAULT_MAX_MESSAGE_TOPICS = 2;
const TARGETED_MAX_MESSAGE_TOPICS = 4;
const FOREGROUND_MAX_MESSAGE_TOPICS = 1;
const DEFAULT_MESSAGE_LIMIT = 20;
const TARGETED_MESSAGE_LIMIT = 30;
const FOREGROUND_MESSAGE_LIMIT = 20;
const DEFAULT_SYNC_EVENTS_LIMIT = 150;
const TARGETED_SYNC_EVENTS_LIMIT = 300;
const FOREGROUND_SYNC_EVENTS_LIMIT = 75;
const SYNC_TAG = 'chat-background-sync';
let sessionRevision = 0;
let sessionUpdate = Promise.resolve();

const updateSession = (operation: () => Promise<void>): Promise<void> => {
  const pending = sessionUpdate.then(operation);
  sessionUpdate = pending.catch(() => {});
  return pending;
};

type WebSyncRecord<T> = {
  key: string;
  value: T;
};

type WebSyncSession = ChatBackgroundSyncSession & {
  expiresAt?: string;
  tokenType?: 'chat_sync';
  updatedAt?: string;
};

class WebChatBackgroundSyncHttpError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`HTTP ${status}${body ? `: ${body}` : ''}`);
    this.status = status;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const isWebRuntime = (): boolean =>
  typeof window !== 'undefined' &&
  typeof indexedDB !== 'undefined' &&
  !Capacitor.isNativePlatform();

const nowIso = (): string => new Date().toISOString();

const normalizeApiUrl = (apiUrl: string): string => {
  let normalized = (apiUrl || '').trim();

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const openDb = (): Promise<IDBDatabase | null> => {
  if (!isWebRuntime()) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getValue = async <T>(key: string): Promise<T | null> => {
  const db = await openDb();

  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);

    request.onsuccess = () =>
      resolve((request.result as WebSyncRecord<T> | undefined)?.value ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const setValue = async <T>(key: string, value: T): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ key, value } satisfies WebSyncRecord<T>);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const deleteValue = async (key: string): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const setStatus = async (status: ChatBackgroundSyncStatus): Promise<void> => {
  await setValue(STATUS_KEY, {
    ...status,
    updatedAt: status.updatedAt || nowIso()
  });
};

const saveWebSyncMeta = async (
  key: string,
  payload: Record<string, unknown>,
  userId?: string
): Promise<void> => {
  try {
    const { saveShadowSyncMeta } = await import('./useShadowChatSync');
    await saveShadowSyncMeta(key, payload, userId);
  } catch (error) {
    console.warn(
      '[WebChatBackgroundSync] Не удалось сохранить shadow meta:',
      error
    );
  }
};

const getSession = async (): Promise<WebSyncSession | null> =>
  getValue<WebSyncSession>(SESSION_KEY);

const getStoredSnapshot =
  async (): Promise<ChatBackgroundSyncSnapshot | null> =>
    getValue<ChatBackgroundSyncSnapshot>(SNAPSHOT_KEY);

const getLastPts = async (): Promise<string> => {
  const snapshot = await getStoredSnapshot();

  return snapshot?.lastPts || snapshot?.toPts || '';
};

const chooseMaxPts = (currentPts?: string, incomingPts?: string): string => {
  if (!incomingPts?.trim()) {
    return currentPts?.trim() || '';
  }

  if (!currentPts?.trim()) {
    return incomingPts.trim();
  }

  const current = Number(currentPts);
  const incoming = Number(incomingPts);

  if (Number.isFinite(current) && Number.isFinite(incoming)) {
    return incoming > current ? incomingPts.trim() : currentPts.trim();
  }

  return incomingPts.trim();
};

const fetchJson = async (
  session: WebSyncSession,
  path: string
): Promise<unknown> => {
  const { response, body } = await withNetworkTimeout(async signal => {
    const response = await fetch(`${session.apiUrl}${path}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`
      },
      signal
    });
    return { response, body: await response.text() };
  }, 10000);

  if (!response.ok) {
    throw new WebChatBackgroundSyncHttpError(response.status, body);
  }

  if (!body.trim()) {
    return null;
  }

  return JSON.parse(body);
};

const requestScopedSyncToken = async (
  session: ChatBackgroundSyncSession
): Promise<{ syncToken: string; expiresAt?: string } | null> => {
  const { response, body } = await withNetworkTimeout(async signal => {
    const response = await fetch(
      `${normalizeApiUrl(session.apiUrl)}/sync/token`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.token}`
        },
        signal
      }
    );
    return { response, body: await response.text() };
  });

  if (!response.ok) {
    throw new WebChatBackgroundSyncHttpError(response.status, body);
  }

  const payload = body.trim()
    ? (JSON.parse(body) as {
        syncToken?: string;
        token?: string;
        expiresAt?: string;
      })
    : {};
  const syncToken = payload.syncToken || payload.token || '';

  return syncToken
    ? {
        syncToken,
        expiresAt: payload.expiresAt
      }
    : null;
};

const asArray = <T = unknown>(payload: unknown): T[] => {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { data?: unknown }).data)
  ) {
    return (payload as { data: T[] }).data;
  }

  return [];
};

const isForegroundReason = (reason?: string): boolean =>
  [
    'initialize-chat',
    'app-visible',
    'window-focus',
    'browser-online',
    'native-app-active',
    'native-resume'
  ].includes((reason || '').trim());

const getMaxMessageTopics = (request: ChatBackgroundSyncRequest): number => {
  if (isForegroundReason(request.reason)) {
    return FOREGROUND_MAX_MESSAGE_TOPICS;
  }

  if (request.topicId) {
    return TARGETED_MAX_MESSAGE_TOPICS;
  }

  return DEFAULT_MAX_MESSAGE_TOPICS;
};

const getMessageLimit = (request: ChatBackgroundSyncRequest): number => {
  if (isForegroundReason(request.reason)) {
    return FOREGROUND_MESSAGE_LIMIT;
  }

  if (request.topicId) {
    return TARGETED_MESSAGE_LIMIT;
  }

  return DEFAULT_MESSAGE_LIMIT;
};

const getSyncEventsLimit = (request: ChatBackgroundSyncRequest): number => {
  if (isForegroundReason(request.reason)) {
    return FOREGROUND_SYNC_EVENTS_LIMIT;
  }

  if (request.topicId) {
    return TARGETED_SYNC_EVENTS_LIMIT;
  }

  return DEFAULT_SYNC_EVENTS_LIMIT;
};

const shouldIncludeRecentTopicFallback = (
  request: ChatBackgroundSyncRequest
): boolean => !!request.topicId;

const fetchPtsDelta = async (
  session: WebSyncSession,
  lastPts: string,
  limit: number
): Promise<Partial<ChatBackgroundSyncSnapshot> | null> => {
  const query = lastPts ? `?from=${encodeURIComponent(lastPts)}` : '';
  const separator = query ? '&' : '?';

  try {
    const payload = await fetchJson(
      session,
      `/sync/pts${query}${separator}limit=${Math.max(1, limit)}`
    );

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const data = payload as ChatBackgroundSyncSnapshot;

    return {
      fromPts: data.fromPts || lastPts || undefined,
      toPts: data.toPts || data.lastPts || undefined,
      lastPts: data.lastPts || data.toPts || undefined,
      events: Array.isArray(data.events) ? data.events : [],
      topics: Array.isArray(data.topics) ? data.topics : [],
      messagesByTopic: data.messagesByTopic || {}
    };
  } catch (error) {
    if (error instanceof WebChatBackgroundSyncHttpError && error.isNotFound) {
      return null;
    }

    throw error;
  }
};

const resolveTopicId = (topic: Record<string, unknown>): string =>
  String(topic.id || topic.topicId || '').trim();

const resolvePriorityTopicIds = (
  request: ChatBackgroundSyncRequest,
  delta: Partial<ChatBackgroundSyncSnapshot> | null,
  topics: Record<string, unknown>[],
  maxMessageTopics: number,
  includeRecentTopicFallback: boolean
): string[] => {
  const topicIds = new Set<string>();
  const recentTopicIds: string[] = [];

  if (request.topicId) {
    topicIds.add(request.topicId);
  }

  if (Array.isArray(delta?.events)) {
    for (const event of delta.events) {
      if (event.topicId) {
        topicIds.add(event.topicId);
      }

      if (topicIds.size >= maxMessageTopics) {
        return Array.from(topicIds).slice(0, maxMessageTopics);
      }
    }
  }

  for (const topic of topics) {
    const topicId = resolveTopicId(topic);

    if (!topicId) {
      continue;
    }

    if (
      Number(topic.unreadMessageCount || 0) > 0 ||
      topic.taggedMe === true ||
      topic.hasUnreadReaction === true
    ) {
      topicIds.add(topicId);
    } else if (includeRecentTopicFallback && topic.lastMessage) {
      recentTopicIds.push(topicId);
    }

    if (topicIds.size >= maxMessageTopics) {
      return Array.from(topicIds).slice(0, maxMessageTopics);
    }
  }

  for (const topicId of recentTopicIds) {
    topicIds.add(topicId);

    if (topicIds.size >= maxMessageTopics) {
      break;
    }
  }

  return Array.from(topicIds).slice(0, maxMessageTopics);
};

const fetchLatestMessagesByTopic = async (
  session: WebSyncSession,
  topicIds: string[],
  limit: number
): Promise<Record<string, unknown[]>> => {
  const entries = await Promise.all(
    topicIds.map(async topicId => {
      try {
        const payload = await fetchJson(
          session,
          `/messages/topic/${encodeURIComponent(topicId)}?limit=${Math.max(1, limit)}&newMessages=true`
        );

        return [topicId, asArray(payload)] as const;
      } catch (error) {
        if (
          !(error instanceof WebChatBackgroundSyncHttpError) ||
          error.isAuthError ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500
        ) {
          // Сетевой сбой истории не означает, что она пуста и синхронизация завершена.
          throw error;
        }

        console.warn(
          '[WebChatBackgroundSync] Не удалось загрузить сообщения топика:',
          topicId,
          error
        );
        return [topicId, []] as const;
      }
    })
  );

  return Object.fromEntries(
    entries.filter(([, messages]) => messages.length > 0)
  );
};

const runDirectWebChatBackgroundSync = async (
  request: ChatBackgroundSyncRequest
): Promise<ChatBackgroundSyncSnapshot | null> => {
  const session = await getSession();

  if (!session?.token || !session.apiUrl) {
    await setStatus({
      state: 'failed',
      reason: request.reason,
      topicId: request.topicId,
      pts: request.pts,
      eventId: request.eventId,
      error: 'Web-сессия синхронизации чата отсутствует',
      retryable: false
    });
    return null;
  }

  await setStatus({
    state: 'started',
    reason: request.reason,
    topicId: request.topicId,
    pts: request.pts,
    eventId: request.eventId
  });
  console.info(
    '[WebChatBackgroundSync] Фоновая web-синхронизация началась',
    request
  );

  try {
    const lastPts = await getLastPts();
    const delta = await fetchPtsDelta(
      session,
      lastPts,
      getSyncEventsLimit(request)
    );
    const topics = await collectTopicPages(async (page, limit) => {
      const payload = await fetchJson(
        session,
        `/topics?page=${page}&limit=${limit}&scope=sidebar`
      );
      return {
        ...(payload as object),
        data: asArray<{ id: string } & Record<string, unknown>>(payload)
      };
    });
    const topicIds = resolvePriorityTopicIds(
      request,
      delta,
      topics,
      getMaxMessageTopics(request),
      shouldIncludeRecentTopicFallback(request)
    );
    const messagesByTopic = await fetchLatestMessagesByTopic(
      session,
      topicIds,
      getMessageLimit(request)
    );
    const nextPts = chooseMaxPts(
      chooseMaxPts(lastPts, request.pts),
      delta?.toPts || delta?.lastPts
    );
    const status: ChatBackgroundSyncStatus = {
      state: 'completed',
      reason: request.reason,
      topicId: request.topicId,
      pts: request.pts,
      eventId: request.eventId,
      topicCount: topics.length,
      messageTopicCount: Object.keys(messagesByTopic).length,
      eventCount: delta?.events?.length || 0,
      updatedAt: nowIso()
    };
    const snapshot: ChatBackgroundSyncSnapshot = {
      available: true,
      userId: session.userId,
      lastPts: nextPts || undefined,
      fromPts: delta?.fromPts,
      toPts: delta?.toPts || nextPts || undefined,
      events: delta?.events || [],
      topics: (delta?.topics?.length ? delta.topics : topics) as any,
      messagesByTopic: {
        ...(delta?.messagesByTopic || {}),
        ...(messagesByTopic as any)
      },
      status,
      updatedAt: nowIso()
    };

    await setValue(SNAPSHOT_KEY, snapshot);
    await setStatus(status);
    await saveWebSyncMeta(
      'web_background_sync:last_direct_sync',
      {
        reason: request.reason,
        topicId: request.topicId,
        pts: request.pts,
        eventId: request.eventId,
        topicCount: topics.length,
        messageTopicCount: Object.keys(messagesByTopic).length,
        eventCount: delta?.events?.length || 0,
        timestamp: nowIso()
      },
      session.userId
    );
    console.info(
      '[WebChatBackgroundSync] Фоновая web-синхронизация завершена',
      {
        topicCount: topics.length,
        messageTopicCount: Object.keys(messagesByTopic).length,
        eventCount: delta?.events?.length || 0
      }
    );

    return snapshot;
  } catch (error) {
    const retryable =
      !(error instanceof WebChatBackgroundSyncHttpError) || !error.isAuthError;

    await setStatus({
      state: 'failed',
      reason: request.reason,
      topicId: request.topicId,
      pts: request.pts,
      eventId: request.eventId,
      error: error instanceof Error ? error.message : String(error),
      retryable
    });
    console.warn(
      '[WebChatBackgroundSync] Фоновая web-синхронизация не выполнена',
      error
    );
    return null;
  }
};

const getServiceWorkerRegistration =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    try {
      return (await navigator.serviceWorker.getRegistration()) || null;
    } catch {
      return null;
    }
  };

const postRequestToServiceWorker = async (
  request: ChatBackgroundSyncRequest
): Promise<boolean> => {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  const registration = await getServiceWorkerRegistration();
  const worker =
    navigator.serviceWorker.controller ||
    registration?.active ||
    registration?.waiting ||
    registration?.installing;

  if (!worker) {
    return false;
  }

  worker.postMessage({
    type: 'CHAT_BACKGROUND_SYNC_REQUEST',
    request
  });

  return true;
};

const registerOneOffSync = async (): Promise<void> => {
  const registration = await getServiceWorkerRegistration();
  const syncRegistration = registration as ServiceWorkerRegistration & {
    sync?: { register: (tag: string) => Promise<void> };
  };

  if (!syncRegistration?.sync?.register) {
    return;
  }

  try {
    await syncRegistration.sync.register(SYNC_TAG);
  } catch (error) {
    console.warn(
      '[WebChatBackgroundSync] Не удалось зарегистрировать sync:',
      error
    );
  }
};

export const saveWebChatBackgroundSyncSession = async (
  session: ChatBackgroundSyncSession
): Promise<void> => {
  if (!isWebRuntime() || !session.token || !session.apiUrl) {
    return;
  }

  const revision = ++sessionRevision;
  let scopedToken: { syncToken: string; expiresAt?: string } | null = null;

  try {
    scopedToken = await requestScopedSyncToken(session);
  } catch (error) {
    await updateSession(async () => {
      if (revision !== sessionRevision) return;
      await setStatus({
        state: 'failed',
        reason: 'session_saved',
        error:
          error instanceof Error
            ? error.message
            : 'Не удалось запросить ограниченный токен синхронизации',
        retryable:
          !(error instanceof WebChatBackgroundSyncHttpError) ||
          !error.isAuthError,
        updatedAt: nowIso()
      });
    });
    console.warn(
      '[WebChatBackgroundSync] Не удалось запросить ограниченный токен синхронизации:',
      error
    );
    return;
  }

  if (revision !== sessionRevision) return;
  if (!scopedToken?.syncToken) {
    await updateSession(async () => {
      if (revision !== sessionRevision) return;
      await setStatus({
        state: 'failed',
        reason: 'session_saved',
        error: 'Ограниченный токен синхронизации отсутствует',
        retryable: true,
        updatedAt: nowIso()
      });
    });
    return;
  }

  // Service worker хранит только ограниченный chat_sync токен, а не полный access token.
  const payload: WebSyncSession = {
    token: scopedToken.syncToken,
    tokenType: 'chat_sync',
    expiresAt: scopedToken.expiresAt,
    userId: session.userId,
    apiUrl: normalizeApiUrl(session.apiUrl),
    updatedAt: nowIso()
  };

  // HTTP выполняется параллельно запуску SDK, но старый ответ не должен
  // отменять последующий выход или заменять более новую сессию.
  await updateSession(async () => {
    if (revision !== sessionRevision) return;
    await setValue(SESSION_KEY, payload);
    await setStatus({
      state: 'session_saved',
      updatedAt: payload.updatedAt
    });
  });
  if (revision !== sessionRevision) return;
  await saveWebSyncMeta(
    'web_background_sync:session_saved',
    {
      userId: session.userId,
      apiUrl: payload.apiUrl,
      expiresAt: payload.expiresAt,
      timestamp: payload.updatedAt
    },
    session.userId
  );
  console.info('[WebChatBackgroundSync] Web-сессия синхронизации сохранена', {
    userId: session.userId
  });
};

export const clearWebChatBackgroundSyncSession = async (): Promise<void> => {
  if (!isWebRuntime()) {
    return;
  }

  ++sessionRevision;
  await updateSession(async () => {
    await Promise.all([
      deleteValue(SESSION_KEY),
      deleteValue(SNAPSHOT_KEY),
      deleteValue(STATUS_KEY),
      deleteValue(PENDING_HINTS_KEY)
    ]);
    await setStatus({
      state: 'session_cleared',
      updatedAt: nowIso()
    });
  });
};

export const getWebChatBackgroundSyncSnapshot =
  async (): Promise<ChatBackgroundSyncSnapshot> => {
    if (!isWebRuntime()) {
      return { available: false };
    }

    const [snapshot, status] = await Promise.all([
      getStoredSnapshot(),
      getValue<ChatBackgroundSyncStatus>(STATUS_KEY)
    ]);

    return {
      available: Boolean(snapshot?.available),
      ...(snapshot || {}),
      status: snapshot?.status || status || undefined
    };
  };

export const importWebChatBackgroundSnapshot = async (
  userId?: string,
  opts?: ChatBackgroundSnapshotImportOptions
): Promise<boolean> => {
  if (!isWebRuntime()) {
    return false;
  }

  const snapshot = await getWebChatBackgroundSyncSnapshot();
  const imported = await importChatBackgroundSnapshot(snapshot, userId, {
    ...opts,
    provider: 'web'
  });

  if (imported) {
    await saveWebSyncMeta(
      'web_background_sync:imported',
      {
        source: opts?.source || 'unknown',
        topicCount: snapshot.topics?.length || 0,
        messageTopicCount: Object.keys(snapshot.messagesByTopic || {}).length,
        eventCount: snapshot.events?.length || 0,
        timestamp: nowIso()
      },
      userId || snapshot.userId
    );
    console.info(
      '[WebChatBackgroundSync] Web-снимок синхронизации импортирован',
      {
        source: opts?.source
      }
    );
  }

  return imported;
};

export const requestWebChatBackgroundSync = async (
  request: ChatBackgroundSyncRequest
): Promise<void> => {
  if (!isWebRuntime()) {
    return;
  }

  await setStatus({
    state: 'scheduled',
    reason: request.reason,
    topicId: request.topicId,
    pts: request.pts,
    eventId: request.eventId,
    updatedAt: nowIso()
  });
  await saveWebSyncMeta('web_background_sync:scheduled', {
    ...request,
    timestamp: nowIso()
  });
  console.info(
    '[WebChatBackgroundSync] Фоновая web-синхронизация запланирована',
    request
  );

  const posted = await postRequestToServiceWorker(request);
  await registerOneOffSync();

  if (!posted) {
    const snapshot = await runDirectWebChatBackgroundSync(request);

    if (snapshot) {
      await importWebChatBackgroundSnapshot(snapshot.userId, {
        source: `direct-${request.reason || 'background'}`
      });
    }
  }
};
