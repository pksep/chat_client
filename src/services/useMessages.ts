import { ref } from 'vue';
import { getChatSDK } from './useChat';
import {
  IMedia,
  IMessage,
  IMessageRead
} from '../components/interfaces/interfaces';
import { MessageStatus, Reaction } from './useChatSDK/types';
import {
  decrementServerUnreadCount,
  incrementServerUnreadCount,
  updateLocalTopicReadStatus,
  setTopicTaggedMe,
  syncTopicUnreadState,
  clearTopicReadPreview,
  useTopics
} from '../composables/useTopics';
import { isTopicMuted } from '../composables/useTopics';
import { useGroup } from '../composables/useGroup';
import { useUrlWatcher } from '../composables/navigation';
import { authedUser } from '../composables/useAuth';
import {
  clearCachedTopicMessages,
  loadCachedTopicMessages,
  saveCachedTopicMessages,
  savePendingUploadFile,
  loadPendingUploadFile,
  deletePendingUploadFile,
  savePendingUploadMeta,
  loadPendingUploadMeta,
  deletePendingUploadMeta
} from './useTopicMessagesCache';
import { fileToDataURL } from '../utils/fileToDataURL';
import { getVideoThumbnail } from '../utils/mediaPreview';
import { MediaType } from '@pksep/zod-shared-chat';
import {
  playNativeNotificationSound,
  shouldPlayNotificationSound
} from './useNotificationSoundPolicy';
import { getIsAppActivelyVisible } from './useAppVisibility';
import {
  appendShadowSyncMetaList,
  deleteShadowTopicMessage,
  hasCachedShadowLoadedRanges,
  hasCachedShadowReadState,
  isShadowSyncEnabled,
  loadShadowLoadedRanges,
  loadShadowReadState,
  resolveShadowTopicContext,
  resolveShadowTopicPage,
  saveShadowLoadedRange,
  loadShadowTopicContext,
  loadShadowTopicSnapshot,
  recordShadowChatEvent,
  saveShadowTopicSnapshot,
  syncShadowReadStateFromMessages
} from './useShadowChatSync';
import { isUnreadTrackableMessageForUser } from '../utils/messageTracking';

const fullMessagesStore = ref<Record<string, IMessage[]>>({});
const messagesStore = ref<Record<string, IMessage[]>>({});
const pinnedMessagesStore = ref<Record<string, IMessage[]>>({});
const MAX_ACTIVE_TOPIC_MESSAGES = 250;
const INITIAL_TOPIC_WINDOW_MESSAGES = 100;
const persistTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const pendingOutgoingForwardBatches = new Map<
  string,
  Array<{
    forwardBatchId: string;
    forwardBatchOrder: number;
  }>
>();
const pendingOutgoingForwardBatchTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const pendingUploadFiles = new Map<
  string,
  Map<string, { file: File; isMedia: boolean }>
>();
const pendingUploadMeta = new Map<
  string,
  { replyMessageId?: string; forwardMessageIds: string[] }
>();
const canonicalTopicStateIds = new Set<string>();
const delayedOutgoingMessages = new Map<
  string,
  { message: IMessage; timeoutId: ReturnType<typeof setTimeout> }
>();
const outgoingDeliveryTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const OUTGOING_DELIVERY_TIMEOUT_MS = 180000;
const notificationSoundSuppressedUntilByTopic = new Map<string, number>();
const suspendedLocalOwnReadTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const queuedLocalOwnReadIds = new Map<string, Set<string>>();

const route = useUrlWatcher();

const syncLocalLastMessage = (topicId: string, message?: IMessage): void => {
  const { updateLocalLastMessageTopic } = useTopics();
  const { updateLocalLastMessageGroup } = useGroup();

  updateLocalLastMessageTopic(topicId, message);
  updateLocalLastMessageGroup(topicId, message);
};

const markTopicStateCanonical = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  canonicalTopicStateIds.add(topicId);
};

const schedulePersistMessages = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  const existingTimeout = persistTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    persistTimeouts.delete(topicId);
    const topicMessages = prepareMessagesForPersistence(
      fullMessagesStore.value[topicId] || []
    );
    void saveCachedTopicMessages(topicId, topicMessages);
    void saveShadowTopicSnapshot(topicId, topicMessages, 'local', undefined, {
      replace: canonicalTopicStateIds.has(topicId)
    });
    void syncShadowReadStateFromMessages(topicId, topicMessages, 'local');
  }, 150);

  persistTimeouts.set(topicId, timeoutId);
};

const schedulePendingOutgoingForwardBatchCleanup = (topicId: string): void => {
  const existingTimeout = pendingOutgoingForwardBatchTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    pendingOutgoingForwardBatches.delete(topicId);
    pendingOutgoingForwardBatchTimeouts.delete(topicId);
  }, 30000);

  pendingOutgoingForwardBatchTimeouts.set(topicId, timeoutId);
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

const getMessageTimestamp = (message: IMessage): number => {
  return new Date(message.createdAt).getTime();
};

const compareMessages = (left: IMessage, right: IMessage): number => {
  const leftEx = parseMessageEx(left);
  const rightEx = parseMessageEx(right);
  const leftBatchId = leftEx?.forwardBatchId;
  const rightBatchId = rightEx?.forwardBatchId;

  if (
    typeof leftBatchId === 'string' &&
    leftBatchId === rightBatchId &&
    typeof leftEx?.forwardBatchOrder === 'number' &&
    typeof rightEx?.forwardBatchOrder === 'number'
  ) {
    return leftEx.forwardBatchOrder - rightEx.forwardBatchOrder;
  }

  const timeDiff = getMessageTimestamp(left) - getMessageTimestamp(right);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return 0;
};

const getPendingUploadKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const getDelayedOutgoingKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const getOutgoingDeliveryKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const hasClientId = (message: IMessage): boolean => {
  const parsedEx = parseMessageEx(message);
  return typeof parsedEx?.clientId === 'string' && parsedEx.clientId.length > 0;
};

const getClientId = (message: IMessage): string | null => {
  const parsedEx = parseMessageEx(message);
  return typeof parsedEx?.clientId === 'string' ? parsedEx.clientId : null;
};

const isPendingOutgoingMessage = (message: IMessage): boolean => {
  if (message.senderUserId !== authedUser.value?.id) {
    return false;
  }

  if (!hasClientId(message)) {
    return false;
  }

  return (
    message.status === MessageStatus.Wait ||
    message.status === MessageStatus.NotDelivered ||
    !!message.media?.some(media => media.uploadError || media.isLoading)
  );
};

const mergePendingReplyState = (
  incomingMessage: IMessage,
  pendingMessage?: IMessage
): IMessage => {
  if (!pendingMessage) {
    return incomingMessage;
  }

  const replyMessageId =
    incomingMessage.replyMessageId || pendingMessage.replyMessageId;
  const shouldReusePendingReply =
    !incomingMessage.replyMessage &&
    !!pendingMessage.replyMessage &&
    !!replyMessageId &&
    pendingMessage.replyMessage.id === replyMessageId;

  if (!replyMessageId && !shouldReusePendingReply) {
    return incomingMessage;
  }

  return {
    ...incomingMessage,
    replyMessageId,
    replyMessage: shouldReusePendingReply
      ? pendingMessage.replyMessage
      : incomingMessage.replyMessage
  };
};

const mergePendingMediaState = (
  incomingMessage: IMessage,
  pendingMessage?: IMessage
): IMessage => {
  if (!pendingMessage?.media?.length || !incomingMessage.media?.length) {
    return incomingMessage;
  }

  const media = incomingMessage.media.map((incomingMedia, index) => {
    const pendingMedia = pendingMessage.media?.[index];

    if (!pendingMedia) {
      return incomingMedia;
    }

    return {
      ...pendingMedia,
      ...incomingMedia,
      isLoading: false,
      uploadError: false,
      uploadPercent: null,
      path: incomingMedia.path || pendingMedia.path,
      thumbnailPath: incomingMedia.thumbnailPath || pendingMedia.thumbnailPath
    };
  });

  return {
    ...incomingMessage,
    media
  };
};

const hasPendingMediaUpload = (message?: IMessage): boolean =>
  !!message?.media?.some(media => media.isLoading);

const cancelOutgoingDeliveryTimeout = (
  topicId: string,
  messageId: string
): void => {
  const key = getOutgoingDeliveryKey(topicId, messageId);
  const timeoutId = outgoingDeliveryTimeouts.get(key);

  if (!timeoutId) {
    return;
  }

  clearTimeout(timeoutId);
  outgoingDeliveryTimeouts.delete(key);
};

const scheduleOutgoingDeliveryTimeout = (
  topicId: string,
  messageId: string,
  delayMs = OUTGOING_DELIVERY_TIMEOUT_MS
): void => {
  if (!topicId || !messageId) {
    return;
  }

  cancelOutgoingDeliveryTimeout(topicId, messageId);

  const timeoutId = setTimeout(
    () => {
      outgoingDeliveryTimeouts.delete(
        getOutgoingDeliveryKey(topicId, messageId)
      );

      const pendingMessage = getFullMessagesByTopicId(topicId).find(
        message => message.id === messageId
      );

      if (!pendingMessage || !isPendingOutgoingMessage(pendingMessage)) {
        return;
      }

      changeMessageStatusLocally(
        topicId,
        messageId,
        MessageStatus.NotDelivered
      );
    },
    Math.max(0, delayMs)
  );

  outgoingDeliveryTimeouts.set(
    getOutgoingDeliveryKey(topicId, messageId),
    timeoutId
  );
};

const mergeWithPendingOutgoingMessages = (
  incomingMessages: IMessage[],
  existingMessages: IMessage[]
): IMessage[] => {
  const incomingIds = new Set(incomingMessages.map(message => message.id));
  const incomingClientIds = new Set(
    incomingMessages
      .map(message => getClientId(message))
      .filter((clientId): clientId is string => !!clientId)
  );
  const pendingMessages = existingMessages.filter(
    message =>
      isPendingOutgoingMessage(message) &&
      !incomingIds.has(message.id as string) &&
      !incomingClientIds.has(getClientId(message) || '')
  );

  return [...incomingMessages, ...pendingMessages];
};

type MessageWindowMode =
  | 'latest'
  | 'preserve-start'
  | 'preserve-end'
  | 'around-anchor';

const clampMessagesForUi = (
  messages: IMessage[],
  mode: MessageWindowMode = 'latest',
  anchorMessageId?: string
): IMessage[] => {
  const uiWindowLimit =
    mode === 'latest'
      ? INITIAL_TOPIC_WINDOW_MESSAGES
      : MAX_ACTIVE_TOPIC_MESSAGES;

  if (messages.length <= uiWindowLimit) {
    return messages;
  }

  if (mode === 'preserve-start') {
    return messages.slice(0, uiWindowLimit);
  }

  if (mode === 'around-anchor' && anchorMessageId) {
    const anchorIndex = messages.findIndex(
      message => message.id === anchorMessageId
    );

    if (anchorIndex >= 0) {
      const halfWindow = Math.floor(uiWindowLimit / 2);
      const startIndex = Math.max(
        0,
        Math.min(anchorIndex - halfWindow, messages.length - uiWindowLimit)
      );

      return messages.slice(startIndex, startIndex + uiWindowLimit);
    }
  }

  return messages.slice(-uiWindowLimit);
};

const stripRuntimeMediaState = (message: IMessage): IMessage => ({
  ...message,
  media: message.media?.map(media => ({
    ...media,
    localPath: undefined,
    localThumbnailPath: undefined
  }))
});

const prepareMessagesForPersistence = (messages: IMessage[]): IMessage[] =>
  messages.map(stripRuntimeMediaState);

const restorePendingUploadMediaState = async (
  topicId: string,
  messages: IMessage[]
): Promise<IMessage[]> =>
  Promise.all(
    messages.map(async message => {
      if (!message.media?.length) {
        return message;
      }

      let hadInterruptedUpload = false;

      const restoredMedia = await Promise.all(
        message.media.map(async media => {
          const pendingFile = await getPendingUploadFile(
            topicId,
            message.id,
            media.id
          );

          if (!pendingFile) {
            if (media.isLoading) {
              hadInterruptedUpload = true;
              return {
                ...media,
                isLoading: false,
                uploadError: true,
                uploadPercent: null
              };
            }

            return media;
          }

          let localPath = media.localPath;
          let localThumbnailPath = media.localThumbnailPath;

          if (media.type === MediaType.Video) {
            localPath = URL.createObjectURL(pendingFile.file);
            localThumbnailPath =
              (await getVideoThumbnail(pendingFile.file)) || localPath;
          } else if (media.type === MediaType.Image) {
            localPath = await fileToDataURL(pendingFile.file);
          }

          if (media.isLoading) {
            hadInterruptedUpload = true;
          }

          return {
            ...media,
            localPath,
            localThumbnailPath,
            isLoading: media.isLoading ? false : media.isLoading,
            uploadError: media.isLoading ? true : media.uploadError,
            uploadPercent: media.isLoading ? null : media.uploadPercent
          };
        })
      );

      return {
        ...message,
        status: hadInterruptedUpload ? MessageStatus.Wait : message.status,
        media: restoredMedia
      };
    })
  );

const dedupeMessagesForTopic = (messages: IMessage[]): IMessage[] => {
  const byStableKey = new Map<string, IMessage>();

  messages.forEach(message => {
    const stableKey = getClientId(message) || message.id;

    if (stableKey) {
      byStableKey.set(stableKey, message);
    }
  });

  return Array.from(byStableKey.values());
};

const resolveLocalTopicPage = (
  topicId: string,
  opts?: {
    lastMessageId?: string;
    afterMessageId?: string;
    limit?: number;
  }
): IMessage[] => {
  const messages = getFullMessagesByTopicId(topicId);
  const limit = Math.max(1, opts?.limit || 50);

  if (!messages.length) {
    return [];
  }

  if (opts?.lastMessageId) {
    const cursorIndex = messages.findIndex(
      message => message.id === opts.lastMessageId
    );

    if (cursorIndex <= 0) {
      return [];
    }

    return messages.slice(Math.max(0, cursorIndex - limit), cursorIndex);
  }

  if (opts?.afterMessageId) {
    const cursorIndex = messages.findIndex(
      message => message.id === opts.afterMessageId
    );

    if (cursorIndex < 0 || cursorIndex >= messages.length - 1) {
      return [];
    }

    return messages.slice(cursorIndex + 1, cursorIndex + 1 + limit);
  }

  return messages.slice(-limit);
};

const normalizePaginationResult = (
  messages: IMessage[],
  opts?: {
    lastMessageId?: string;
    afterMessageId?: string;
  }
): IMessage[] => {
  if (!messages.length) {
    return messages;
  }

  if (opts?.lastMessageId) {
    return messages.filter(message => message.id !== opts.lastMessageId);
  }

  if (opts?.afterMessageId) {
    return messages.filter(message => message.id !== opts.afterMessageId);
  }

  return messages;
};

const getRangeMessagesForPersistence = (
  topicId: string,
  messages: IMessage[],
  opts?: {
    lastMessageId?: string;
    afterMessageId?: string;
  }
): IMessage[] => {
  if (!messages.length) {
    return messages;
  }

  const existingMessages = getFullMessagesByTopicId(topicId);
  const anchorMessageId = opts?.lastMessageId || opts?.afterMessageId;

  if (!anchorMessageId) {
    return messages;
  }

  const anchorMessage = existingMessages.find(
    message => message.id === anchorMessageId
  );

  if (!anchorMessage) {
    return messages;
  }

  return [...messages, anchorMessage];
};

const getWindowModeForFetch = (opts?: {
  lastMessageId?: string;
  afterMessageId?: string;
}): MessageWindowMode => {
  if (opts?.lastMessageId) {
    return 'preserve-start';
  }

  if (opts?.afterMessageId) {
    return 'preserve-end';
  }

  return 'latest';
};

const getHistoryDirection = (opts?: {
  lastMessageId?: string;
  afterMessageId?: string;
  newMessages?: boolean;
}): 'up' | 'down' | 'latest' =>
  opts?.lastMessageId ? 'up' : opts?.afterMessageId ? 'down' : 'latest';

const upsertMessageReadEntry = (
  messageReads: IMessageRead[] | undefined,
  payload: {
    messageId: string;
    userId: string;
    readAt: string;
  }
): IMessageRead[] => {
  const existingReads = messageReads || [];
  const existingEntry = existingReads.find(
    read => read.userId === payload.userId
  );

  if (existingEntry) {
    return existingReads.map(read =>
      read.userId === payload.userId
        ? {
            ...read,
            updatedAt: payload.readAt
          }
        : read
    );
  }

  return [
    ...existingReads,
    {
      id: `${payload.messageId}:${payload.userId}`,
      messageId: payload.messageId,
      userId: payload.userId,
      createdAt: payload.readAt,
      updatedAt: payload.readAt
    }
  ];
};

const traceHistoryResolution = (
  topicId: string,
  payload: Record<string, unknown>
): void => {
  void appendShadowSyncMetaList(`diag:history:${topicId}`, {
    timestamp: new Date().toISOString(),
    ...payload
  });
};

const ensureShadowReadStateLoaded = async (
  topicId: string,
  userId = authedUser.value?.id
): Promise<void> => {
  if (!topicId || !userId || !isShadowSyncEnabled()) {
    return;
  }

  if (hasCachedShadowReadState(topicId, userId)) {
    return;
  }

  await loadShadowReadState(topicId, userId);
};

const ensureShadowLoadedRangesLoaded = async (
  topicId: string,
  userId = authedUser.value?.id
): Promise<void> => {
  if (!topicId || !userId || !isShadowSyncEnabled()) {
    return;
  }

  if (hasCachedShadowLoadedRanges(topicId, userId)) {
    return;
  }

  await loadShadowLoadedRanges(topicId, userId);
};

const updateTopicMessageStores = (
  topicId: string,
  transform: (messages: IMessage[]) => IMessage[]
): IMessage[] => {
  const existingFullMessages = fullMessagesStore.value[topicId] || [];
  const existingVisibleMessages = messagesStore.value[topicId] || [];
  const nextFullMessages = [...transform([...existingFullMessages])].sort(
    compareMessages
  );
  const nextVisibleMessages = [...transform([...existingVisibleMessages])].sort(
    compareMessages
  );

  fullMessagesStore.value[topicId] = nextFullMessages;
  messagesStore.value[topicId] = nextVisibleMessages;

  return nextFullMessages;
};

const applyShadowReadStateToMessages = async (
  topicId: string,
  messages: IMessage[],
  userId = authedUser.value?.id
): Promise<IMessage[]> => {
  if (!topicId || !userId || messages.length === 0) {
    return messages;
  }

  const readState = await loadShadowReadState(topicId, userId);

  if (!readState?.lastReadMessageId && !readState?.lastReadAt) {
    return messages;
  }

  const lastReadMessage = readState?.lastReadMessageId
    ? messages.find(message => message.id === readState.lastReadMessageId)
    : null;
  const lastReadTimestamp = lastReadMessage
    ? getMessageTimestamp(lastReadMessage)
    : new Date(readState?.lastReadAt || 0).getTime();

  if (!lastReadTimestamp || Number.isNaN(lastReadTimestamp)) {
    return messages;
  }

  return messages.map(message => {
    if (
      message.senderUserId === userId ||
      getMessageTimestamp(message) > lastReadTimestamp
    ) {
      return message;
    }

    return {
      ...message,
      isReadByMe: true,
      isRead: true,
      status:
        message.status === MessageStatus.Wait ||
        message.status === MessageStatus.NotDelivered
          ? message.status
          : MessageStatus.Read
    };
  });
};

const consumePendingOutgoingForwardBatchMeta = (
  topicId: string
): { forwardBatchId: string; forwardBatchOrder: number } | null => {
  const pendingBatch = pendingOutgoingForwardBatches.get(topicId);

  if (!pendingBatch || pendingBatch.length === 0) {
    return null;
  }

  const nextMeta = pendingBatch.shift() || null;

  if (pendingBatch.length === 0) {
    pendingOutgoingForwardBatches.delete(topicId);
    const timeoutId = pendingOutgoingForwardBatchTimeouts.get(topicId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingOutgoingForwardBatchTimeouts.delete(topicId);
    }
  }

  return nextMeta;
};

export const registerPendingOutgoingForwardBatch = (
  topicId: string,
  items: Array<{
    forwardBatchId: string;
    forwardBatchOrder: number;
  }>
): void => {
  if (!topicId || items.length === 0) {
    return;
  }

  pendingOutgoingForwardBatches.set(topicId, [...items]);
  schedulePendingOutgoingForwardBatchCleanup(topicId);
};

export const fetchMessagesForTopic = async (
  topicId: string = route.value.id,
  opts?: {
    lastMessageId?: string;
    limit?: number;
    afterMessageId?: string;
    newMessages?: boolean;
    skipSave?: boolean;
    syncLastMessage?: boolean;
    forceRefresh?: boolean;
    forceNetwork?: boolean;
  }
): Promise<IMessage[]> => {
  try {
    if (!topicId) return [];

    await ensureShadowReadStateLoaded(topicId);
    await ensureShadowLoadedRangesLoaded(topicId);

    const existingMessages = getFullMessagesByTopicId(topicId);
    const isPaginationRequest = Boolean(
      opts?.lastMessageId || opts?.afterMessageId || opts?.newMessages
    );
    const direction = getHistoryDirection(opts);

    if (!navigator.onLine) {
      if (
        (opts?.lastMessageId || opts?.afterMessageId) &&
        existingMessages.length > 0
      ) {
        const localPage = await applyShadowReadStateToMessages(
          topicId,
          resolveLocalTopicPage(topicId, opts)
        );

        if (localPage.length > 0) {
          if (!opts?.skipSave) {
            mergeMessagesForTopic(
              topicId,
              localPage,
              opts.lastMessageId ? 'prepend' : 'append',
              {
                syncLastMessage: opts?.syncLastMessage ?? false,
                windowMode: getWindowModeForFetch(opts)
              }
            );
          }

          traceHistoryResolution(topicId, {
            direction,
            source: 'offline-memory',
            resolution: 'cache_hit',
            resultCount: localPage.length,
            lastMessageId: opts?.lastMessageId || null,
            afterMessageId: opts?.afterMessageId || null
          });
          return localPage;
        }
      }

      if (existingMessages.length > 0 && canonicalTopicStateIds.has(topicId)) {
        traceHistoryResolution(topicId, {
          direction,
          source: 'offline-memory',
          resultCount: existingMessages.length,
          lastMessageId: opts?.lastMessageId || null,
          afterMessageId: opts?.afterMessageId || null
        });
        return existingMessages;
      }

      traceHistoryResolution(topicId, {
        direction,
        source: 'offline-cache',
        resultCount: 0,
        lastMessageId: opts?.lastMessageId || null,
        afterMessageId: opts?.afterMessageId || null
      });
      return hydrateMessagesFromCache(topicId);
    }

    if (
      !opts?.forceRefresh &&
      !isPaginationRequest &&
      existingMessages.length > 0 &&
      canonicalTopicStateIds.has(topicId)
    ) {
      if (!opts?.limit || existingMessages.length >= opts.limit) {
        traceHistoryResolution(topicId, {
          direction,
          source: 'memory-store',
          resultCount: existingMessages.length,
          lastMessageId: opts?.lastMessageId || null,
          afterMessageId: opts?.afterMessageId || null
        });
        return existingMessages;
      }
    }

    if (
      !opts?.forceNetwork &&
      (opts?.lastMessageId || opts?.afterMessageId) &&
      existingMessages.length > 0
    ) {
      const localPage = await applyShadowReadStateToMessages(
        topicId,
        resolveLocalTopicPage(topicId, opts)
      );

      if (localPage.length > 0) {
        if (!opts?.skipSave) {
          mergeMessagesForTopic(
            topicId,
            localPage,
            opts.lastMessageId ? 'prepend' : 'append',
            {
              syncLastMessage: opts?.syncLastMessage ?? false,
              windowMode: getWindowModeForFetch(opts)
            }
          );
        }

        traceHistoryResolution(topicId, {
          direction,
          source: 'memory-store',
          resolution: 'cache_hit',
          resultCount: localPage.length,
          lastMessageId: opts?.lastMessageId || null,
          afterMessageId: opts?.afterMessageId || null
        });

        return localPage;
      }
    }

    if (isShadowSyncEnabled() && !opts?.forceNetwork) {
      const shadowPageResolution = await resolveShadowTopicPage(topicId, {
        limit: opts?.limit,
        lastMessageId: opts?.lastMessageId,
        afterMessageId: opts?.afterMessageId
      });
      const shadowMessages = shadowPageResolution.messages;
      const normalizedShadowMessages = await applyShadowReadStateToMessages(
        topicId,
        normalizePaginationResult(shadowMessages, opts)
      );
      const isPartialInitialShadowHit =
        !isPaginationRequest &&
        !!opts?.limit &&
        normalizedShadowMessages.length < opts.limit &&
        existingMessages.length < opts.limit;

      if (normalizedShadowMessages.length > 0 && !isPartialInitialShadowHit) {
        if (!isPaginationRequest) {
          markTopicStateCanonical(topicId);
        }
        void recordShadowChatEvent({
          topicId,
          type: 'bootstrap_history',
          source: 'local',
          payload: {
            resolution: shadowPageResolution.status,
            lastMessageId: opts?.lastMessageId,
            afterMessageId: opts?.afterMessageId,
            limit: opts?.limit,
            messageIds: normalizedShadowMessages.map(message => message.id)
          }
        });
        void saveShadowLoadedRange(
          topicId,
          getRangeMessagesForPersistence(
            topicId,
            normalizedShadowMessages,
            opts
          )
        );

        if (!opts?.skipSave) {
          mergeMessagesForTopic(
            topicId,
            normalizedShadowMessages,
            opts?.lastMessageId
              ? 'prepend'
              : opts?.afterMessageId
                ? 'append'
                : 'replace',
            {
              syncLastMessage: opts?.syncLastMessage ?? false,
              windowMode: getWindowModeForFetch(opts)
            }
          );
        }

        traceHistoryResolution(topicId, {
          direction,
          source: 'indexeddb',
          resolution: shadowPageResolution.status,
          resultCount: normalizedShadowMessages.length,
          lastMessageId: opts?.lastMessageId || null,
          afterMessageId: opts?.afterMessageId || null
        });

        return normalizedShadowMessages;
      }
    }

    const sdk = getChatSDK();
    if (!sdk) return existingMessages;

    const messages = normalizePaginationResult(
      await sdk.getMessages(topicId, {
        limit: opts?.limit,
        lastMessageId: opts?.lastMessageId,
        afterMessageId: opts?.afterMessageId,
        newMessages: opts?.newMessages
      }),
      opts
    );

    void recordShadowChatEvent({
      topicId,
      type: 'bootstrap_history',
      source: 'http',
      payload: {
        lastMessageId: opts?.lastMessageId,
        afterMessageId: opts?.afterMessageId,
        newMessages: opts?.newMessages,
        limit: opts?.limit,
        messageIds: messages.map(message => message.id)
      }
    });
    void saveShadowTopicSnapshot(topicId, messages, 'http');
    void saveShadowLoadedRange(
      topicId,
      getRangeMessagesForPersistence(topicId, messages, opts)
    );
    void syncShadowReadStateFromMessages(topicId, messages, 'http');

    if (!opts?.skipSave) {
      const existing = getFullMessagesByTopicId(topicId) || [];

      let combined = isPaginationRequest
        ? mergeWithPendingOutgoingMessages(messages, existing)
        : [...existing, ...messages];

      if (opts?.lastMessageId) {
        combined = [...messages, ...existing];
      } else if (opts?.afterMessageId) {
        combined = [...existing, ...messages];
      }
      const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
      const existingVisible = getMessagesByTopicId(topicId);
      const visibleMessages = opts?.lastMessageId
        ? Array.from(
            new Map(
              [...messages, ...existingVisible].map(m => [m.id, m])
            ).values()
          )
        : opts?.afterMessageId
          ? Array.from(
              new Map(
                [...existingVisible, ...messages].map(m => [m.id, m])
              ).values()
            )
          : mergeWithPendingOutgoingMessages(messages, existingVisible);

      saveMessagesToLocal(topicId, unique, {
        syncLastMessage: opts?.syncLastMessage ?? false,
        windowMode: getWindowModeForFetch(opts),
        visibleMessages
      });
    }

    if (!isPaginationRequest) {
      markTopicStateCanonical(topicId);
    }

    return messages;
  } catch (error) {
    console.warn('Failed to fetch message history:', error);
    traceHistoryResolution(topicId, {
      direction: getHistoryDirection(opts),
      source: 'error',
      error: error instanceof Error ? error.message : String(error),
      lastMessageId: opts?.lastMessageId || null,
      afterMessageId: opts?.afterMessageId || null
    });

    const existingMessages = getFullMessagesByTopicId(topicId);
    if (existingMessages.length > 0) {
      return existingMessages;
    }

    return hydrateMessagesFromCache(topicId);
  }
};

export const fetchPinnedMessagesForTopic = async (
  topicId: string = route.value.id
): Promise<IMessage[]> => {
  try {
    if (!topicId) return;
    const sdk = getChatSDK();
    if (!sdk) return;
    const messages = await sdk.getPinnedMessages(topicId);

    savePinnedMessagesToLocal(topicId, messages);

    return messages;
  } catch (error) {
    console.warn('Failed to fetch pinned message history:', error);
    return getPinnedMessagesByTopicId(topicId);
  }
};

export const fetchAroundMessage = async (
  messageId: string,
  topicId: string = route.value.id
): Promise<IMessage[]> => {
  try {
    if (!messageId) return;

    await ensureShadowLoadedRangesLoaded(topicId);

    if (isShadowSyncEnabled()) {
      const shadowContextResolution = await resolveShadowTopicContext(
        topicId,
        messageId,
        {
          beforeLimit: 40,
          afterLimit: 40
        }
      );
      const shadowMessages = shadowContextResolution.messages;

      if (shadowMessages.some(message => message.id === messageId)) {
        const normalizedShadowMessages = await applyShadowReadStateToMessages(
          topicId,
          shadowMessages
        );

        void recordShadowChatEvent({
          topicId,
          type: 'bootstrap_history',
          source: 'local',
          payload: {
            resolution: shadowContextResolution.status,
            aroundMessageId: messageId,
            messageIds: normalizedShadowMessages.map(message => message.id)
          }
        });

        mergeMessagesForTopic(topicId, normalizedShadowMessages, 'replace', {
          syncLastMessage: false,
          windowMode: 'around-anchor',
          anchorMessageId: messageId
        });

        return normalizedShadowMessages;
      }
    }

    const sdk = getChatSDK();
    if (!sdk) return;

    const messages = await sdk.getAroundMessage(messageId);
    void recordShadowChatEvent({
      topicId,
      type: 'bootstrap_history',
      source: 'http',
      payload: {
        aroundMessageId: messageId,
        messageIds: messages.map(message => message.id)
      }
    });
    void saveShadowTopicSnapshot(topicId, messages, 'http');
    void saveShadowLoadedRange(topicId, messages);
    mergeMessagesForTopic(topicId, messages, 'replace', {
      syncLastMessage: false,
      windowMode: 'around-anchor',
      anchorMessageId: messageId
    });

    return messages;
  } catch (error) {
    console.warn('Failed to fetch around message:', error);
    return [];
  }
};

export const addMessageToLocal = (topicId: string, message: IMessage): void => {
  const existingMessages = getFullMessagesByTopicId(topicId);
  const alreadyExists = existingMessages.some(item => item.id === message.id);
  const shouldUpdateVisibleWindow = topicId === route.value.id;

  const parsedEx = parseMessageEx(message);
  const clientId =
    typeof parsedEx?.clientId === 'string' ? parsedEx.clientId : null;
  const pendingOutgoingForwardBatchMeta =
    message.senderUserId === authedUser.value?.id &&
    !parsedEx?.forwardBatchId &&
    !clientId
      ? consumePendingOutgoingForwardBatchMeta(topicId)
      : null;
  const nextMessage =
    pendingOutgoingForwardBatchMeta && !clientId
      ? {
          ...message,
          ex: JSON.stringify({
            ...(parsedEx || {}),
            ...pendingOutgoingForwardBatchMeta
          })
        }
      : message;

  if (
    nextMessage.taggedUserIds?.includes(authedUser.value?.id) &&
    nextMessage.senderUserId !== authedUser.value?.id &&
    !nextMessage.isReadByMe
  ) {
    setTopicTaggedMe(topicId, true);
  }

  if (!clientId) {
    saveMessagesToLocal(topicId, [...existingMessages, nextMessage], {
      syncLastMessage: true,
      windowMode: 'preserve-end',
      updateVisible: shouldUpdateVisibleWindow
    });

    if (
      !alreadyExists &&
      isUnreadTrackableMessageForUser(nextMessage, authedUser.value?.id) &&
      nextMessage.senderUserId !== authedUser.value?.id &&
      nextMessage.isReadByMe !== true
    ) {
      incrementServerUnreadCount(topicId, 1);
    }

    syncTopicUnreadState(topicId);
    syncLocalLastMessage(topicId, nextMessage);

    if (
      isPendingOutgoingMessage(nextMessage) &&
      !hasPendingMediaUpload(nextMessage)
    ) {
      scheduleOutgoingDeliveryTimeout(topicId, nextMessage.id);
    }
    return;
  }

  cancelDelayedOutgoingMessage(topicId, clientId);
  cancelOutgoingDeliveryTimeout(topicId, clientId);

  const pendingMessage = existingMessages.find(
    message => message.id === clientId
  );
  const resolvedMessage = mergePendingMediaState(
    mergePendingReplyState(nextMessage, pendingMessage),
    pendingMessage
  );
  const lastMessage = existingMessages.at(-1);

  if (lastMessage?.id === clientId) {
    updateTopicMessageStores(topicId, messages =>
      messages.map(existingMessage => {
        if (existingMessage.id !== clientId) {
          return existingMessage;
        }

        return {
          ...resolvedMessage
        };
      })
    );
    schedulePersistMessages(topicId);
    clearPendingUploadMessage(topicId, clientId);

    if (
      !alreadyExists &&
      isUnreadTrackableMessageForUser(nextMessage, authedUser.value?.id) &&
      nextMessage.senderUserId !== authedUser.value?.id &&
      nextMessage.isReadByMe !== true
    ) {
      incrementServerUnreadCount(topicId, 1);
    }

    syncTopicUnreadState(topicId);
    syncLocalLastMessage(topicId, resolvedMessage);

    if (
      isPendingOutgoingMessage(resolvedMessage) &&
      !hasPendingMediaUpload(resolvedMessage)
    ) {
      scheduleOutgoingDeliveryTimeout(topicId, resolvedMessage.id);
    }

    return;
  }

  const filtered = existingMessages.filter(m => m.id !== clientId);

  saveMessagesToLocal(topicId, [...filtered, resolvedMessage], {
    syncLastMessage: true,
    windowMode: 'preserve-end',
    updateVisible: shouldUpdateVisibleWindow
  });
  clearPendingUploadMessage(topicId, clientId);

  if (
    !alreadyExists &&
    isUnreadTrackableMessageForUser(nextMessage, authedUser.value?.id) &&
    nextMessage.senderUserId !== authedUser.value?.id &&
    nextMessage.isReadByMe !== true
  ) {
    incrementServerUnreadCount(topicId, 1);
  }

  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId, resolvedMessage);

  if (
    isPendingOutgoingMessage(resolvedMessage) &&
    !hasPendingMediaUpload(resolvedMessage)
  ) {
    scheduleOutgoingDeliveryTimeout(topicId, resolvedMessage.id);
  }
};

export const scheduleDelayedOutgoingMessage = (
  topicId: string,
  message: IMessage,
  delayMs: number
): void => {
  if (!topicId || !message?.id) {
    return;
  }

  const key = getDelayedOutgoingKey(topicId, message.id);
  const existing = delayedOutgoingMessages.get(key);

  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    delayedOutgoingMessages.delete(key);

    const alreadyExists = getFullMessagesByTopicId(topicId).some(
      existingMessage => existingMessage.id === message.id
    );

    if (!alreadyExists) {
      addMessageToLocal(topicId, message);
    }
  }, delayMs);

  delayedOutgoingMessages.set(key, {
    message,
    timeoutId
  });
};

export const cancelDelayedOutgoingMessage = (
  topicId: string,
  messageId: string
): void => {
  const key = getDelayedOutgoingKey(topicId, messageId);
  const pending = delayedOutgoingMessages.get(key);

  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  delayedOutgoingMessages.delete(key);
};

export const deleteMessageFromLocal = (
  topicId: string,
  messageId: string
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.filter(message => message.id !== messageId)
  );
  schedulePersistMessages(topicId);
  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId);
  savePinnedMessagesToLocal(
    topicId,
    (pinnedMessagesStore.value[topicId] || []).filter(
      message => message.id !== messageId
    )
  );

  clearPendingUploadMessage(topicId, messageId);
  cancelOutgoingDeliveryTimeout(topicId, messageId);
  unpinLocalMessageForMe(topicId, messageId);
  void deleteShadowTopicMessage(topicId, messageId);
};

export const editMessageFromLocal = (
  topicId: string,
  message: IMessage
): void => {
  const existingMessages = getFullMessagesByTopicId(topicId);

  const updateMessage = (msg: IMessage): IMessage => {
    let isEdit = msg.isEdit;
    if (message.isPin !== msg.isPin) {
      const pinnedMessages = pinnedMessagesStore.value[topicId] || [];
      if (message.isPin) {
        savePinnedMessagesToLocal(topicId, [
          ...pinnedMessages.filter(
            pinnedMessage => pinnedMessage.id !== message.id
          ),
          {
            ...message,
            isPinnedForAll: true,
            isPinnedForMe: true,
            isPinnedOnlyMe: false
          }
        ]);
      } else {
        savePinnedMessagesToLocal(
          topicId,
          pinnedMessages.filter(m => m.id !== message.id)
        );
      }
    } else {
      isEdit = true;
    }

    return {
      ...msg,
      ...('isPinnedForAll' in message
        ? { isPinnedForAll: message.isPinnedForAll }
        : {}),
      ...('isPinnedForMe' in message
        ? { isPinnedForMe: message.isPinnedForMe }
        : {}),
      ...('isPinnedOnlyMe' in message
        ? { isPinnedOnlyMe: message.isPinnedOnlyMe }
        : {}),
      text: message.text,
      isPin: message.isPin,
      isEdit
    };
  };

  if (!existingMessages.some(msg => msg.id === message.id)) {
    return;
  }

  updateTopicMessageStores(topicId, messages =>
    messages.map(msg => (msg.id === message.id ? updateMessage(msg) : msg))
  );
  schedulePersistMessages(topicId);
  syncLocalLastMessage(topicId);
};

export const changeReactionFromLocal = (
  topicId: string,
  messageId: string,
  action: string,
  reaction?: Reaction,
  reactionId?: string
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(msg => {
      if (msg.id !== messageId) {
        return msg;
      }

      const currentReactions = msg.reactions || [];

      if (action === 'removed') {
        return {
          ...msg,
          reactions: currentReactions.filter(
            reaction => reaction.id !== reactionId
          )
        };
      }

      if (action === 'added') {
        if (!reaction) {
          return msg;
        }

        return {
          ...msg,
          reactions: [
            ...currentReactions.filter(
              currentReaction =>
                currentReaction.id !== reaction.id &&
                !(
                  currentReaction.senderUserId === reaction.senderUserId &&
                  currentReaction.text === reaction.text
                )
            ),
            reaction
          ]
        };
      }

      if (action === 'updated') {
        if (!reaction) {
          return msg;
        }

        let hasUpdatedReaction = false;
        const updatedReactions = currentReactions.map(currentReaction => {
          if (currentReaction.id !== reaction.id) {
            return currentReaction;
          }

          hasUpdatedReaction = true;
          return reaction;
        });

        return {
          ...msg,
          reactions: hasUpdatedReaction
            ? updatedReactions
            : [...updatedReactions, reaction]
        };
      }

      return msg;
    })
  );
  schedulePersistMessages(topicId);
};

export const saveMessagesToLocal = (
  topicId: string,
  messages: IMessage[],
  opts?: {
    syncLastMessage?: boolean;
    windowMode?: MessageWindowMode;
    anchorMessageId?: string;
    visibleMessages?: IMessage[];
    updateVisible?: boolean;
  }
): void => {
  const sortedMessages = dedupeMessagesForTopic(messages).sort(compareMessages);
  const boundedMessages = clampMessagesForUi(
    dedupeMessagesForTopic(opts?.visibleMessages || sortedMessages).sort(
      compareMessages
    ),
    opts?.windowMode,
    opts?.anchorMessageId
  );

  fullMessagesStore.value[topicId] = sortedMessages;
  if (opts?.updateVisible !== false) {
    messagesStore.value[topicId] = boundedMessages;
  }
  schedulePersistMessages(topicId);
  syncTopicUnreadState(topicId);

  if (opts?.syncLastMessage !== false) {
    syncLocalLastMessage(topicId);
  }

  const isTagged = boundedMessages.some(
    m =>
      m.taggedUserIds?.includes(authedUser.value?.id) &&
      m.senderUserId !== authedUser.value?.id &&
      !m.isReadByMe
  );
  if (isTagged) {
    setTopicTaggedMe(topicId, true);
  }
};

export const clearMessagesForTopic = (
  topicId: string,
  opts?: { syncLastMessage?: boolean }
): void => {
  if (!topicId) {
    return;
  }

  saveMessagesToLocal(topicId, [], {
    syncLastMessage: opts?.syncLastMessage ?? false
  });
  canonicalTopicStateIds.delete(topicId);
};

export const getFullMessagesByTopicId = (topicId: string): IMessage[] => {
  return fullMessagesStore.value[topicId] || [];
};

export const getTopicIdsWithMessages = (): string[] =>
  Object.keys(fullMessagesStore.value);

export const getMessagesByTopicId = (topicId: string): IMessage[] => {
  return messagesStore.value[topicId] || [];
};

export const clearVisibleMessagesForTopic = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  messagesStore.value[topicId] = [];
};

export const hydrateMessagesFromCache = async (
  topicId: string,
  userId?: string
): Promise<IMessage[]> => {
  if (!topicId) {
    return [];
  }

  const existingFullMessages = getFullMessagesByTopicId(topicId);

  if (existingFullMessages.length > 0 && canonicalTopicStateIds.has(topicId)) {
    saveMessagesToLocal(topicId, existingFullMessages, {
      syncLastMessage: false,
      windowMode: 'latest'
    });

    return getMessagesByTopicId(topicId);
  }

  await ensureShadowReadStateLoaded(topicId, userId || authedUser.value?.id);
  await ensureShadowLoadedRangesLoaded(topicId, userId || authedUser.value?.id);

  if (isShadowSyncEnabled()) {
    const shadowMessages = await loadShadowTopicSnapshot(topicId, userId);

    if (shadowMessages.length > 0) {
      await loadShadowReadState(topicId, userId);
      const existingMessages = getFullMessagesByTopicId(topicId);
      const normalizedShadowMessages = await restorePendingUploadMediaState(
        topicId,
        await applyShadowReadStateToMessages(
          topicId,
          prepareMessagesForPersistence([
            ...shadowMessages,
            ...existingMessages
          ]),
          userId
        )
      );

      saveMessagesToLocal(topicId, normalizedShadowMessages, {
        syncLastMessage: false,
        windowMode: 'latest'
      });
      markTopicStateCanonical(topicId);
      void saveShadowLoadedRange(topicId, normalizedShadowMessages);

      return normalizedShadowMessages;
    }
  }

  const cachedMessages = await loadCachedTopicMessages(topicId, userId);

  if (cachedMessages.length > 0) {
    const normalizedCachedMessages = await restorePendingUploadMediaState(
      topicId,
      prepareMessagesForPersistence([
        ...cachedMessages,
        ...getFullMessagesByTopicId(topicId)
      ])
    );

    saveMessagesToLocal(topicId, normalizedCachedMessages, {
      syncLastMessage: false,
      windowMode: 'latest'
    });
    markTopicStateCanonical(topicId);
    void saveShadowTopicSnapshot(
      topicId,
      normalizedCachedMessages,
      'local',
      userId,
      {
        replace: true
      }
    );
    void saveShadowLoadedRange(topicId, normalizedCachedMessages, userId);
    void syncShadowReadStateFromMessages(
      topicId,
      normalizedCachedMessages,
      'local',
      userId
    );
    void clearCachedTopicMessages(topicId, userId);

    return normalizedCachedMessages;
  }

  if (existingFullMessages.length > 0) {
    saveMessagesToLocal(topicId, existingFullMessages, {
      syncLastMessage: false,
      windowMode: 'latest'
    });

    return getMessagesByTopicId(topicId);
  }

  return [];
};

export const hydrateMessageContextFromShadow = async (
  topicId: string,
  messageId: string,
  userId?: string
): Promise<IMessage[]> => {
  if (!topicId || !messageId || !isShadowSyncEnabled()) {
    return [];
  }

  const shadowMessages = await loadShadowTopicContext(
    topicId,
    messageId,
    {
      beforeLimit: 40,
      afterLimit: 40
    },
    userId
  );

  if (
    !shadowMessages.length ||
    !shadowMessages.some(message => message.id === messageId)
  ) {
    return [];
  }

  const normalizedShadowMessages = await applyShadowReadStateToMessages(
    topicId,
    shadowMessages,
    userId
  );

  mergeMessagesForTopic(topicId, normalizedShadowMessages, 'replace', {
    syncLastMessage: false,
    windowMode: 'around-anchor',
    anchorMessageId: messageId
  });
  void saveShadowLoadedRange(topicId, normalizedShadowMessages);

  return normalizedShadowMessages;
};

export const mergeMessagesForTopic = (
  topicId: string,
  messages: IMessage[],
  mode: 'replace' | 'prepend' | 'append' = 'replace',
  opts?: {
    syncLastMessage?: boolean;
    windowMode?: MessageWindowMode;
    anchorMessageId?: string;
  }
): IMessage[] => {
  const existing = getFullMessagesByTopicId(topicId) || [];
  const existingVisible = getMessagesByTopicId(topicId) || [];

  let combined =
    mode === 'replace'
      ? [...existing, ...messages]
      : mergeWithPendingOutgoingMessages(messages, existing);

  if (mode === 'prepend') {
    combined = [...messages, ...existing];
  } else if (mode === 'append') {
    combined = [...existing, ...messages];
  }

  const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
  const visibleCombined =
    mode === 'prepend'
      ? Array.from(
          new Map(
            [...messages, ...existingVisible].map(m => [m.id, m])
          ).values()
        )
      : mode === 'append'
        ? Array.from(
            new Map(
              [...existingVisible, ...messages].map(m => [m.id, m])
            ).values()
          )
        : mergeWithPendingOutgoingMessages(messages, existingVisible);
  saveMessagesToLocal(topicId, unique, {
    syncLastMessage: opts?.syncLastMessage ?? false,
    windowMode:
      opts?.windowMode ||
      (mode === 'prepend'
        ? 'preserve-start'
        : mode === 'append'
          ? 'preserve-end'
          : 'latest'),
    anchorMessageId: opts?.anchorMessageId,
    visibleMessages: visibleCombined
  });

  return unique;
};

export const savePinnedMessagesToLocal = (
  topicId: string,
  messages: IMessage[]
): void => {
  pinnedMessagesStore.value[topicId] = messages;
};

export const getPinnedMessagesByTopicId = (topicId: string): IMessage[] => {
  return pinnedMessagesStore.value[topicId] || [];
};

export const isMessagePinnedOnlyForMe = (
  topicId: string,
  messageId: string
): boolean =>
  Boolean(
    (pinnedMessagesStore.value[topicId] || []).find(
      message => message.id === messageId && message.isPinnedOnlyMe
    )
  );

export const isMessagePinnedForMe = (
  topicId: string,
  messageId: string,
  isPinnedForAll = false
): boolean =>
  Boolean(isPinnedForAll) ||
  Boolean(
    (pinnedMessagesStore.value[topicId] || []).find(
      message => message.id === messageId
    )
  );

export const pinMessageOnlyForMe = (
  topicId: string,
  messageId: string
): void => {
  const existingPinnedMessages = pinnedMessagesStore.value[topicId] || [];

  if (existingPinnedMessages.some(message => message.id === messageId)) {
    return;
  }

  const message = getFullMessagesByTopicId(topicId).find(
    currentMessage => currentMessage.id === messageId
  );

  if (!message) {
    return;
  }

  savePinnedMessagesToLocal(topicId, [
    ...existingPinnedMessages,
    {
      ...message,
      isPin: true,
      isPinnedForAll: false,
      isPinnedForMe: true,
      isPinnedOnlyMe: true
    }
  ]);
};

export const unpinLocalMessageForMe = (
  topicId: string,
  messageId: string
): void => {
  const existingPinnedMessages = pinnedMessagesStore.value[topicId] || [];

  if (!existingPinnedMessages.some(message => message.id === messageId)) {
    return;
  }

  savePinnedMessagesToLocal(
    topicId,
    existingPinnedMessages.filter(message => message.id !== messageId)
  );
};

export const getGroupMessageWithPinned = (
  topicId: string,
  messages: IMessage[]
): void => {
  pinnedMessagesStore.value[topicId] = messages;
};

const applyLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const existingMessages = getFullMessagesByTopicId(topicId);
  const isReadByCurrentUser = userId === authedUser.value.id;
  const readAt = new Date().toISOString();
  const newlyReadCount = isReadByCurrentUser
    ? existingMessages.filter(
        message =>
          messageIds.includes(message.id) &&
          message.senderUserId !== authedUser.value.id &&
          message.isReadByMe !== true
      ).length
    : 0;
  const updatedMessages = existingMessages.map(message => {
    if (messageIds.includes(message.id)) {
      return {
        ...message,
        status: MessageStatus.Read,
        isRead: true,
        isReadByMe: isReadByCurrentUser ? true : message.isReadByMe,
        messageRead: isReadByCurrentUser
          ? message.messageRead
          : upsertMessageReadEntry(message.messageRead, {
              messageId: message.id,
              userId,
              readAt
            })
      };
    }
    return message;
  });

  updateLocalTopicReadStatus(topicId, messageIds);
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (messageIds.includes(message.id)) {
        return {
          ...message,
          status: MessageStatus.Read,
          isRead: true,
          isReadByMe: isReadByCurrentUser ? true : message.isReadByMe,
          messageRead: isReadByCurrentUser
            ? message.messageRead
            : upsertMessageReadEntry(message.messageRead, {
                messageId: message.id,
                userId,
                readAt
              })
        };
      }
      return message;
    })
  );
  schedulePersistMessages(topicId);
  void syncShadowReadStateFromMessages(topicId, updatedMessages, 'local');
  if (newlyReadCount > 0) {
    decrementServerUnreadCount(topicId, newlyReadCount);
  }
  clearTopicReadPreview(topicId, messageIds);
  syncTopicUnreadState(topicId);

  if (userId === authedUser.value.id) {
    // Re-evaluate taggedMe status for the topic
    const hasUnreadMentions = updatedMessages.some(
      m =>
        m.taggedUserIds?.includes(authedUser.value?.id) &&
        m.senderUserId !== authedUser.value?.id &&
        !m.isReadByMe &&
        !messageIds.includes(m.id)
    );
    if (!hasUnreadMentions) {
      setTopicTaggedMe(topicId, false);
    }
  }
};

export const flushDeferredLocalOwnReadStatus = (topicId: string): void => {
  const queuedIds = Array.from(queuedLocalOwnReadIds.get(topicId) || []);

  if (!queuedIds.length || !authedUser.value?.id) {
    queuedLocalOwnReadIds.delete(topicId);
    return;
  }

  queuedLocalOwnReadIds.delete(topicId);
  applyLocalReadStatus(topicId, queuedIds, authedUser.value.id);
};

export const suspendLocalOwnReadStatus = (
  topicId: string,
  durationMs: number
): void => {
  if (!topicId) {
    return;
  }

  const existingTimeout = suspendedLocalOwnReadTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(
    () => {
      suspendedLocalOwnReadTimeouts.delete(topicId);
      flushDeferredLocalOwnReadStatus(topicId);
    },
    Math.max(0, durationMs)
  );

  suspendedLocalOwnReadTimeouts.set(topicId, timeoutId);
};

const isLocalOwnReadStatusSuspended = (topicId: string): boolean =>
  suspendedLocalOwnReadTimeouts.has(topicId);

export const changeLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const isReadByCurrentUser = userId === authedUser.value?.id;

  if (isReadByCurrentUser && isLocalOwnReadStatusSuspended(topicId)) {
    const existingIds = queuedLocalOwnReadIds.get(topicId) || new Set<string>();
    messageIds.forEach(id => existingIds.add(id));
    queuedLocalOwnReadIds.set(topicId, existingIds);
    return;
  }

  applyLocalReadStatus(topicId, messageIds, userId);
};

export const changeFileLoadingStatus = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.map(media => {
          if (media.id !== fileId) {
            return media;
          }

          return {
            ...media,
            isLoading: false,
            uploadPercent: null
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
};

export const changeMessageStatusLocally = (
  topicId: string,
  messageId: string,
  status: MessageStatus
): void => {
  const currentMessage = getFullMessagesByTopicId(topicId).find(
    message => message.id === messageId
  );

  updateTopicMessageStores(topicId, messages =>
    messages.map(message =>
      message.id === messageId ? { ...message, status } : message
    )
  );

  if (status === MessageStatus.Wait && !hasPendingMediaUpload(currentMessage)) {
    scheduleOutgoingDeliveryTimeout(topicId, messageId);
  } else if (
    status === MessageStatus.NotDelivered ||
    status === MessageStatus.Read
  ) {
    cancelOutgoingDeliveryTimeout(topicId, messageId);
  }

  schedulePersistMessages(topicId);
};

export const setFileUploadPendingStatus = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  cancelOutgoingDeliveryTimeout(topicId, messageId);

  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.map(media => {
          if (media.id !== fileId) {
            return media;
          }

          return {
            ...media,
            isLoading: true,
            uploadError: false,
            uploadPercent: null
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
};

export const changeFileUploadPercent = (
  topicId: string,
  messageId: string,
  fileId: string,
  percent: number | null
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.map(media => {
          if (media.id !== fileId) {
            return media;
          }

          return {
            ...media,
            uploadPercent: percent
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
};

export const setUploadedFileData = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: Pick<
    IMedia,
    'path' | 'thumbnailPath' | 'originName' | 'size' | 'type' | 'ex'
  >
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.map(media => {
          if (media.id !== fileId) {
            return media;
          }

          return {
            ...media,
            ...payload,
            isLoading: false,
            uploadError: false,
            uploadPercent: null
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
};

export const changeFileUploadErrorStatus = (
  topicId: string,
  messageId: string,
  fileId: string,
  uploadError: boolean
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.map(media => {
          if (media.id !== fileId) {
            return media;
          }

          return {
            ...media,
            isLoading: false,
            uploadError,
            uploadPercent: null
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
};

export const deleteFileAfterLoading = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  updateTopicMessageStores(topicId, messages =>
    messages.map(message => {
      if (message.id !== messageId || !message.media) {
        return message;
      }

      return {
        ...message,
        media: message.media.filter(media => media.id !== fileId)
      };
    })
  );
  schedulePersistMessages(topicId);
};

export const registerPendingUploadMessage = (
  topicId: string,
  messageId: string,
  meta: { replyMessageId?: string; forwardMessageIds?: string[] }
): void => {
  pendingUploadMeta.set(getPendingUploadKey(topicId, messageId), {
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || []
  });
  void savePendingUploadMeta({
    topicId,
    messageId,
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || []
  });
};

export const getPendingUploadMessageMeta = (
  topicId: string,
  messageId: string
): Promise<{ replyMessageId?: string; forwardMessageIds: string[] } | null> => {
  const key = getPendingUploadKey(topicId, messageId);
  const cached = pendingUploadMeta.get(key);

  if (cached) {
    return Promise.resolve(cached);
  }

  return loadPendingUploadMeta(topicId, messageId).then(meta => {
    if (meta) {
      pendingUploadMeta.set(key, meta);
    }

    return meta;
  });
};

export const registerPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: { file: File; isMedia: boolean }
): void => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key) || new Map();

  messageFiles.set(fileId, payload);
  pendingUploadFiles.set(key, messageFiles);
  void savePendingUploadFile({
    topicId,
    messageId,
    fileId,
    file: payload.file,
    isMedia: payload.isMedia
  });
};

export const getPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string
): Promise<{ file: File; isMedia: boolean } | null> => {
  const key = getPendingUploadKey(topicId, messageId);
  const cached = pendingUploadFiles.get(key)?.get(fileId) || null;

  if (cached) {
    return Promise.resolve(cached);
  }

  return loadPendingUploadFile(topicId, messageId, fileId).then(file => {
    if (!file) {
      return null;
    }

    const messageFiles = pendingUploadFiles.get(key) || new Map();
    messageFiles.set(fileId, file);
    pendingUploadFiles.set(key, messageFiles);

    return file;
  });
};

export const clearPendingUploadMessage = (
  topicId: string,
  messageId: string
): void => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key);

  if (messageFiles) {
    Array.from(messageFiles.keys()).forEach(fileId => {
      void deletePendingUploadFile(topicId, messageId, fileId);
    });
  }

  pendingUploadFiles.delete(key);
  pendingUploadMeta.delete(key);
  cancelOutgoingDeliveryTimeout(topicId, messageId);
  void deletePendingUploadMeta(topicId, messageId);
};

export const suppressNotificationSoundForTopic = (
  topicId: string,
  durationMs: number
): void => {
  if (!topicId) {
    return;
  }

  notificationSoundSuppressedUntilByTopic.set(
    topicId,
    Date.now() + Math.max(0, durationMs)
  );
};

const playNotificationSoundInternal = async (
  topicId?: string
): Promise<void> => {
  const isActivelyVisible = getIsAppActivelyVisible();
  const suppressionDeadline = topicId
    ? notificationSoundSuppressedUntilByTopic.get(topicId) || 0
    : 0;

  if (topicId && isTopicMuted(topicId)) {
    return;
  }

  if (suppressionDeadline > Date.now()) {
    return;
  }

  if (isActivelyVisible && route.value.id === topicId) {
    return;
  }

  if (!(await shouldPlayNotificationSound())) {
    return;
  }

  if (await playNativeNotificationSound()) {
    return;
  }

  try {
    const audio = new Audio();
    audio.src = '/audio/new-message.mp3';
    audio.preload = 'auto';

    audio.addEventListener(
      'canplaythrough',
      () => {
        audio.play().catch(err => {
          console.warn('Failed to play notification sound:', err.message);
        });
      },
      { once: true }
    );

    audio.addEventListener(
      'error',
      e => {
        console.warn('Notification sound failed to load:', e);

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Message', {
            silent: false,
            requireInteraction: false
          });
        }
      },
      { once: true }
    );

    audio.load();
  } catch (err) {
    console.warn('Audio not supported in this browser');
  }
};

export const playNotificationSound = (topicId?: string): void => {
  void playNotificationSoundInternal(topicId);
};
