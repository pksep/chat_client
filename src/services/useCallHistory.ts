import { reactive, ref } from 'vue';
import type { ITopic } from '../components/interfaces/interfaces';
import { getAuthUser } from '../composables/useAuth';
import { useTopics } from '../composables/useTopics';
import { getUserById } from '../composables/useUsers';
import type { ChatSDK } from './useChatSDK';
import {
  TopicType,
  type CallHistoryItem as ServerCallHistoryItem
} from './useChatSDK/types';
import { loadShadowSyncMeta, saveShadowSyncMeta } from './useShadowChatSync';
import {
  parseCallMessage,
  parseCallMessageEx
} from '../utils/parseCallMessage';

const CALL_HISTORY_CACHE_KEY = 'calls:history';
const CALL_HISTORY_PAGE_SIZE = 50;

type CallHistorySource = 'http' | 'ws';
type CallHistorySdk = Pick<ChatSDK, 'getCallHistory'> &
  Partial<Pick<ChatSDK, 'joinTopic'>>;

interface CallHistoryMessageLike {
  id: string;
  topicId: string;
  sourceTopicId?: string | null;
  callTopicId?: string | null;
  callTopicType?: 'GROUP' | 'DM' | null;
  roomId?: string | null;
  senderUserId: string;
  text?: string | null;
  ex?: unknown;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  deletedAt?: string | Date | null;
  isSystem?: boolean;
}

const rawCallHistory = ref<ServerCallHistoryItem[]>([]);
const callHistoryState = reactive({
  isCacheReady: false,
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,
  currentPage: 0,
  totalPages: 1,
  totalItems: 0,
  pageSize: CALL_HISTORY_PAGE_SIZE,
  errorMessage: ''
});

let hydratedUserId: string | null = null;
let bootstrappedUserId: string | null = null;
let bootstrapPromise: Promise<void> | null = null;
let loadMorePromise: Promise<void> | null = null;
let callHistorySdk: CallHistorySdk | null = null;
let shouldBootstrapWhenSdkReady = false;
const pendingUpserts = new Map<string, ServerCallHistoryItem>();
const pendingRemovals = new Set<string>();
const pendingCallTopics = new Map<
  string,
  { userId: string; sdk: CallHistorySdk | null }
>();

const resolveCallHistoryUserId = (): string => getAuthUser()?.id || '';

const resetRuntimeState = (): void => {
  pendingUpserts.clear();
  pendingRemovals.clear();
  pendingCallTopics.clear();
  bootstrapPromise = null;
  loadMorePromise = null;
  shouldBootstrapWhenSdkReady = false;
};

const syncUserScope = (): string => {
  const userId = resolveCallHistoryUserId();

  if (!userId) {
    rawCallHistory.value = [];
    callHistoryState.isCacheReady = false;
    callHistoryState.isLoading = false;
    callHistoryState.isLoadingMore = false;
    callHistoryState.hasMore = false;
    callHistoryState.currentPage = 0;
    callHistoryState.totalPages = 1;
    callHistoryState.totalItems = 0;
    callHistoryState.errorMessage = '';
    hydratedUserId = null;
    bootstrappedUserId = null;
    resetRuntimeState();
    return '';
  }

  if (hydratedUserId && hydratedUserId !== userId) {
    rawCallHistory.value = [];
    callHistoryState.isCacheReady = false;
    callHistoryState.isLoading = false;
    callHistoryState.isLoadingMore = false;
    callHistoryState.hasMore = false;
    callHistoryState.currentPage = 0;
    callHistoryState.totalPages = 1;
    callHistoryState.totalItems = 0;
    callHistoryState.errorMessage = '';
    hydratedUserId = null;
    bootstrappedUserId = null;
    resetRuntimeState();
  }

  return userId;
};

const sortCallHistoryItems = (
  items: ServerCallHistoryItem[]
): ServerCallHistoryItem[] =>
  [...items].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

const uniqCallHistoryItems = (
  items: ServerCallHistoryItem[]
): ServerCallHistoryItem[] => {
  const deduped = new Map<string, ServerCallHistoryItem>();

  items.forEach(item => {
    if (item?.id) {
      deduped.set(item.id, item);
    }
  });

  return sortCallHistoryItems(Array.from(deduped.values()));
};

const refreshMissingCallTopics = async (
  items: ServerCallHistoryItem[],
  userId: string,
  sdk: CallHistorySdk | null = callHistorySdk
): Promise<void> => {
  const isCurrent = () =>
    resolveCallHistoryUserId() === userId && callHistorySdk === sdk;
  if (!isCurrent()) return;

  const callTopicIds = [
    ...new Set(
      items
        .map(item => item.callTopicId)
        .filter((topicId): topicId is string => !!topicId)
    )
  ];

  if (!callTopicIds.length) {
    return;
  }

  const topicsApi = useTopics();
  const missingCallTopicIds = callTopicIds.filter(topicId => {
    const pending = pendingCallTopics.get(topicId);
    return (
      !topicsApi.getSelectedTopic(topicId) &&
      !(pending?.userId === userId && pending.sdk === sdk)
    );
  });

  if (!missingCallTopicIds.length) {
    return;
  }

  const scope = { userId, sdk };
  missingCallTopicIds.forEach(topicId => pendingCallTopics.set(topicId, scope));
  try {
    await topicsApi.fetchAllTopics();
    if (!isCurrent()) return;
    await Promise.all(
      missingCallTopicIds.map(topicId => sdk?.joinTopic?.(topicId))
    );
  } catch (error) {
    console.error('Failed to refresh call topics:', error);
  } finally {
    missingCallTopicIds.forEach(topicId => {
      if (pendingCallTopics.get(topicId) === scope)
        pendingCallTopics.delete(topicId);
    });
  }
};

const applyCallHistory = async (
  items: ServerCallHistoryItem[],
  userId: string,
  sdk?: CallHistorySdk | null
): Promise<void> => {
  rawCallHistory.value = uniqCallHistoryItems(items);
  // Имена и чаты звонков уточняются в фоне, не задерживая офлайн-кэш и страницы.
  void refreshMissingCallTopics(rawCallHistory.value, userId, sdk);
  await saveShadowSyncMeta(
    CALL_HISTORY_CACHE_KEY,
    rawCallHistory.value,
    userId
  );
};

const updateCallHistoryPagination = (meta?: {
  totalItems?: number;
  totalPages?: number;
  currentPage?: number;
}): void => {
  const loadedItemsCount = rawCallHistory.value.length;
  const totalItems = Math.max(
    0,
    Number(meta?.totalItems) || callHistoryState.totalItems || loadedItemsCount
  );
  const totalPages = Math.max(
    1,
    Number(meta?.totalPages) ||
      (totalItems > 0
        ? Math.ceil(totalItems / callHistoryState.pageSize)
        : callHistoryState.totalPages)
  );
  const currentPage = Math.min(
    totalPages,
    Math.max(
      loadedItemsCount > 0 ? 1 : 0,
      Number(meta?.currentPage) ||
        (loadedItemsCount > 0
          ? Math.ceil(loadedItemsCount / callHistoryState.pageSize)
          : 0)
    )
  );

  callHistoryState.totalItems = totalItems;
  callHistoryState.totalPages = totalPages;
  callHistoryState.currentPage = currentPage;
  callHistoryState.hasMore =
    currentPage < totalPages || loadedItemsCount < totalItems;
};

const mergePendingHistoryChanges = (
  items: ServerCallHistoryItem[]
): ServerCallHistoryItem[] => {
  let nextItems = uniqCallHistoryItems(items);

  pendingRemovals.forEach(messageId => {
    nextItems = nextItems.filter(item => item.id !== messageId);
  });

  pendingUpserts.forEach(item => {
    nextItems = uniqCallHistoryItems(
      nextItems.filter(existing => existing.id !== item.id).concat(item)
    );
  });

  return nextItems;
};

const resolveCallTopic = (topicId: string): ITopic | undefined =>
  useTopics().getSelectedTopic(topicId);

const buildCallHistoryItemFromMessage = (
  message: CallHistoryMessageLike
): ServerCallHistoryItem | null => {
  if (
    !message?.id ||
    !message.topicId ||
    !message.isSystem ||
    message.deletedAt
  ) {
    return null;
  }

  const parsedEx = parseCallMessageEx(message.ex);

  if (parsedEx?.type === 'call' && parsedEx.call?.event !== 'end') {
    return null;
  }

  const authUserId = getAuthUser()?.id || '';
  const parsedCall = parseCallMessage(message.text || '', {
    messageEx: message.ex,
    authUserId,
    isMeSender: message.senderUserId === authUserId
  });

  if (!parsedCall) {
    return null;
  }

  const topic = resolveCallTopic(message.topicId);
  const fallbackUser = getUserById(message.senderUserId);
  const topicType =
    topic?.type === TopicType.Group ? TopicType.Group : TopicType.DM;
  const topicName =
    topic?.name ||
    topic?.group?.title ||
    topic?.user?.initials ||
    fallbackUser?.initials ||
    'Звонок';
  const topicAvatarUrl =
    topic?.avatarUrl ||
    topic?.group?.avatarUrl ||
    topic?.user?.avatarUrl ||
    null;

  return {
    id: message.id,
    topicId: message.topicId,
    sourceTopicId: Object.prototype.hasOwnProperty.call(
      message,
      'sourceTopicId'
    )
      ? message.sourceTopicId || null
      : message.topicId,
    callTopicId: message.callTopicId || null,
    callTopicType: message.callTopicType || null,
    roomId: message.roomId || parsedEx?.call?.roomId || null,
    topicType,
    topicName,
    topicAvatarUrl,
    senderUserId: message.senderUserId,
    text: message.text || '',
    ex: message.ex ?? null,
    createdAt:
      message.createdAt || message.updatedAt || new Date().toISOString()
  };
};

const rememberPendingUpsert = (item: ServerCallHistoryItem): void => {
  pendingRemovals.delete(item.id);
  pendingUpserts.set(item.id, item);
};

const rememberPendingRemoval = (messageId: string): void => {
  pendingUpserts.delete(messageId);
  pendingRemovals.add(messageId);
};

export const hydrateCallHistoryCache = async (): Promise<void> => {
  const userId = syncUserScope();

  if (!userId) {
    return;
  }

  if (callHistoryState.isCacheReady && hydratedUserId === userId) {
    return;
  }

  const cachedItems =
    (await loadShadowSyncMeta<ServerCallHistoryItem[]>(
      CALL_HISTORY_CACHE_KEY,
      userId
    )) || [];

  rawCallHistory.value = uniqCallHistoryItems(cachedItems).slice(
    0,
    callHistoryState.pageSize
  );
  hydratedUserId = userId;
  callHistoryState.isCacheReady = true;
  updateCallHistoryPagination();
};

export const bootstrapCallHistory = async (
  sdk: CallHistorySdk | null = callHistorySdk,
  opts?: { force?: boolean }
): Promise<void> => {
  const userId = syncUserScope();

  if (!userId) {
    return;
  }

  await hydrateCallHistoryCache();
  callHistorySdk = sdk;

  if (!sdk) {
    shouldBootstrapWhenSdkReady = true;

    if (!rawCallHistory.value.length) {
      callHistoryState.errorMessage = 'Сервис чата ещё не инициализирован.';
    }
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (bootstrappedUserId === userId && !opts?.force) {
    return;
  }

  bootstrapPromise = (async () => {
    callHistoryState.isLoading = true;
    callHistoryState.isLoadingMore = false;
    callHistoryState.errorMessage = '';

    try {
      const response = await sdk.getCallHistory({
        page: 1,
        limit: callHistoryState.pageSize
      });
      const mergedCalls = mergePendingHistoryChanges(response.data);

      await applyCallHistory(mergedCalls, userId, sdk);
      updateCallHistoryPagination(response.meta);
      bootstrappedUserId = userId;
      shouldBootstrapWhenSdkReady = false;
      pendingRemovals.clear();
      pendingUpserts.clear();
    } catch (error) {
      console.error('Failed to bootstrap call history:', error);

      if (!rawCallHistory.value.length) {
        callHistoryState.errorMessage =
          'Не удалось загрузить историю звонков. Попробуйте позже.';
      }
    } finally {
      callHistoryState.isLoading = false;
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
};

export const loadMoreCallHistory = async (
  sdk: CallHistorySdk | null = callHistorySdk
): Promise<void> => {
  const userId = syncUserScope();

  if (!userId) {
    return;
  }

  await hydrateCallHistoryCache();
  callHistorySdk = sdk;

  if (!sdk) {
    if (!rawCallHistory.value.length) {
      callHistoryState.errorMessage =
        '\u0421\u0435\u0440\u0432\u0438\u0441 \u0447\u0430\u0442\u0430 \u0435\u0449\u0451 \u043d\u0435 \u0438\u043d\u0438\u0446\u0438\u0430\u043b\u0438\u0437\u0438\u0440\u043e\u0432\u0430\u043d.';
    }
    return;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  if (loadMorePromise || !callHistoryState.hasMore) {
    return loadMorePromise || Promise.resolve();
  }

  const nextPage = Math.max(2, callHistoryState.currentPage + 1);

  loadMorePromise = (async () => {
    callHistoryState.isLoading = true;
    callHistoryState.isLoadingMore = true;
    callHistoryState.errorMessage = '';

    try {
      const response = await sdk.getCallHistory({
        page: nextPage,
        limit: callHistoryState.pageSize
      });
      const mergedCalls = mergePendingHistoryChanges(
        rawCallHistory.value.concat(response.data)
      );

      await applyCallHistory(mergedCalls, userId, sdk);
      updateCallHistoryPagination(response.meta);
      bootstrappedUserId = userId;
      shouldBootstrapWhenSdkReady = false;
      pendingRemovals.clear();
      pendingUpserts.clear();
    } catch (error) {
      console.error('Failed to load more call history:', error);
      callHistoryState.errorMessage =
        '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0435\u0449\u0451 \u0437\u0432\u043e\u043d\u043a\u0438.';
    } finally {
      callHistoryState.isLoadingMore = false;
      callHistoryState.isLoading = false;
      loadMorePromise = null;
    }
  })();

  return loadMorePromise;
};

export const initializeCallHistorySync = (sdk: CallHistorySdk | null): void => {
  callHistorySdk = sdk;
  void hydrateCallHistoryCache();

  if (sdk && shouldBootstrapWhenSdkReady) {
    void bootstrapCallHistory(sdk);
  }
};

export const shouldRefreshCallHistoryAfterReconnect = (): boolean => {
  const userId = syncUserScope();

  return !!userId && bootstrappedUserId === userId;
};

export const upsertCallHistoryMessage = async (
  message: CallHistoryMessageLike,
  source: CallHistorySource = 'ws'
): Promise<void> => {
  const userId = syncUserScope();

  if (!userId) {
    return;
  }

  await hydrateCallHistoryCache();

  const nextItem = buildCallHistoryItemFromMessage(message);

  if (!nextItem) {
    return;
  }

  if (callHistoryState.isLoading && source === 'ws') {
    rememberPendingUpsert(nextItem);
  }

  await applyCallHistory(
    rawCallHistory.value
      .filter(item => item.id !== nextItem.id)
      .concat(nextItem),
    userId,
    callHistorySdk
  );
};

export const removeCallHistoryMessage = async (
  messageId?: string | null
): Promise<void> => {
  const userId = syncUserScope();

  if (!userId || !messageId) {
    return;
  }

  await hydrateCallHistoryCache();

  if (callHistoryState.isLoading) {
    rememberPendingRemoval(messageId);
  }

  await applyCallHistory(
    rawCallHistory.value.filter(item => item.id !== messageId),
    userId
  );
};

export const useCallHistoryStore = () => ({
  rawCallHistory,
  callHistoryState
});

export type { CallHistoryMessageLike, ServerCallHistoryItem };
