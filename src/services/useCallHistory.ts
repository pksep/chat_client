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
import { parseCallMessage, parseCallMessageEx } from '../utils/parseCallMessage';

const CALL_HISTORY_CACHE_KEY = 'calls:history';

type CallHistorySource = 'http' | 'ws';

interface CallHistoryMessageLike {
  id: string;
  topicId: string;
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
  errorMessage: ''
});

let hydratedUserId: string | null = null;
let bootstrappedUserId: string | null = null;
let bootstrapPromise: Promise<void> | null = null;
const pendingUpserts = new Map<string, ServerCallHistoryItem>();
const pendingRemovals = new Set<string>();

const resolveCallHistoryUserId = (): string => getAuthUser()?.id || '';

const resetRuntimeState = (): void => {
  pendingUpserts.clear();
  pendingRemovals.clear();
  bootstrapPromise = null;
};

const syncUserScope = (): string => {
  const userId = resolveCallHistoryUserId();

  if (!userId) {
    rawCallHistory.value = [];
    callHistoryState.isCacheReady = false;
    callHistoryState.isLoading = false;
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

const applyCallHistory = async (
  items: ServerCallHistoryItem[],
  userId: string
): Promise<void> => {
  rawCallHistory.value = uniqCallHistoryItems(items);
  await saveShadowSyncMeta(CALL_HISTORY_CACHE_KEY, rawCallHistory.value, userId);
};

const resolveCallTopic = (topicId: string): ITopic | undefined =>
  useTopics().getSelectedTopic(topicId);

const buildCallHistoryItemFromMessage = (
  message: CallHistoryMessageLike
): ServerCallHistoryItem | null => {
  if (!message?.id || !message.topicId || !message.isSystem || message.deletedAt) {
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
    topic?.avatarUrl || topic?.group?.avatarUrl || topic?.user?.avatarUrl || null;

  return {
    id: message.id,
    topicId: message.topicId,
    topicType,
    topicName,
    topicAvatarUrl,
    senderUserId: message.senderUserId,
    text: message.text || '',
    ex: message.ex ?? null,
    createdAt: message.createdAt || message.updatedAt || new Date().toISOString()
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

  rawCallHistory.value = uniqCallHistoryItems(cachedItems);
  hydratedUserId = userId;
  callHistoryState.isCacheReady = true;
};

export const bootstrapCallHistory = async (
  sdk: Pick<ChatSDK, 'getCallHistory'> | null,
  opts?: { force?: boolean }
): Promise<void> => {
  const userId = syncUserScope();

  if (!userId) {
    return;
  }

  await hydrateCallHistoryCache();

  if (!sdk) {
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
    callHistoryState.errorMessage = '';

    try {
      const limit = 100;
      let currentPage = 1;
      let totalPages = 1;
      const nextCalls: ServerCallHistoryItem[] = [];

      do {
        const response = await sdk.getCallHistory({
          page: currentPage,
          limit
        });

        nextCalls.push(...response.data);
        totalPages = Math.max(1, response.meta.totalPages || 1);
        currentPage += 1;
      } while (currentPage <= totalPages);

      let mergedCalls = uniqCallHistoryItems(nextCalls);

      pendingRemovals.forEach(messageId => {
        mergedCalls = mergedCalls.filter(item => item.id !== messageId);
      });

      pendingUpserts.forEach(item => {
        mergedCalls = uniqCallHistoryItems(
          mergedCalls.filter(existing => existing.id !== item.id).concat(item)
        );
      });

      await applyCallHistory(mergedCalls, userId);
      bootstrappedUserId = userId;
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

export const initializeCallHistorySync = (
  sdk: Pick<ChatSDK, 'getCallHistory'> | null
): void => {
  void hydrateCallHistoryCache();
  void bootstrapCallHistory(sdk);
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
    rawCallHistory.value.filter(item => item.id !== nextItem.id).concat(nextItem),
    userId
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
