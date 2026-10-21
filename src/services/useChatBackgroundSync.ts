import { Capacitor, registerPlugin } from '@capacitor/core';
import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { getIdForRouteType } from '../composables/navigation/useUrlRouting';
import { getIsTopicNearBottom } from './useTopicViewportState';
import { getConfig } from './useConfig';
import { getChatAuthSession } from '../utils/stored-chat-session';

export interface ChatBackgroundSyncSession {
  token: string;
  userId?: string;
  apiUrl: string;
  authSource?: string;
  erpUrl?: string;
}

export interface ChatBackgroundSyncRequest {
  reason: string;
  topicId?: string;
  pts?: string;
  toPts?: string;
  eventId?: string;
}

export interface ChatBackgroundSyncStatus {
  state?: string;
  reason?: string;
  topicId?: string;
  pts?: string;
  eventId?: string;
  updatedAt?: string;
  error?: string;
  retryable?: boolean;
  topicCount?: number;
  messageTopicCount?: number;
  eventCount?: number;
}

export interface ChatBackgroundSyncEvent {
  eventId: string;
  pts: string;
  topicId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface ChatBackgroundSyncSnapshot {
  available?: boolean;
  userId?: string;
  snapshotUserId?: string;
  snapshotApiUrl?: string;
  lastPts?: string;
  fromPts?: string;
  toPts?: string;
  events?: ChatBackgroundSyncEvent[];
  topics?: ITopic[];
  messagesByTopic?: Record<string, IMessage[]>;
  status?: ChatBackgroundSyncStatus;
  updatedAt?: string;
}

export interface ChatBackgroundSnapshotImportOptions {
  source?: string;
  provider?: 'native' | 'web' | 'background';
  maxAgeMs?: number;
  requireNewerThanLocalPts?: boolean;
  skipMessageTopicIds?: string[];
  prioritizeMessageTopicIds?: string[];
  maxMessageTopicImports?: number;
  maxMessagesPerTopic?: number;
  requireRenderableContent?: boolean;
}

export type NativeChatBackgroundSyncSession = ChatBackgroundSyncSession;
export type NativeChatBackgroundSyncRequest = ChatBackgroundSyncRequest;
export type NativeChatBackgroundSyncStatus = ChatBackgroundSyncStatus;
export type NativeChatBackgroundSyncSnapshot = ChatBackgroundSyncSnapshot;

interface ChatBackgroundSyncPlugin {
  saveSession(options: NativeChatBackgroundSyncSession): Promise<{
    saved?: boolean;
    status?: NativeChatBackgroundSyncStatus;
  }>;
  syncAuthSession(options: NativeChatBackgroundSyncSession): Promise<{
    saved?: boolean;
    status?: NativeChatBackgroundSyncStatus;
  }>;
  clearSession(): Promise<{
    cleared?: boolean;
    status?: NativeChatBackgroundSyncStatus;
  }>;
  getSnapshot(): Promise<NativeChatBackgroundSyncSnapshot>;
  requestSync(options: NativeChatBackgroundSyncRequest): Promise<{
    scheduled?: boolean;
    status?: NativeChatBackgroundSyncStatus;
  }>;
  getStatus(): Promise<NativeChatBackgroundSyncStatus>;
}

const ChatBackgroundSync =
  registerPlugin<ChatBackgroundSyncPlugin>('ChatBackgroundSync');

const isAndroidNative = (): boolean => Capacitor.getPlatform() === 'android';

const isBrowserWebRuntime = (): boolean =>
  typeof window !== 'undefined' && !Capacitor.isNativePlatform();

const normalizePts = (value?: string | null): string =>
  String(value || '').trim();

const comparePts = (left?: string | null, right?: string | null): number => {
  const normalizedLeft = normalizePts(left);
  const normalizedRight = normalizePts(right);

  if (!normalizedLeft && !normalizedRight) {
    return 0;
  }

  if (!normalizedLeft) {
    return -1;
  }

  if (!normalizedRight) {
    return 1;
  }

  const leftNumber = Number(normalizedLeft);
  const rightNumber = Number(normalizedRight);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }

  return normalizedLeft.localeCompare(normalizedRight);
};

const getSnapshotPts = (snapshot: ChatBackgroundSyncSnapshot): string =>
  normalizePts(snapshot.lastPts || snapshot.toPts || snapshot.status?.pts);

export const hasUsableChatBackgroundSnapshot = (
  snapshot?: ChatBackgroundSyncSnapshot | null
): boolean =>
  !!snapshot?.available &&
  ((Array.isArray(snapshot.topics) && snapshot.topics.length > 0) ||
    (Array.isArray(snapshot.events) && snapshot.events.length > 0) ||
    (!!snapshot.messagesByTopic &&
      Object.values(snapshot.messagesByTopic).some(messages =>
        Array.isArray(messages)
      )));

export const importChatBackgroundSnapshot = async (
  snapshot: ChatBackgroundSyncSnapshot,
  userId?: string,
  opts?: ChatBackgroundSnapshotImportOptions
): Promise<boolean> => {
  const provider = opts?.provider || 'background';

  if (!hasUsableChatBackgroundSnapshot(snapshot)) {
    return false;
  }

  if (opts?.maxAgeMs && snapshot.updatedAt) {
    const updatedAtMs = new Date(snapshot.updatedAt).getTime();

    if (
      !Number.isFinite(updatedAtMs) ||
      Date.now() - updatedAtMs > opts.maxAgeMs
    ) {
      console.info('[ChatBackgroundSync] Снимок пропущен как устаревший', {
        provider,
        source: opts.source,
        updatedAt: snapshot.updatedAt,
        maxAgeMs: opts.maxAgeMs
      });
      return false;
    }
  }

  if (snapshot.userId && userId && snapshot.userId !== userId) {
    console.warn('[ChatBackgroundSync] Пользователь снимка не совпадает', {
      provider,
      snapshotUserId: snapshot.userId,
      userId
    });
    return false;
  }

  const resolvedUserId = userId || snapshot.userId;
  const [topicsApi, messagesApi, topicMessagesCacheApi, shadowApi] =
    await Promise.all([
      import('../composables/useTopics'),
      import('./useMessages'),
      import('./useTopicMessagesCache'),
      import('./useShadowChatSync')
    ]);
  if (opts?.requireNewerThanLocalPts) {
    const snapshotPts = getSnapshotPts(snapshot);
    const localPtsMeta = await shadowApi.loadShadowSyncMeta<{
      pts?: string | null;
    }>('pts:last', resolvedUserId);
    const localPts = normalizePts(localPtsMeta?.pts);

    if (!snapshotPts || comparePts(snapshotPts, localPts) <= 0) {
      console.info('[ChatBackgroundSync] Снимок пропущен без нового PTS', {
        provider,
        source: opts.source,
        snapshotPts,
        localPts
      });
      return false;
    }
  }

  const topics = Array.isArray(snapshot.topics) ? snapshot.topics : [];
  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const messagesByTopic = snapshot.messagesByTopic || {};
  const skippedMessageTopicIds = new Set(opts?.skipMessageTopicIds || []);
  const priorityMessageTopicIds = new Map(
    (opts?.prioritizeMessageTopicIds || []).map((topicId, index) => [
      topicId,
      index
    ])
  );
  const messageEntries = Object.entries(messagesByTopic)
    .filter(
      ([topicId, messages]) =>
        topicId &&
        !skippedMessageTopicIds.has(topicId) &&
        Array.isArray(messages) &&
        messages.length > 0
    )
    .sort(([leftTopicId], [rightTopicId]) => {
      const leftPriority = priorityMessageTopicIds.get(leftTopicId);
      const rightPriority = priorityMessageTopicIds.get(rightTopicId);

      if (leftPriority === undefined && rightPriority === undefined) {
        return 0;
      }

      if (leftPriority === undefined) {
        return 1;
      }

      if (rightPriority === undefined) {
        return -1;
      }

      return leftPriority - rightPriority;
    })
    .slice(
      0,
      opts?.maxMessageTopicImports === undefined
        ? undefined
        : Math.max(0, opts.maxMessageTopicImports)
    );

  if (
    opts?.requireRenderableContent &&
    topics.length === 0 &&
    messageEntries.length === 0
  ) {
    console.info(
      '[ChatBackgroundSync] Снимок пропущен без данных для отображения',
      {
        provider,
        source: opts.source
      }
    );
    return false;
  }

  if (topics.length > 0) {
    topicsApi.applyNativeTopicSnapshot(
      topics,
      resolvedUserId,
      snapshot.updatedAt
    );
  }

  // Фоновый снимок содержит события удаления даже для неоткрытых топиков.
  // Сначала применяем их, чтобы история из этого же снимка не вернула сообщения.
  for (const event of events) {
    if (event.eventType !== 'message.delete') continue;
    const payload = event.payload;
    if (
      payload.scope === 'SELF' &&
      payload.targetUserId &&
      payload.targetUserId !== resolvedUserId
    )
      continue;
    const data = payload.data as { id?: string; topicId?: string } | undefined;
    const topicId = data?.topicId || event.topicId;
    const messageId = data?.id || (payload.messageId as string | undefined);
    if (!topicId || !messageId) continue;
    await messagesApi.deleteMessageFromLocal(
      topicId,
      messageId,
      resolvedUserId,
      { source: provider, eventId: event.eventId, pts: event.pts }
    );
  }

  for (const [topicId, messages] of messageEntries) {
    await messagesApi.rememberPersistedDeletedMessageIds(
      topicId,
      resolvedUserId
    );
    const limitedMessages =
      opts?.maxMessagesPerTopic && opts.maxMessagesPerTopic > 0
        ? messages.slice(-opts.maxMessagesPerTopic)
        : messages;
    const activeTopicId =
      typeof window === 'undefined' ? null : getIdForRouteType().id;
    const isActiveTopic = activeTopicId === topicId;
    const hasVisibleMessages =
      messagesApi.getMessagesByTopicId(topicId).length > 0;
    const shouldUpdateVisibleMessages =
      !isActiveTopic || !hasVisibleMessages || getIsTopicNearBottom(topicId);

    messagesApi.mergeMessagesForTopic(topicId, limitedMessages, 'replace', {
      syncLastMessage: true,
      persistDelayMs: 0,
      updateVisible: shouldUpdateVisibleMessages
    });

    await Promise.allSettled([
      topicMessagesCacheApi.saveCachedTopicMessages(
        topicId,
        limitedMessages,
        resolvedUserId
      ),
      shadowApi.saveShadowTopicSnapshot(
        topicId,
        limitedMessages,
        'http',
        resolvedUserId,
        { replace: true }
      ),
      shadowApi.saveShadowLoadedRange(topicId, limitedMessages, resolvedUserId),
      shadowApi.syncShadowReadStateFromMessages(
        topicId,
        limitedMessages,
        'http',
        resolvedUserId
      )
    ]);
  }

  // Native экспортирует лишь часть событий. Общий курсор двигается при
  // полном replay по сокету, иначе пропущенные удаления больше не придут.

  if (events.length > 0) {
    await shadowApi.saveShadowSyncMeta(
      `${provider}_background_sync:last_events`,
      {
        fromPts: snapshot.fromPts,
        toPts: snapshot.toPts,
        events: events.slice(-100),
        timestamp: new Date().toISOString()
      },
      resolvedUserId
    );
  }

  await shadowApi.saveShadowSyncMeta(
    `${provider}_background_sync:last_imported`,
    {
      source: opts?.source || 'unknown',
      userId: resolvedUserId,
      topicCount: topics.length,
      messageTopicCount: Object.keys(messagesByTopic).length,
      eventCount: events.length,
      fromPts: snapshot.fromPts,
      toPts: snapshot.toPts,
      snapshotUpdatedAt: snapshot.updatedAt,
      status: snapshot.status,
      timestamp: new Date().toISOString()
    },
    resolvedUserId
  );
  console.info(`[ChatBackgroundSync] ${provider} снимок импортирован`, {
    source: opts?.source,
    topicCount: topics.length,
    messageTopicCount: Object.keys(messagesByTopic).length,
    eventCount: events.length
  });

  return true;
};

export const saveNativeChatBackgroundSyncSession = async (
  session: NativeChatBackgroundSyncSession
): Promise<void> => {
  if (!isAndroidNative() || !session.token || !session.apiUrl) {
    return;
  }

  try {
    await ChatBackgroundSync.saveSession({
      ...session,
      authSource: getChatAuthSession()?.source || 'unknown_shared',
      erpUrl: getConfig().CHAT_ERP_URL || ''
    });
    console.info('[ChatBackgroundSync] native-сессия сохранена', {
      userId: session.userId
    });
  } catch (error) {
    console.warn(
      '[ChatBackgroundSync] Не удалось сохранить native-сессию:',
      error
    );
  }
};

export const clearNativeChatBackgroundSyncSession = async (): Promise<void> => {
  if (!isAndroidNative()) {
    return;
  }

  try {
    await ChatBackgroundSync.clearSession();
    console.info('[ChatBackgroundSync] native-сессия очищена');
  } catch (error) {
    console.warn(
      '[ChatBackgroundSync] Не удалось очистить native-сессию:',
      error
    );
  }
};

export const requestNativeChatBackgroundSync = async (
  request: NativeChatBackgroundSyncRequest
): Promise<void> => {
  if (!isAndroidNative()) {
    return;
  }

  try {
    await ChatBackgroundSync.requestSync(request);
    const { saveShadowSyncMeta } = await import('./useShadowChatSync');
    void saveShadowSyncMeta('native_background_sync:last_scheduled', {
      ...request,
      timestamp: new Date().toISOString()
    });
    console.info('[ChatBackgroundSync] Синхронизация запланирована', request);
  } catch (error) {
    console.warn('[ChatBackgroundSync] Не удалось запланировать sync:', error);
  }
};

export const getNativeChatBackgroundSyncStatus =
  async (): Promise<NativeChatBackgroundSyncStatus | null> => {
    if (!isAndroidNative()) {
      return null;
    }

    try {
      return await ChatBackgroundSync.getStatus();
    } catch (error) {
      console.warn('[ChatBackgroundSync] Не удалось прочитать статус:', error);
      return null;
    }
  };

export const importNativeChatBackgroundSnapshot = async (
  userId?: string,
  opts?: ChatBackgroundSnapshotImportOptions
): Promise<boolean> => {
  if (!isAndroidNative()) {
    return false;
  }

  try {
    const snapshot = await ChatBackgroundSync.getSnapshot();

    return await importChatBackgroundSnapshot(snapshot, userId, {
      ...opts,
      provider: 'native'
    });
  } catch (error) {
    console.warn(
      '[ChatBackgroundSync] Не удалось импортировать native-снимок:',
      error
    );
    return false;
  }
};

export const loadNativeNotificationPreview = async (
  topicId: string,
  messageId: string,
  userId: string,
  apiUrl: string
): Promise<IMessage[]> => {
  if (!isAndroidNative() || !userId) return [];
  try {
    const snapshot = await ChatBackgroundSync.getSnapshot();
    if (
      !snapshot.available ||
      snapshot.snapshotUserId !== userId ||
      snapshot.snapshotApiUrl !== apiUrl.replace(/\/+$/, '') ||
      !snapshot.updatedAt
    )
      return [];
    const age = Date.now() - new Date(snapshot.updatedAt).getTime();
    if (!Number.isFinite(age) || age > 12 * 60 * 60 * 1000) return [];
    const messages = snapshot.messagesByTopic?.[topicId] || [];
    return messages.some(message => message.id === messageId) ? messages : [];
  } catch (error) {
    console.warn('Не удалось прочитать фоновый кеш уведомления:', error);
    return [];
  }
};

export const saveAnyChatBackgroundSyncSession = async (
  session: ChatBackgroundSyncSession
): Promise<void> => {
  await saveNativeChatBackgroundSyncSession(session);

  if (!isBrowserWebRuntime()) {
    return;
  }

  const { saveWebChatBackgroundSyncSession } = await import(
    './useWebChatBackgroundSync'
  );
  await saveWebChatBackgroundSyncSession(session);
};

export const clearAnyChatBackgroundSyncSession = async (): Promise<void> => {
  await clearNativeChatBackgroundSyncSession();

  if (!isBrowserWebRuntime()) {
    return;
  }

  const { clearWebChatBackgroundSyncSession } = await import(
    './useWebChatBackgroundSync'
  );
  await clearWebChatBackgroundSyncSession();
};

export const requestAnyChatBackgroundSync = async (
  request: ChatBackgroundSyncRequest
): Promise<void> => {
  await requestNativeChatBackgroundSync(request);

  if (!isBrowserWebRuntime()) {
    return;
  }

  const { requestWebChatBackgroundSync } = await import(
    './useWebChatBackgroundSync'
  );
  await requestWebChatBackgroundSync(request);
};

export const importAnyChatBackgroundSnapshot = async (
  userId?: string,
  opts?: ChatBackgroundSnapshotImportOptions
): Promise<boolean> => {
  let imported = false;

  if (isAndroidNative()) {
    imported = await importNativeChatBackgroundSnapshot(userId, opts);
  }

  if (isBrowserWebRuntime()) {
    const { importWebChatBackgroundSnapshot } = await import(
      './useWebChatBackgroundSync'
    );
    imported =
      (await importWebChatBackgroundSnapshot(userId, opts)) || imported;
  }

  return imported;
};
