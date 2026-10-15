import { shallowReactive } from 'vue';
import {
  deleteMessageChat,
  getChatSDK,
  getHasBrowserNetwork,
  waitForChatSDK
} from './useChat';
import {
  IMedia,
  IMessage,
  IMessageRead
} from '../components/interfaces/interfaces';
import { MessageStatus, Reaction } from './useChatSDK/types';
import {
  decrementServerUnreadCount,
  getSelectedTopic,
  incrementServerUnreadCount,
  updateLocalTopicReadStatus,
  setTopicTaggedMe,
  syncTopicUnreadState,
  clearTopicReadPreview,
  cleanupFavoriteTopicSystemMessages,
  useTopics
} from '../composables/useTopics';
import { isTopicMuted } from '../composables/useTopics';
import { useGroup } from '../composables/useGroup';
import { useUrlWatcher } from '../composables/navigation';
import { authedUser, getChatAuthSession } from '../composables/useAuth';
import { takeNativeStartupHistory } from './native-startup-history';
import {
  clearCachedTopicMessages,
  loadCachedPinnedMessages,
  loadCachedTopicMessages,
  saveCachedPinnedMessages,
  savePendingUploadFile,
  loadPendingUploadFile,
  deletePendingUploadFile,
  deletePendingUploadFilesForMessage,
  savePendingUploadMeta,
  loadPendingUploadMessages,
  loadPendingUploadMeta,
  deletePendingUploadMeta
} from './useTopicMessagesCache';
import { fileToDataURL } from '../utils/fileToDataURL';
import {
  getVideoThumbnail,
  VIDEO_FALLBACK_THUMBNAIL
} from '../utils/mediaPreview';
import { MediaType } from '@pksep/zod-shared-chat';
import {
  playNativeNotificationSound,
  shouldPlayNotificationSound
} from './useNotificationSoundPolicy';
import { getIsAppActivelyVisible } from './useAppVisibility';
import {
  appendShadowSyncMetaList,
  deleteShadowTopicMessage,
  getCachedShadowReadState,
  hasCachedShadowLoadedRanges,
  hasCachedShadowReadState,
  isShadowSyncEnabled,
  loadShadowDeletedMessageIds,
  loadShadowLoadedRanges,
  loadShadowReadState,
  loadShadowTopicPreview,
  resolveShadowTopicContext,
  resolveShadowTopicPage,
  saveShadowLoadedRange,
  loadShadowTopicContext,
  loadShadowTopicSnapshot,
  recordShadowChatEvent,
  saveShadowTopicSnapshot,
  syncShadowReadStateFromMessages
} from './useShadowChatSync';
import type { ShadowReadStateValue } from './useShadowChatSync';
import { isUnreadTrackableMessageForUser } from '../utils/messageTracking';
import { compareMessages, getMessageTimestamp } from '../utils/messageOrder';
import { parseMessageEx } from '../utils/messageReplyQuote';
import { recordTopicStateTelemetry } from './topic-state-telemetry';

// Store mutations replace message payloads. Deep Vue proxies make every field
// of every cached message reactive and multiply the work of bulk merges; a
// shallow record keeps reactivity scoped to the changed topic only.
const fullMessagesStore = shallowReactive<Record<string, IMessage[]>>({});
const messagesStore = shallowReactive<Record<string, IMessage[]>>({});
const pinnedMessagesStore = shallowReactive<Record<string, IMessage[]>>({});
const MAX_ACTIVE_TOPIC_MESSAGES = 250;
const INITIAL_TOPIC_WINDOW_MESSAGES = 100;
const ACTIVE_MOBILE_APPEND_PERSIST_DELAY_MS = 1000;
const MOBILE_VIEWPORT_MAX_WIDTH = 768;
const MAX_RESIDENT_MESSAGE_TOPICS = 10;
const aroundMessageContextPrefetches = new Map<string, Promise<IMessage[]>>();
interface PendingMessagePersist {
  timeoutId: ReturnType<typeof setTimeout> | null;
  idleId: number | null;
  messages: IMessage[];
  replace: boolean;
  userId: string | undefined;
  migrateLegacyCache: boolean;
}

const pendingMessagePersists = new Map<string, PendingMessagePersist>();
let messagePersistenceBarrier: Promise<void> | null = null;

// Первый экран важнее переноса уже сохранённой истории. При уходе в фон
// flushPendingMessagePersists обходит ожидание и сохраняет новые изменения.
export const deferMessagePersistsUntil = (
  ready: Promise<void>
): (() => void) => {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => {
    release = resolve;
  });
  void ready.then(release, release);
  messagePersistenceBarrier = barrier;
  void barrier.then(() => {
    if (messagePersistenceBarrier === barrier) messagePersistenceBarrier = null;
  });
  return release;
};
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
const pendingUploadSnapshotTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const pendingUploadSnapshotGenerations = new Map<string, number>();
const pendingUploadSnapshotRevisions = new Map<string, number>();
const PENDING_UPLOAD_SNAPSHOT_PERSIST_DELAY_MS = 200;
const canonicalTopicStateIds = new Set<string>();
const hydratedResidentTopicUsers = new Map<string, string>();
const recentTopicFetches = new Map<
  string,
  {
    sdk: ReturnType<typeof getChatSDK>;
    fetchedAt: number;
    limit: number;
    complete: boolean;
  }
>();
const recentPinnedFetches = new Map<
  string,
  {
    sdk: ReturnType<typeof getChatSDK>;
    fetchedAt: number;
  }
>();
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
const deletedMessageIdsByTopic = new Map<string, Set<string>>();
const reactionOverlaysByTopic = new Map<
  string,
  Map<string, Map<string, Reaction>>
>();
const removedReactionKeysByTopic = new Map<string, Map<string, Set<string>>>();
const defaultVisibleMessagesLimitByTopic = new Map<string, number>();
const fullMessageIndexesByTopic = new Map<string, Map<string, number>>();
const topicMemoryAccessOrder = new Map<string, number>();
let topicMemoryAccessRevision = 0;

const replaceFullMessagesForTopic = (
  topicId: string,
  messages: IMessage[]
): void => {
  fullMessagesStore[topicId] = messages;
  fullMessageIndexesByTopic.set(
    topicId,
    new Map(messages.map((message, index) => [message.id, index]))
  );
};

const getFullMessageIndexesForTopic = (
  topicId: string,
  messages: IMessage[]
): Map<string, number> => {
  const existingIndexes = fullMessageIndexesByTopic.get(topicId);

  if (existingIndexes && existingIndexes.size === messages.length) {
    return existingIndexes;
  }

  const indexes = new Map(
    messages.map((message, index) => [message.id, index])
  );
  fullMessageIndexesByTopic.set(topicId, indexes);
  return indexes;
};

const route = useUrlWatcher();

const isActiveMobileTopic = (topicId: string): boolean =>
  route.value.id === topicId &&
  typeof window !== 'undefined' &&
  window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH;

const getAppendPersistDelayMs = (topicId: string): number | undefined =>
  isActiveMobileTopic(topicId)
    ? ACTIVE_MOBILE_APPEND_PERSIST_DELAY_MS
    : undefined;

const syncLocalLastMessage = (topicId: string, message?: IMessage): void => {
  const { updateLocalLastMessageTopic } = useTopics();
  const { updateLocalLastMessageGroup } = useGroup();

  updateLocalLastMessageTopic(topicId, message);
  updateLocalLastMessageGroup(topicId);
};

const markTopicStateCanonical = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  canonicalTopicStateIds.add(topicId);
};

const touchTopicMemory = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  topicMemoryAccessRevision += 1;
  topicMemoryAccessOrder.set(topicId, topicMemoryAccessRevision);
};

const cancelPendingMessagePersistSchedule = (
  pendingPersist: PendingMessagePersist
): void => {
  if (pendingPersist.timeoutId) {
    clearTimeout(pendingPersist.timeoutId);
    pendingPersist.timeoutId = null;
  }

  if (
    pendingPersist.idleId !== null &&
    typeof window !== 'undefined' &&
    'cancelIdleCallback' in window
  ) {
    window.cancelIdleCallback(pendingPersist.idleId);
    pendingPersist.idleId = null;
  }
};

const persistPendingMessageSnapshot = async (
  topicId: string,
  pendingPersist: PendingMessagePersist
): Promise<void> => {
  if (pendingMessagePersists.get(topicId) !== pendingPersist) {
    return;
  }

  cancelPendingMessagePersistSchedule(pendingPersist);
  pendingMessagePersists.delete(topicId);
  const topicMessages = prepareMessagesForPersistence(
    filterDeletedMessagesForTopic(topicId, pendingPersist.messages)
  );

  // The shadow snapshot is the canonical cache. The old topic cache remains
  // read-only as a migration fallback, avoiding two full structured clones
  // and two IndexedDB writes after every message mutation.
  const [snapshot] = await Promise.allSettled([
    saveShadowTopicSnapshot(
      topicId,
      topicMessages,
      'local',
      pendingPersist.userId,
      {
        replace: pendingPersist.replace
      }
    ),
    syncShadowReadStateFromMessages(
      topicId,
      topicMessages,
      'local',
      pendingPersist.userId
    )
  ]);
  if (
    pendingPersist.migrateLegacyCache &&
    snapshot.status === 'fulfilled' &&
    snapshot.value
  ) {
    await clearCachedTopicMessages(topicId, pendingPersist.userId);
  }
  pruneInactiveTopicMemory();
};

export const flushPendingMessagePersists = async (): Promise<void> => {
  const pendingPersists = Array.from(pendingMessagePersists.entries());

  await Promise.allSettled(
    pendingPersists.map(([topicId, pendingPersist]) =>
      persistPendingMessageSnapshot(topicId, pendingPersist)
    )
  );
};

const schedulePersistMessages = (
  topicId: string,
  delayMs = 150,
  opts?: { userId?: string; migrateLegacyCache?: boolean }
): void => {
  if (!topicId) {
    return;
  }

  const previousPersist = pendingMessagePersists.get(topicId);
  const userId =
    opts?.userId || authedUser.value?.id || getChatAuthSession()?.user?.id;

  if (previousPersist) {
    cancelPendingMessagePersistSchedule(previousPersist);
  }

  const pendingPersist: PendingMessagePersist = {
    timeoutId: null,
    idleId: null,
    messages: fullMessagesStore[topicId] || [],
    replace: canonicalTopicStateIds.has(topicId),
    userId,
    migrateLegacyCache: !!(
      opts?.migrateLegacyCache ||
      (previousPersist?.userId === userId &&
        previousPersist?.migrateLegacyCache)
    )
  };
  const queueIdlePersist = (): void => {
    if (pendingMessagePersists.get(topicId) !== pendingPersist) return;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      pendingPersist.idleId = window.requestIdleCallback(
        () => void persistPendingMessageSnapshot(topicId, pendingPersist),
        { timeout: 1200 }
      );
      return;
    }

    pendingPersist.timeoutId = setTimeout(
      () => void persistPendingMessageSnapshot(topicId, pendingPersist),
      0
    );
  };

  pendingPersist.timeoutId = setTimeout(() => {
    pendingPersist.timeoutId = null;
    if (messagePersistenceBarrier && document.visibilityState !== 'hidden') {
      void messagePersistenceBarrier.then(queueIdlePersist);
    } else {
      queueIdlePersist();
    }
  }, delayMs);
  pendingMessagePersists.set(topicId, pendingPersist);
};

if (typeof window !== 'undefined') {
  const flushPendingSnapshots = (): void => {
    void flushPendingMessagePersists();
  };

  window.addEventListener('pagehide', flushPendingSnapshots);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingSnapshots();
    }
  });
}

const hasUnfinishedRuntimeMessages = (topicId: string): boolean =>
  (fullMessagesStore[topicId] || []).some(
    message =>
      message.status === MessageStatus.Wait ||
      message.status === MessageStatus.NotDelivered ||
      message.media?.some(media => media.isLoading || media.uploadError)
  );

const pruneInactiveTopicMemory = (): void => {
  const residentTopicIds = Array.from(
    new Set([...Object.keys(fullMessagesStore), ...Object.keys(messagesStore)])
  );
  let removableCount = residentTopicIds.length - MAX_RESIDENT_MESSAGE_TOPICS;

  if (removableCount <= 0) {
    return;
  }

  const activeTopicId = route.value.id;
  const evictionCandidates = residentTopicIds
    .filter(
      topicId =>
        topicId !== activeTopicId &&
        !pendingMessagePersists.has(topicId) &&
        !hasUnfinishedRuntimeMessages(topicId)
    )
    .sort(
      (left, right) =>
        (topicMemoryAccessOrder.get(left) || 0) -
        (topicMemoryAccessOrder.get(right) || 0)
    );

  for (const topicId of evictionCandidates) {
    if (removableCount <= 0) {
      break;
    }

    // Pending persistence owns its immutable array snapshot, so resident Vue
    // state can be released without dropping the IndexedDB write.
    delete fullMessagesStore[topicId];
    delete messagesStore[topicId];
    fullMessageIndexesByTopic.delete(topicId);
    canonicalTopicStateIds.delete(topicId);
    hydratedResidentTopicUsers.delete(topicId);
    recentTopicFetches.delete(topicId);
    recentPinnedFetches.delete(topicId);
    defaultVisibleMessagesLimitByTopic.delete(topicId);
    topicMemoryAccessOrder.delete(topicId);
    removableCount -= 1;
  }
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

const getMessageVersionTimestamp = (message: IMessage): number => {
  const timestamps = [message.updatedAt, message.deletedAt, message.createdAt]
    .map(value => (value ? new Date(value).getTime() : 0))
    .filter(value => !Number.isNaN(value));

  return Math.max(0, ...timestamps);
};

const getPendingUploadKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const getDelayedOutgoingKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const getOutgoingDeliveryKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const hasClientId = (message: IMessage): boolean => {
  const parsedEx = parseMessageEx(message.ex);
  return typeof parsedEx?.clientId === 'string' && parsedEx.clientId.length > 0;
};

const getClientId = (message: IMessage): string | null => {
  const parsedEx = parseMessageEx(message.ex);
  return typeof parsedEx?.clientId === 'string' ? parsedEx.clientId : null;
};

const rememberDeletedMessageId = (topicId: string, messageId: string): void => {
  if (!topicId || !messageId) {
    return;
  }

  const deletedIds = deletedMessageIdsByTopic.get(topicId) || new Set<string>();
  deletedIds.add(messageId);
  deletedMessageIdsByTopic.set(topicId, deletedIds);
};

const getReactionKey = (reaction?: Reaction, fallbackId?: string): string => {
  if (reaction?.id) {
    return reaction.id;
  }

  if (fallbackId) {
    return fallbackId;
  }

  if (reaction?.senderUserId && reaction?.text) {
    return `${reaction.senderUserId}:${reaction.text}`;
  }

  return '';
};

const getTopicMessageReactionOverlays = (
  topicId: string,
  messageId: string
): Map<string, Reaction> | undefined =>
  reactionOverlaysByTopic.get(topicId)?.get(messageId);

const getTopicMessageRemovedReactionKeys = (
  topicId: string,
  messageId: string
): Set<string> | undefined =>
  removedReactionKeysByTopic.get(topicId)?.get(messageId);

const clearReactionOverlayForMessage = (
  topicId: string,
  messageId: string
): void => {
  reactionOverlaysByTopic.get(topicId)?.delete(messageId);
  removedReactionKeysByTopic.get(topicId)?.delete(messageId);
};

const recordReactionOverlay = (
  topicId: string,
  messageId: string,
  action: string,
  reaction?: Reaction,
  reactionId?: string
): void => {
  if (!topicId || !messageId) {
    return;
  }

  const reactionKey = getReactionKey(reaction, reactionId);

  if (!reactionKey) {
    return;
  }

  let topicOverlays = reactionOverlaysByTopic.get(topicId);
  if (!topicOverlays) {
    topicOverlays = new Map();
    reactionOverlaysByTopic.set(topicId, topicOverlays);
  }

  let messageOverlays = topicOverlays.get(messageId);
  if (!messageOverlays) {
    messageOverlays = new Map();
    topicOverlays.set(messageId, messageOverlays);
  }

  let topicRemovedKeys = removedReactionKeysByTopic.get(topicId);
  if (!topicRemovedKeys) {
    topicRemovedKeys = new Map();
    removedReactionKeysByTopic.set(topicId, topicRemovedKeys);
  }

  let messageRemovedKeys = topicRemovedKeys.get(messageId);
  if (!messageRemovedKeys) {
    messageRemovedKeys = new Set();
    topicRemovedKeys.set(messageId, messageRemovedKeys);
  }

  if (action === 'removed') {
    messageOverlays.delete(reactionKey);
    messageRemovedKeys.add(reactionKey);
    return;
  }

  if (!reaction) {
    return;
  }

  messageRemovedKeys.delete(reactionKey);
  messageOverlays.set(reactionKey, reaction);
};

const isReactionMatchedByOverlay = (
  currentReaction: Reaction,
  overlayReaction: Reaction,
  overlayKey: string
): boolean =>
  getReactionKey(currentReaction) === overlayKey ||
  (!!currentReaction.senderUserId &&
    !!overlayReaction.senderUserId &&
    currentReaction.senderUserId === overlayReaction.senderUserId &&
    currentReaction.text === overlayReaction.text);

const applyReactionOverlayToMessage = (
  topicId: string,
  message: IMessage
): IMessage => {
  const messageOverlays = getTopicMessageReactionOverlays(topicId, message.id);
  const removedReactionKeys = getTopicMessageRemovedReactionKeys(
    topicId,
    message.id
  );

  if (!messageOverlays?.size && !removedReactionKeys?.size) {
    return message;
  }

  let reactions = [...(message.reactions || [])].filter(reaction => {
    const reactionKey = getReactionKey(reaction);
    return !reactionKey || !removedReactionKeys?.has(reactionKey);
  });

  messageOverlays?.forEach((overlayReaction, overlayKey) => {
    reactions = reactions.filter(
      reaction =>
        !isReactionMatchedByOverlay(reaction, overlayReaction, overlayKey)
    );
    reactions.push(overlayReaction);
  });

  return {
    ...message,
    reactions
  };
};

const applyReactionOverlaysToMessages = (
  topicId: string,
  messages: IMessage[]
): IMessage[] =>
  messages.map(message => applyReactionOverlayToMessage(topicId, message));

const rememberPersistedDeletedMessageIds = async (
  topicId: string,
  userId?: string
): Promise<void> => {
  if (!topicId || !isShadowSyncEnabled()) {
    return;
  }

  const deletedIds = await loadShadowDeletedMessageIds(topicId, userId);

  if (!deletedIds.size) {
    return;
  }

  const currentIds = deletedMessageIdsByTopic.get(topicId) || new Set<string>();
  deletedIds.forEach(messageId => currentIds.add(messageId));
  deletedMessageIdsByTopic.set(topicId, currentIds);
};

const filterDeletedMessagesForTopic = (
  topicId: string,
  messages: IMessage[]
): IMessage[] => {
  const deletedIds = deletedMessageIdsByTopic.get(topicId);

  if (!deletedIds?.size) {
    return messages;
  }

  return messages.filter(message => !reconcileDeletedMessage(topicId, message));
};

const isDeletedMessageForTopic = (
  topicId: string,
  message: IMessage
): boolean => {
  const deletedIds = deletedMessageIdsByTopic.get(topicId);
  if (deletedIds?.has(message.id)) return true;

  const clientId =
    message.senderUserId === authedUser.value?.id ? getClientId(message) : null;
  return !!clientId && !!deletedIds?.has(clientId);
};

export const reconcileDeletedMessage = (
  topicId: string,
  message: IMessage
): boolean => {
  if (!isDeletedMessageForTopic(topicId, message)) return false;
  if (deletedMessageIdsByTopic.get(topicId)?.has(message.id)) return true;

  // Отменённая отправка может подтвердиться уже после выхода из топика с новым ID.
  rememberDeletedMessageId(topicId, message.id);
  void deleteMessageChat({ topicId, messageId: message.id });
  return true;
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
  anchorMessageId?: string,
  windowLimit?: number
): IMessage[] => {
  const uiWindowLimit =
    windowLimit ??
    (mode === 'latest'
      ? INITIAL_TOPIC_WINDOW_MESSAGES
      : MAX_ACTIVE_TOPIC_MESSAGES);

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

const getDefaultVisibleMessagesLimitForSave = (
  topicId: string,
  mode: MessageWindowMode = 'latest',
  visibleLimit?: number
): number | undefined => {
  if (visibleLimit !== undefined) {
    return visibleLimit;
  }

  if (mode !== 'latest' && mode !== 'preserve-end') {
    return undefined;
  }

  return defaultVisibleMessagesLimitByTopic.get(topicId);
};

export const setDefaultVisibleMessagesLimitForTopic = (
  topicId: string,
  visibleLimit?: number
): void => {
  if (!topicId) {
    return;
  }

  if (!visibleLimit || visibleLimit <= 0) {
    defaultVisibleMessagesLimitByTopic.delete(topicId);
    return;
  }

  defaultVisibleMessagesLimitByTopic.set(topicId, visibleLimit);
};

const getNonShrinkingVisibleLimit = (
  topicId: string,
  requestedLimit?: number,
  isPaginationRequest = false,
  allowShrink = false
): number | undefined => {
  if (!requestedLimit || isPaginationRequest || allowShrink) {
    return requestedLimit;
  }

  return Math.max(requestedLimit, getMessagesByTopicId(topicId).length);
};

const stripRuntimeMediaState = (message: IMessage): IMessage => {
  if (
    !message.media?.some(
      media =>
        media.localPath !== undefined || media.localThumbnailPath !== undefined
    )
  )
    return message;
  return {
    ...message,
    media: message.media.map(media =>
      media.localPath !== undefined || media.localThumbnailPath !== undefined
        ? { ...media, localPath: undefined, localThumbnailPath: undefined }
        : media
    )
  };
};

const prepareMessagesForPersistence = (messages: IMessage[]): IMessage[] =>
  messages.map(stripRuntimeMediaState);

const restorePendingUploadMediaState = async (
  topicId: string,
  messages: IMessage[]
): Promise<IMessage[]> => {
  let restored = messages;
  const pending: Promise<void>[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (!message.media?.some(media => media.isLoading || media.uploadError)) {
      continue;
    }
    if (restored === messages) restored = messages.slice();
    pending.push(
      restoreMessagePendingUploadMediaState(topicId, message).then(result => {
        restored[index] = result;
      })
    );
  }
  if (pending.length) await Promise.all(pending);
  return restored;
};

const restoreMessagePendingUploadMediaState = async (
  topicId: string,
  message: IMessage
): Promise<IMessage> => {
  let hadInterruptedUpload = false;

  const restoredMedia = await Promise.all(
    message.media.map(async media => {
      // Normal remote media never has a pending local file. Avoid one
      // IndexedDB transaction per image while hydrating long histories.
      if (!media.isLoading && !media.uploadError) {
        return media;
      }

      // Show an interrupted upload immediately with its persisted percent.
      // The sender retry loop waits for the service worker/OPFS file in the
      // background, so a very early refresh never blocks the whole history.
      if (media.isLoading) {
        hadInterruptedUpload = true;
        return {
          ...media,
          isLoading: true,
          uploadError: true
        };
      }

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
          (await getVideoThumbnail(pendingFile.file)) ||
          VIDEO_FALLBACK_THUMBNAIL;
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
        uploadError: media.isLoading ? true : media.uploadError
      };
    })
  );

  return {
    ...message,
    status: hadInterruptedUpload ? MessageStatus.Wait : message.status,
    media: restoredMedia
  };
};

const dedupeMessagesForTopic = (messages: IMessage[]): IMessage[] => {
  const byStableKey = new Map<string, IMessage>();

  messages.forEach(message => {
    const stableKey = getClientId(message) || message.id;

    if (stableKey) {
      const existingMessage = byStableKey.get(stableKey);

      if (
        !existingMessage ||
        getMessageVersionTimestamp(message) >=
          getMessageVersionTimestamp(existingMessage)
      ) {
        byStableKey.set(stableKey, message);
      }
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
  const existingFullMessages = fullMessagesStore[topicId] || [];
  const existingVisibleMessages = messagesStore[topicId] || [];
  const nextFullMessages = applyReactionOverlaysToMessages(
    topicId,
    [...transform([...existingFullMessages])].sort(compareMessages)
  );
  const nextVisibleMessages = applyReactionOverlaysToMessages(
    topicId,
    [...transform([...existingVisibleMessages])].sort(compareMessages)
  );

  replaceFullMessagesForTopic(topicId, nextFullMessages);
  messagesStore[topicId] = nextVisibleMessages;
  touchTopicMemory(topicId);
  pruneInactiveTopicMemory();

  return nextFullMessages;
};

const applyShadowReadStateToMessages = async (
  topicId: string,
  messages: IMessage[],
  userId = authedUser.value?.id,
  loadedReadState?: ShadowReadStateValue | null
): Promise<IMessage[]> => {
  if (!topicId || !userId || messages.length === 0) {
    return messages;
  }

  const readState =
    loadedReadState === undefined
      ? await loadShadowReadState(topicId, userId)
      : loadedReadState;

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

export const MOBILE_NOTIFICATION_HISTORY_LIMIT = 72;
type ReadyChatSDK = NonNullable<ReturnType<typeof getChatSDK>>;
type NotificationHistoryResult =
  | { ok: true; messages: Awaited<ReturnType<ReadyChatSDK['getMessages']>> }
  | { ok: false; error: unknown };
let prefetchedNotificationHistory: {
  sdk: ReadyChatSDK;
  topicId: string;
  messageId: string;
  startedAt: number;
  result: Promise<NotificationHistoryResult>;
} | null = null;

export const prefetchNotificationHistory = (
  topicId: string,
  messageId: string
): void => {
  const sdk = getChatSDK();
  if (!sdk || !topicId || !messageId || !getHasBrowserNetwork()) return;
  prefetchedNotificationHistory = {
    sdk,
    topicId,
    messageId,
    startedAt: Date.now(),
    result: takeNativeStartupHistory<
      Awaited<ReturnType<ReadyChatSDK['getMessages']>>
    >(topicId)
      .then(
        messages =>
          messages ??
          sdk.getMessages(topicId, {
            limit: MOBILE_NOTIFICATION_HISTORY_LIMIT,
            newMessages: true,
            fresh: true
          })
      )
      .then(
        messages => ({ ok: true as const, messages }),
        error => ({ ok: false as const, error })
      )
  };
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
    notificationMessageId?: string;
    visibleLimit?: number;
    updateVisible?: boolean;
    revealIfEmpty?: boolean;
    allowVisibleShrink?: boolean;
    skipShadowSnapshot?: boolean;
    allowStaleFallback?: boolean;
    onNetworkApplied?: () => void;
    maxAgeMs?: number;
  }
): Promise<IMessage[]> => {
  try {
    if (!topicId) return [];

    const metadataReady = Promise.all([
      ensureShadowReadStateLoaded(topicId),
      ensureShadowLoadedRangesLoaded(topicId),
      rememberPersistedDeletedMessageIds(topicId)
    ]);
    const existingMessages = getFullMessagesByTopicId(topicId);
    const isPaginationRequest = Boolean(
      opts?.lastMessageId || opts?.afterMessageId || opts?.newMessages
    );
    const direction = getHistoryDirection(opts);
    const recentFetch = recentTopicFetches.get(topicId);
    const lastMessage = getSelectedTopic(topicId)?.lastMessage;
    const localLastMessage = lastMessage
      ? getClientMessageById(topicId, lastMessage.id)
      : undefined;
    const hasCurrentPreview =
      !lastMessage ||
      (localLastMessage &&
        new Date(
          localLastMessage.updatedAt || localLastMessage.createdAt
        ).getTime() >=
          new Date(lastMessage.updatedAt || lastMessage.createdAt).getTime());

    if (
      !isPaginationRequest &&
      opts?.maxAgeMs &&
      recentFetch?.sdk === getChatSDK() &&
      Date.now() - recentFetch.fetchedAt < opts.maxAgeMs &&
      canonicalTopicStateIds.has(topicId) &&
      hasCurrentPreview &&
      (recentFetch.complete || recentFetch.limit >= (opts.limit || 50))
    ) {
      await metadataReady;
      return existingMessages.slice(-(opts.limit || 50));
    }

    // Запрос выбранного чата не ждёт IndexedDB. Ошибку удерживаем до await,
    // а метаданные применяем до сохранения ответа и проверки удалений.
    let requestSdk = getChatSDK();
    const earlyRequest =
      opts?.forceRefresh && opts?.forceNetwork && getHasBrowserNetwork()
        ? (async () => {
            requestSdk ||= await waitForChatSDK();
            if (!requestSdk) return null;
            const prefetched = prefetchedNotificationHistory;
            if (
              prefetched &&
              opts.notificationMessageId &&
              prefetched.sdk === requestSdk &&
              prefetched.topicId === topicId &&
              prefetched.messageId === opts.notificationMessageId &&
              opts.newMessages &&
              !opts.lastMessageId &&
              !opts.afterMessageId &&
              opts.limit === MOBILE_NOTIFICATION_HISTORY_LIMIT &&
              Date.now() - prefetched.startedAt < 30_000
            ) {
              prefetchedNotificationHistory = null;
              const result = await prefetched.result;
              if (result.ok === false) throw result.error;
              return result.messages;
            }
            return requestSdk.getMessages(topicId, {
              limit: opts.limit,
              lastMessageId: opts.lastMessageId,
              afterMessageId: opts.afterMessageId,
              newMessages: opts.newMessages,
              fresh: !!opts.notificationMessageId
            });
          })().then(
            messages => ({ ok: true as const, messages }),
            error => ({ ok: false as const, error })
          )
        : null;
    await metadataReady;

    if (!getHasBrowserNetwork()) {
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
                windowMode: getWindowModeForFetch(opts),
                visibleLimit: getNonShrinkingVisibleLimit(
                  topicId,
                  opts?.visibleLimit,
                  isPaginationRequest,
                  opts?.allowVisibleShrink
                ),
                updateVisible: opts?.updateVisible
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

    if (isShadowSyncEnabled() && !opts?.forceRefresh && !opts?.forceNetwork) {
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
              windowMode: getWindowModeForFetch(opts),
              visibleLimit: getNonShrinkingVisibleLimit(
                topicId,
                opts?.visibleLimit,
                isPaginationRequest,
                opts?.allowVisibleShrink
              ),
              updateVisible: opts?.updateVisible
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

    let sdk = getChatSDK();

    if (!sdk && opts?.forceNetwork) {
      sdk = await waitForChatSDK();
    }

    if (!sdk) {
      return opts?.allowStaleFallback === false ? [] : existingMessages;
    }

    const earlyResult = await earlyRequest;
    if (earlyRequest && requestSdk !== getChatSDK()) return [];
    if (earlyResult?.ok === false) throw earlyResult.error;
    const messages = normalizePaginationResult(
      earlyResult?.ok === true && earlyResult.messages
        ? earlyResult.messages
        : await sdk.getMessages(topicId, {
            limit: opts?.limit,
            lastMessageId: opts?.lastMessageId,
            afterMessageId: opts?.afterMessageId,
            newMessages: opts?.newMessages,
            fresh: !!opts?.notificationMessageId
          }),
      opts
    );
    cleanupFavoriteTopicSystemMessages(getSelectedTopic(topicId), messages);

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
    if (!opts?.skipShadowSnapshot) {
      void saveShadowTopicSnapshot(topicId, messages, 'http');
    }
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
      const unique = dedupeMessagesForTopic(combined);
      const existingVisible = getMessagesByTopicId(topicId);
      const visibleMessages = opts?.lastMessageId
        ? dedupeMessagesForTopic([...messages, ...existingVisible])
        : opts?.afterMessageId
          ? dedupeMessagesForTopic([...existingVisible, ...messages])
          : dedupeMessagesForTopic([
              ...existingVisible,
              ...mergeWithPendingOutgoingMessages(messages, existingVisible)
            ]);

      saveMessagesToLocal(topicId, unique, {
        syncLastMessage: opts?.syncLastMessage ?? false,
        windowMode: getWindowModeForFetch(opts),
        visibleMessages,
        visibleLimit: getNonShrinkingVisibleLimit(
          topicId,
          opts?.visibleLimit,
          isPaginationRequest,
          opts?.allowVisibleShrink
        ),
        updateVisible:
          opts?.revealIfEmpty && existingVisible.length === 0
            ? true
            : opts?.updateVisible
      });
    }

    if (!isPaginationRequest) {
      markTopicStateCanonical(topicId);
      if (!opts?.skipSave) {
        recentTopicFetches.set(topicId, {
          sdk,
          fetchedAt: Date.now(),
          limit: opts?.limit || 50,
          complete: messages.length < (opts?.limit || 50)
        });
      }
    }

    opts?.onNetworkApplied?.();
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

    if (opts?.allowStaleFallback === false) {
      return [];
    }

    const existingMessages = getFullMessagesByTopicId(topicId);
    if (existingMessages.length > 0) {
      return existingMessages;
    }

    return hydrateMessagesFromCache(topicId);
  }
};

export const fetchPinnedMessagesForTopic = async (
  topicId: string = route.value.id,
  opts?: { maxAgeMs?: number }
): Promise<IMessage[]> => {
  if (!topicId) return [];

  const recentFetch = recentPinnedFetches.get(topicId);
  if (
    opts?.maxAgeMs &&
    recentFetch?.sdk === getChatSDK() &&
    Date.now() - recentFetch.fetchedAt < opts.maxAgeMs
  ) {
    return getPinnedMessagesByTopicId(topicId);
  }

  const cachedMessages = pinnedMessagesStore[topicId]
    ? null
    : await loadCachedPinnedMessages(topicId);

  if (cachedMessages) {
    savePinnedMessagesToLocal(topicId, cachedMessages, {
      skipCache: true
    });
  }

  try {
    const sdk = getChatSDK();
    if (!sdk) return getPinnedMessagesByTopicId(topicId);
    const messages = await sdk.getPinnedMessages(topicId);

    savePinnedMessagesToLocal(topicId, messages);
    recentPinnedFetches.set(topicId, { sdk, fetchedAt: Date.now() });

    return messages;
  } catch (error) {
    console.warn('Failed to fetch pinned message history:', error);
    return getPinnedMessagesByTopicId(topicId);
  }
};

export const fetchAroundMessage = async (
  messageId: string,
  topicId: string = route.value.id,
  opts?: { updateVisible?: boolean; forceNetwork?: boolean }
): Promise<IMessage[]> => {
  try {
    if (!messageId) return;

    await ensureShadowLoadedRangesLoaded(topicId);

    if (isShadowSyncEnabled() && !opts?.forceNetwork) {
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
          anchorMessageId: messageId,
          updateVisible: opts?.updateVisible
        });

        return normalizedShadowMessages;
      }
    }

    let sdk = getChatSDK();

    if (!sdk && opts?.forceNetwork) {
      sdk = await waitForChatSDK();
    }

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
      anchorMessageId: messageId,
      updateVisible: opts?.updateVisible
    });

    return messages;
  } catch (error) {
    console.warn('Failed to fetch around message:', error);
    return [];
  }
};

export const prefetchAroundMessageContext = (
  messageId: string,
  topicId: string = route.value.id
): Promise<IMessage[]> => {
  if (!messageId || !topicId) {
    return Promise.resolve([]);
  }

  if (
    getFullMessagesByTopicId(topicId).some(message => message.id === messageId)
  ) {
    return Promise.resolve([]);
  }

  const requestKey = `${topicId}:${messageId}`;
  const existingRequest = aroundMessageContextPrefetches.get(requestKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchAroundMessage(messageId, topicId, {
    updateVisible: false
  }).finally(() => {
    aroundMessageContextPrefetches.delete(requestKey);
  });

  aroundMessageContextPrefetches.set(requestKey, request);

  return request;
};

export const addMessageToLocal = (topicId: string, message: IMessage): void => {
  if (reconcileDeletedMessage(topicId, message)) {
    return;
  }

  const existingMessages = getFullMessagesByTopicId(topicId);
  const alreadyExists = existingMessages.some(item => item.id === message.id);
  const shouldUpdateVisibleWindow = topicId === route.value.id;

  const parsedEx = parseMessageEx(message.ex);
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
      updateVisible: shouldUpdateVisibleWindow,
      persistDelayMs: getAppendPersistDelayMs(topicId)
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
    schedulePersistMessages(topicId, getAppendPersistDelayMs(topicId));
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
    updateVisible: shouldUpdateVisibleWindow,
    persistDelayMs: getAppendPersistDelayMs(topicId)
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
  const message = getClientMessageById(topicId, messageId);
  const clientId =
    message && message.senderUserId === authedUser.value?.id
      ? getClientId(message)
      : null;
  if (clientId && clientId !== messageId) {
    rememberDeletedMessageId(topicId, clientId);
    clearPendingUploadMessage(topicId, clientId);
    cancelDelayedOutgoingMessage(topicId, clientId);
    cancelOutgoingDeliveryTimeout(topicId, clientId);
    void deleteShadowTopicMessage(topicId, clientId);
  }
  rememberDeletedMessageId(topicId, messageId);
  clearReactionOverlayForMessage(topicId, messageId);
  updateTopicMessageStores(topicId, messages =>
    messages.filter(
      message => message.id !== messageId && message.id !== clientId
    )
  );
  schedulePersistMessages(topicId);
  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId);
  savePinnedMessagesToLocal(
    topicId,
    (pinnedMessagesStore[topicId] || []).filter(
      message => message.id !== messageId
    )
  );

  clearPendingUploadMessage(topicId, messageId);
  cancelDelayedOutgoingMessage(topicId, messageId);
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
      const pinnedMessages = pinnedMessagesStore[topicId] || [];
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
    } else if (message.text !== msg.text) {
      isEdit = message.isEdit ?? true;
    } else if ('isEdit' in message) {
      isEdit = message.isEdit ?? isEdit;
    }

    return {
      ...msg,
      ...message,
      ...('isPinnedForAll' in message
        ? { isPinnedForAll: message.isPinnedForAll }
        : {}),
      ...('isPinnedForMe' in message
        ? { isPinnedForMe: message.isPinnedForMe }
        : {}),
      ...('isPinnedOnlyMe' in message
        ? { isPinnedOnlyMe: message.isPinnedOnlyMe }
        : {}),
      media: message.media ?? msg.media,
      reactions: message.reactions ?? msg.reactions,
      replyMessage: message.replyMessage ?? msg.replyMessage,
      senderUser: message.senderUser ?? msg.senderUser,
      forwardUser: message.forwardUser ?? msg.forwardUser,
      text: 'text' in message ? message.text : msg.text,
      isPin: 'isPin' in message ? message.isPin : msg.isPin,
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
  recordReactionOverlay(topicId, messageId, action, reaction, reactionId);
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
    visibleLimit?: number;
    updateVisible?: boolean;
    persistDelayMs?: number;
    skipPersist?: boolean;
  }
): void => {
  const filteredMessages = filterDeletedMessagesForTopic(topicId, messages);
  const windowMode = opts?.windowMode || 'latest';
  const visibleLimit = getDefaultVisibleMessagesLimitForSave(
    topicId,
    windowMode,
    opts?.visibleLimit
  );

  if (opts?.visibleLimit !== undefined && visibleLimit !== undefined) {
    defaultVisibleMessagesLimitByTopic.set(topicId, visibleLimit);
  }
  const sortedMessages = applyReactionOverlaysToMessages(
    topicId,
    dedupeMessagesForTopic(filteredMessages).sort(compareMessages)
  );
  const visibleSource = opts?.visibleMessages
    ? applyReactionOverlaysToMessages(
        topicId,
        dedupeMessagesForTopic(
          filterDeletedMessagesForTopic(topicId, opts.visibleMessages)
        ).sort(compareMessages)
      )
    : sortedMessages;
  const boundedMessages = clampMessagesForUi(
    visibleSource,
    windowMode,
    opts?.anchorMessageId,
    visibleLimit
  );

  replaceFullMessagesForTopic(topicId, sortedMessages);
  if (opts?.updateVisible !== false) {
    messagesStore[topicId] = boundedMessages;
  }
  touchTopicMemory(topicId);
  if (!opts?.skipPersist) {
    schedulePersistMessages(topicId, opts?.persistDelayMs);
  }
  pruneInactiveTopicMemory();
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
  recentTopicFetches.delete(topicId);
  recentPinnedFetches.delete(topicId);
  hydratedResidentTopicUsers.delete(topicId);
  if (!topicId) {
    return;
  }

  canonicalTopicStateIds.add(topicId);
  saveMessagesToLocal(topicId, [], {
    syncLastMessage: opts?.syncLastMessage ?? false
  });
  savePinnedMessagesToLocal(topicId, []);
  void clearCachedTopicMessages(topicId);
  void saveShadowTopicSnapshot(topicId, [], 'local', undefined, {
    replace: true
  });
  canonicalTopicStateIds.delete(topicId);
};

export const getFullMessagesByTopicId = (topicId: string): IMessage[] => {
  touchTopicMemory(topicId);
  return fullMessagesStore[topicId] || [];
};

export const getTopicIdsWithMessages = (): string[] =>
  Object.keys(fullMessagesStore);

export const getMessagesByTopicId = (topicId: string): IMessage[] => {
  touchTopicMemory(topicId);
  return messagesStore[topicId] || [];
};

export const getClientMessageById = (
  topicId?: string,
  messageId?: string
): IMessage | undefined => {
  if (!topicId || !messageId) {
    return undefined;
  }

  const messageIndex = fullMessageIndexesByTopic.get(topicId)?.get(messageId);

  return messageIndex === undefined
    ? undefined
    : fullMessagesStore[topicId]?.[messageIndex];
};

export const hasKnownTopicMessagesState = (topicId: string): boolean => {
  if (!topicId) {
    return false;
  }

  return (
    canonicalTopicStateIds.has(topicId) ||
    getMessagesByTopicId(topicId).length > 0 ||
    getFullMessagesByTopicId(topicId).length > 0
  );
};

export const getTopicMessagePreview = (topicId: string): IMessage | null => {
  const topic = getSelectedTopic(topicId);
  const message = topic?.lastMessage;
  if (
    !message?.id ||
    message.deletedAt ||
    (message.topicId && message.topicId !== topicId) ||
    isDeletedMessageForTopic(topicId, message) ||
    canonicalTopicStateIds.has(topicId)
  )
    return null;

  const senderUser =
    message.senderUser ||
    topic?.members?.find(member => member.id === message.senderUserId) ||
    (topic?.user?.id === message.senderUserId ? topic.user : undefined);

  // Превью уже получено со списком топиков. Оно не становится кешем истории.
  // Участник группы дополняет автора без HTTP, пока открывается полный снимок.
  return senderUser === message.senderUser
    ? message
    : { ...message, senderUser };
};

export const setVisibleMessagesLimitForTopic = (
  topicId: string,
  visibleLimit: number,
  opts?: { allowShrink?: boolean }
): IMessage[] => {
  if (!topicId || visibleLimit <= 0) {
    return [];
  }

  const fullMessages = getFullMessagesByTopicId(topicId);
  const visibleMessages = getMessagesByTopicId(topicId);
  const sourceMessages = fullMessages.length ? fullMessages : visibleMessages;

  if (!sourceMessages.length) {
    return [];
  }

  // A visible topic must never lose already mounted messages as a side effect
  // of a late cache/network bootstrap. Shrinking the DOM while the user is
  // scrolling changes scrollHeight by thousands of pixels and can leave the
  // compositor painting an empty part of the scrollport. Callers that really
  // need to release a window must opt in explicitly.
  const nextVisibleLimit =
    opts?.allowShrink === true
      ? visibleLimit
      : Math.max(visibleLimit, visibleMessages.length);
  let nextVisibleMessages: IMessage[];

  if (opts?.allowShrink === true || visibleMessages.length === 0) {
    nextVisibleMessages = clampMessagesForUi(
      sourceMessages,
      'latest',
      undefined,
      nextVisibleLimit
    );
  } else {
    const sourceIndexById = fullMessages.length
      ? getFullMessageIndexesForTopic(topicId, fullMessages)
      : new Map(sourceMessages.map((message, index) => [message.id, index]));
    const visibleIndexes = visibleMessages.map(message =>
      sourceIndexById.get(message.id)
    );
    const hasContiguousVisibleRange = visibleIndexes.every(
      (index, position) =>
        index !== undefined &&
        (position === 0 ||
          index === (visibleIndexes[position - 1] as number) + 1)
    );

    if (!hasContiguousVisibleRange) {
      nextVisibleMessages = visibleMessages;
    } else {
      let startIndex = visibleIndexes[0] as number;
      let endIndex = (visibleIndexes.at(-1) as number) + 1;
      let remaining = Math.max(0, nextVisibleLimit - (endIndex - startIndex));
      const appendCount = Math.min(
        sourceMessages.length - endIndex,
        Math.ceil(remaining / 2)
      );

      endIndex += appendCount;
      remaining -= appendCount;

      const prependCount = Math.min(startIndex, remaining);
      startIndex -= prependCount;
      remaining -= prependCount;
      endIndex = Math.min(sourceMessages.length, endIndex + remaining);
      nextVisibleMessages = sourceMessages.slice(startIndex, endIndex);
    }
  }

  defaultVisibleMessagesLimitByTopic.set(topicId, nextVisibleLimit);
  if (
    nextVisibleMessages.length === visibleMessages.length &&
    nextVisibleMessages.every(
      (message, index) => message === visibleMessages[index]
    )
  ) {
    return visibleMessages;
  }
  messagesStore[topicId] = nextVisibleMessages;
  touchTopicMemory(topicId);

  return nextVisibleMessages;
};

const messageHydrationsInFlight = new Map<string, Promise<IMessage[]>>();
const pendingMessageHydrationsInFlight = new Map<string, Promise<IMessage[]>>();

export const hydratePendingMessagesFromCache = (
  topicId: string,
  userId = authedUser.value?.id || getChatAuthSession()?.user?.id || '',
  visibleLimit = 48
): Promise<IMessage[]> => {
  const key = JSON.stringify([userId, topicId]);
  const existing = pendingMessageHydrationsInFlight.get(key);
  if (existing) return existing;
  const hydration = (async () => {
    // При свежем HTTP читаем только локальные изменения, без старой истории.
    const [pending] = await Promise.all([
      loadPendingUploadMessages(topicId, userId, async missingIds => {
        // Текст мог сохраниться в истории до обновления отдельной записи outbox.
        const [shadow, legacy] = await Promise.all([
          loadShadowTopicSnapshot(topicId, userId),
          loadCachedTopicMessages(topicId, userId)
        ]);
        const missing = new Set(missingIds);
        return dedupeMessagesForTopic([...legacy, ...shadow]).filter(
          message =>
            missing.has(message.id) && isPendingOutgoingMessage(message)
        );
      }),
      rememberPersistedDeletedMessageIds(topicId, userId),
      loadShadowReadState(topicId, userId)
    ]);
    if (
      (authedUser.value?.id || getChatAuthSession()?.user?.id || '') !== userId
    )
      return [];
    if (pending.length) {
      const messages = await restorePendingUploadMediaState(topicId, pending);
      if (
        (authedUser.value?.id || getChatAuthSession()?.user?.id || '') !==
        userId
      )
        return [];
      saveMessagesToLocal(
        topicId,
        prepareMessagesForPersistence(
          dedupeMessagesForTopic([
            ...messages,
            ...getFullMessagesByTopicId(topicId)
          ])
        ),
        {
          syncLastMessage: false,
          windowMode: 'latest',
          visibleLimit,
          skipPersist: true
        }
      );
    }
    return getMessagesByTopicId(topicId);
  })().finally(() => pendingMessageHydrationsInFlight.delete(key));
  pendingMessageHydrationsInFlight.set(key, hydration);
  return hydration;
};

export const hydrateMessagesFromCache = async (
  topicId: string,
  userId?: string,
  opts?: { visibleLimit?: number; allowVisibleShrink?: boolean }
): Promise<IMessage[]> => {
  const resolvedUserId =
    userId || authedUser.value?.id || getChatAuthSession()?.user?.id || '';
  if (
    topicId &&
    hydratedResidentTopicUsers.get(topicId) === resolvedUserId &&
    canonicalTopicStateIds.has(topicId)
  ) {
    if (opts?.visibleLimit) {
      return setVisibleMessagesLimitForTopic(topicId, opts.visibleLimit, {
        allowShrink: opts.allowVisibleShrink
      });
    }
    return getMessagesByTopicId(topicId);
  }

  const hydrationKey = JSON.stringify([resolvedUserId, topicId]);
  let hydration = messageHydrationsInFlight.get(hydrationKey);
  if (!hydration) {
    hydration = loadMessagesFromCache(topicId, resolvedUserId, opts).finally(
      () => {
        messageHydrationsInFlight.delete(hydrationKey);
      }
    );
    messageHydrationsInFlight.set(hydrationKey, hydration);
  }
  const result = await hydration;
  if (opts?.visibleLimit) {
    setVisibleMessagesLimitForTopic(topicId, opts.visibleLimit, {
      allowShrink: opts.allowVisibleShrink
    });
  }
  if (topicId) hydratedResidentTopicUsers.set(topicId, resolvedUserId);
  return result;
};

export const hydrateMessagePreviewFromCache = async (
  topicId: string,
  userId?: string,
  visibleLimit = 48
): Promise<IMessage[]> => {
  if (!topicId || !isShadowSyncEnabled()) {
    return [];
  }

  const resolvedUserId =
    userId || authedUser.value?.id || getChatAuthSession()?.user?.id || '';
  const previewMessages = await loadShadowTopicPreview(topicId, resolvedUserId);

  // Сеть или полное восстановление могли уже заполнить историю, пока читался preview.
  if (
    canonicalTopicStateIds.has(topicId) &&
    getFullMessagesByTopicId(topicId).length
  ) {
    return getMessagesByTopicId(topicId);
  }

  if (!previewMessages.length) {
    return [];
  }

  // Native-снимок может принести новое сообщение, пока старый preview читается с диска.
  const normalizedMessages = prepareMessagesForPersistence(
    dedupeMessagesForTopic([
      ...previewMessages,
      ...getFullMessagesByTopicId(topicId)
    ])
  );
  saveMessagesToLocal(topicId, normalizedMessages, {
    syncLastMessage: false,
    windowMode: 'latest',
    visibleLimit,
    skipPersist: true
  });

  return getMessagesByTopicId(topicId);
};

export const hydrateNotificationMessagePreview = async (
  topicId: string,
  messageId: string,
  messages: IMessage[],
  userId: string
): Promise<void> => {
  if (!messages.some(message => message.id === messageId)) return;
  await rememberPersistedDeletedMessageIds(topicId, userId);
  if (authedUser.value?.id !== userId) return;
  const merged = prepareMessagesForPersistence(
    dedupeMessagesForTopic([...messages, ...getFullMessagesByTopicId(topicId)])
  );
  saveMessagesToLocal(topicId, merged, {
    syncLastMessage: false,
    windowMode: 'latest',
    visibleLimit: defaultVisibleMessagesLimitByTopic.get(topicId) || 48,
    skipPersist: true
  });
};

const loadMessagesFromCache = async (
  topicId: string,
  userId?: string,
  opts?: { visibleLimit?: number; allowVisibleShrink?: boolean }
): Promise<IMessage[]> => {
  if (!topicId) {
    return [];
  }

  const resolvedUserId = userId || authedUser.value?.id;
  const existingFullMessages = getFullMessagesByTopicId(topicId);
  const hasCanonicalMessages =
    existingFullMessages.length > 0 && canonicalTopicStateIds.has(topicId);
  const pendingUploadMessagesPromise = loadPendingUploadMessages(
    topicId,
    resolvedUserId
  );
  const deletedMessagesReady = rememberPersistedDeletedMessageIds(
    topicId,
    resolvedUserId
  );
  // Независимые метаданные читаются вместе. Снимок истории не ждёт более
  // тяжёлое восстановление вложений и поэтому успевает в первый кадр топика.
  const readStateReady = hasCanonicalMessages
    ? Promise.resolve()
    : loadShadowReadState(topicId, resolvedUserId).then(() => undefined);
  const loadedRangesReady = hasCanonicalMessages
    ? Promise.resolve()
    : ensureShadowLoadedRangesLoaded(topicId, resolvedUserId);
  const shadowMessagesPromise =
    !hasCanonicalMessages && isShadowSyncEnabled()
      ? loadShadowTopicSnapshot(topicId, resolvedUserId)
      : Promise.resolve<IMessage[]>([]);
  const [shadowMessages] = await Promise.all([
    shadowMessagesPromise,
    deletedMessagesReady
  ]);

  if (!hasCanonicalMessages && shadowMessages.length > 0) {
    const earlyShadowMessages = prepareMessagesForPersistence(
      dedupeMessagesForTopic([
        ...shadowMessages,
        ...getFullMessagesByTopicId(topicId)
      ])
    );

    saveMessagesToLocal(topicId, earlyShadowMessages, {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit: getNonShrinkingVisibleLimit(
        topicId,
        opts?.visibleLimit,
        false,
        opts?.allowVisibleShrink
      ),
      skipPersist: true
    });
    markTopicStateCanonical(topicId);
  }

  const [pendingUploadMessages] = await Promise.all([
    pendingUploadMessagesPromise,
    readStateReady,
    loadedRangesReady
  ]);
  const mergePendingUploadMessages = (messages: IMessage[]): IMessage[] =>
    dedupeMessagesForTopic([...messages, ...pendingUploadMessages]);

  if (existingFullMessages.length > 0 && canonicalTopicStateIds.has(topicId)) {
    const normalizedExistingMessages = await restorePendingUploadMediaState(
      topicId,
      prepareMessagesForPersistence(
        mergePendingUploadMessages(getFullMessagesByTopicId(topicId))
      )
    );

    saveMessagesToLocal(topicId, normalizedExistingMessages, {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit: getNonShrinkingVisibleLimit(
        topicId,
        opts?.visibleLimit,
        false,
        opts?.allowVisibleShrink
      ),
      skipPersist: true
    });

    return getMessagesByTopicId(topicId);
  }

  if (hasCanonicalMessages) {
    await Promise.all([
      loadShadowReadState(topicId, resolvedUserId),
      ensureShadowLoadedRangesLoaded(topicId, resolvedUserId)
    ]);
  }

  if (isShadowSyncEnabled()) {
    if (shadowMessages.length > 0) {
      const existingMessages = getFullMessagesByTopicId(topicId);
      const normalizedShadowMessages = await restorePendingUploadMediaState(
        topicId,
        await applyShadowReadStateToMessages(
          topicId,
          prepareMessagesForPersistence(
            mergePendingUploadMessages([...shadowMessages, ...existingMessages])
          ),
          resolvedUserId,
          getCachedShadowReadState(topicId, resolvedUserId) ?? null
        )
      );

      saveMessagesToLocal(topicId, normalizedShadowMessages, {
        syncLastMessage: false,
        windowMode: 'latest',
        visibleLimit: getNonShrinkingVisibleLimit(
          topicId,
          opts?.visibleLimit,
          false,
          opts?.allowVisibleShrink
        ),
        skipPersist: true
      });
      markTopicStateCanonical(topicId);

      return normalizedShadowMessages;
    }
  }

  const cachedMessages = await loadCachedTopicMessages(topicId, userId);

  if (cachedMessages.length > 0) {
    const normalizedCachedMessages = await restorePendingUploadMediaState(
      topicId,
      prepareMessagesForPersistence(
        mergePendingUploadMessages([
          ...cachedMessages,
          ...getFullMessagesByTopicId(topicId)
        ])
      )
    );

    saveMessagesToLocal(topicId, normalizedCachedMessages, {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit: getNonShrinkingVisibleLimit(
        topicId,
        opts?.visibleLimit,
        false,
        opts?.allowVisibleShrink
      ),
      skipPersist: true
    });
    markTopicStateCanonical(topicId);
    schedulePersistMessages(topicId, 150, {
      userId: resolvedUserId,
      migrateLegacyCache: true
    });

    return normalizedCachedMessages;
  }

  if (existingFullMessages.length > 0) {
    const normalizedExistingMessages = await restorePendingUploadMediaState(
      topicId,
      prepareMessagesForPersistence(
        mergePendingUploadMessages(getFullMessagesByTopicId(topicId))
      )
    );

    saveMessagesToLocal(topicId, normalizedExistingMessages, {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit: getNonShrinkingVisibleLimit(
        topicId,
        opts?.visibleLimit,
        false,
        opts?.allowVisibleShrink
      ),
      skipPersist: true
    });

    return getMessagesByTopicId(topicId);
  }

  if (pendingUploadMessages.length > 0) {
    const normalizedPendingUploadMessages =
      await restorePendingUploadMediaState(
        topicId,
        prepareMessagesForPersistence(pendingUploadMessages)
      );

    saveMessagesToLocal(topicId, normalizedPendingUploadMessages, {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit: getNonShrinkingVisibleLimit(
        topicId,
        opts?.visibleLimit,
        false,
        opts?.allowVisibleShrink
      ),
      skipPersist: true
    });
    markTopicStateCanonical(topicId);

    return normalizedPendingUploadMessages;
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
    visibleLimit?: number;
    persistDelayMs?: number;
    skipPersist?: boolean;
    updateVisible?: boolean;
  }
): IMessage[] => {
  const existing = getFullMessagesByTopicId(topicId) || [];
  const existingVisible = getMessagesByTopicId(topicId) || [];
  const incomingMessages = filterDeletedMessagesForTopic(topicId, messages);

  let combined =
    mode === 'replace'
      ? [...existing, ...incomingMessages]
      : mergeWithPendingOutgoingMessages(incomingMessages, existing);

  if (mode === 'prepend') {
    combined = [...incomingMessages, ...existing];
  } else if (mode === 'append') {
    combined = [...existing, ...incomingMessages];
  }

  const unique = dedupeMessagesForTopic(combined);
  const visibleCombined =
    mode === 'prepend'
      ? Array.from(
          new Map(
            [...incomingMessages, ...existingVisible].map(m => [m.id, m])
          ).values()
        )
      : mode === 'append'
        ? Array.from(
            new Map(
              [...existingVisible, ...incomingMessages].map(m => [m.id, m])
            ).values()
          )
        : dedupeMessagesForTopic([...existingVisible, ...incomingMessages]);
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
    visibleMessages: visibleCombined,
    visibleLimit: opts?.visibleLimit,
    persistDelayMs: opts?.persistDelayMs,
    skipPersist: opts?.skipPersist,
    updateVisible: opts?.updateVisible
  });

  return unique;
};

export const savePinnedMessagesToLocal = (
  topicId: string,
  messages: IMessage[],
  opts: { skipCache?: boolean } = {}
): void => {
  pinnedMessagesStore[topicId] = messages;

  if (!opts.skipCache) {
    void saveCachedPinnedMessages(topicId, messages);
  }
};

export const getPinnedMessagesByTopicId = (topicId: string): IMessage[] => {
  return pinnedMessagesStore[topicId] || [];
};

export const isMessagePinnedOnlyForMe = (
  topicId: string,
  messageId: string
): boolean =>
  Boolean(
    (pinnedMessagesStore[topicId] || []).find(
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
    (pinnedMessagesStore[topicId] || []).find(
      message => message.id === messageId
    )
  );

export const pinMessageOnlyForMe = (
  topicId: string,
  messageId: string
): void => {
  const existingPinnedMessages = pinnedMessagesStore[topicId] || [];

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
  const existingPinnedMessages = pinnedMessagesStore[topicId] || [];

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
  savePinnedMessagesToLocal(topicId, messages);
};

const applyLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const existingMessages = getFullMessagesByTopicId(topicId);
  const readMessageIds = new Set(messageIds);
  const isReadByCurrentUser = userId === authedUser.value.id;
  const readAt = new Date().toISOString();
  const fullMessageIndexes = getFullMessageIndexesForTopic(
    topicId,
    existingMessages
  );
  const fullReadIndexes = Array.from(readMessageIds)
    .map(messageId => fullMessageIndexes.get(messageId))
    .filter((index): index is number => index !== undefined);
  const newlyReadCount = isReadByCurrentUser
    ? fullReadIndexes.reduce((count, index) => {
        const message = existingMessages[index];

        return (
          count +
          (message &&
          message.senderUserId !== authedUser.value.id &&
          message.isReadByMe !== true
            ? 1
            : 0)
        );
      }, 0)
    : 0;
  const applyReadStatus = (
    messages: IMessage[],
    indexes: Iterable<number>
  ): { messages: IMessage[]; didChange: boolean } => {
    let didChange = false;
    let nextMessages = messages;

    for (const index of indexes) {
      const message = messages[index];

      if (!message) {
        continue;
      }

      const alreadyApplied = isReadByCurrentUser
        ? message.status === MessageStatus.Read &&
          message.isRead === true &&
          message.isReadByMe === true
        : message.status === MessageStatus.Read &&
          message.isRead === true &&
          Boolean(message.messageRead?.some(read => read.userId === userId));

      if (alreadyApplied) {
        continue;
      }

      if (!didChange) {
        nextMessages = [...messages];
      }
      didChange = true;

      nextMessages[index] = {
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

    return { messages: nextMessages, didChange };
  };
  const visibleMessages = getMessagesByTopicId(topicId);
  const visibleMessageIndexes = new Map(
    visibleMessages.map((message, index) => [message.id, index])
  );
  const visibleReadIndexes = Array.from(readMessageIds)
    .map(messageId => visibleMessageIndexes.get(messageId))
    .filter((index): index is number => index !== undefined);
  const fullReadUpdate = applyReadStatus(existingMessages, fullReadIndexes);
  const visibleReadUpdate = applyReadStatus(
    visibleMessages,
    visibleReadIndexes
  );
  const updatedMessages = fullReadUpdate.messages;

  updateLocalTopicReadStatus(topicId, messageIds);
  if (fullReadUpdate.didChange) {
    fullMessagesStore[topicId] = updatedMessages;
  }
  if (visibleReadUpdate.didChange) {
    messagesStore[topicId] = visibleReadUpdate.messages;
  }
  if (fullReadUpdate.didChange || visibleReadUpdate.didChange) {
    touchTopicMemory(topicId);
    pruneInactiveTopicMemory();
    schedulePersistMessages(topicId);
  }
  if (newlyReadCount > 0) {
    decrementServerUnreadCount(topicId, newlyReadCount);
  }
  const didSyncUnreadFromPreview = clearTopicReadPreview(topicId, messageIds);
  if (!didSyncUnreadFromPreview) {
    syncTopicUnreadState(topicId);
  }

  if (userId === authedUser.value.id && getSelectedTopic(topicId)?.taggedMe) {
    // Re-evaluate taggedMe status for the topic
    const hasUnreadMentions = updatedMessages.some(
      m =>
        m.taggedUserIds?.includes(authedUser.value?.id) &&
        m.senderUserId !== authedUser.value?.id &&
        !m.isReadByMe &&
        !readMessageIds.has(m.id)
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

  const updatedMessages = updateTopicMessageStores(topicId, messages =>
    messages.map(message =>
      message.id === messageId ? { ...message, status } : message
    )
  );
  const updatedMessage = updatedMessages.find(
    message => message.id === messageId
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
  schedulePendingUploadMessageSnapshot(topicId, messageId);

  if (updatedMessage) {
    syncLocalLastMessage(topicId, updatedMessage);
  }
  recordTopicStateTelemetry(
    'local_message_status',
    getSelectedTopic(topicId),
    updatedMessage,
    authedUser.value?.id,
    {
      messageId,
      previousStatus: currentMessage?.status,
      nextStatus: status,
      foundInLocalCache: !!updatedMessage
    }
  );
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
            uploadPercent: 0
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
  schedulePendingUploadMessageSnapshot(topicId, messageId);
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

          const nextPercent =
            typeof percent === 'number' &&
            typeof media.uploadPercent === 'number'
              ? Math.max(media.uploadPercent, percent)
              : percent;

          return {
            ...media,
            uploadPercent: nextPercent
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
  schedulePendingUploadMessageSnapshot(topicId, messageId);
};

export const setLocalMediaPreviewData = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: Partial<Pick<IMedia, 'localThumbnailPath' | 'ex'>>
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
            ...(payload.localThumbnailPath
              ? { localThumbnailPath: payload.localThumbnailPath }
              : {}),
            ...(payload.ex
              ? {
                  ex: {
                    ...media.ex,
                    ...payload.ex
                  }
                }
              : {})
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
  schedulePendingUploadMessageSnapshot(topicId, messageId);
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

          const shouldClearFallbackThumbnail =
            Boolean(payload.thumbnailPath) &&
            media.localThumbnailPath === VIDEO_FALLBACK_THUMBNAIL;
          const shouldClearLocalVideoPath =
            payload.type === MediaType.Video && Boolean(payload.path);
          const mergedEx =
            payload.ex || media.ex
              ? {
                  ...payload.ex,
                  ...media.ex
                }
              : undefined;
          const localPath = shouldClearLocalVideoPath
            ? undefined
            : media.localPath;

          if (
            shouldClearLocalVideoPath &&
            media.localPath?.startsWith('blob:')
          ) {
            URL.revokeObjectURL(media.localPath);
          }

          return {
            ...media,
            ...payload,
            localPath,
            ...(mergedEx ? { ex: mergedEx } : {}),
            ...(shouldClearFallbackThumbnail
              ? { localThumbnailPath: undefined }
              : {}),
            isLoading: false,
            uploadError: false,
            uploadPercent: null
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
  schedulePendingUploadMessageSnapshot(topicId, messageId);
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
            uploadError
          };
        })
      };
    })
  );

  schedulePersistMessages(topicId);
  schedulePendingUploadMessageSnapshot(topicId, messageId);
};

export const deleteFileAfterLoading = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key);

  messageFiles?.delete(fileId);
  if (messageFiles?.size === 0) {
    pendingUploadFiles.delete(key);
  }

  void getChatSDK()?.abortPendingFileUpload(messageId, fileId);
  void deletePendingUploadFile(topicId, messageId, fileId);

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
  schedulePendingUploadMessageSnapshot(topicId, messageId);
};

export const registerPendingUploadMessage = (
  topicId: string,
  messageId: string,
  meta: {
    replyMessageId?: string;
    forwardMessageIds?: string[];
    message?: IMessage;
  }
): Promise<void> => {
  const key = getPendingUploadKey(topicId, messageId);
  pendingUploadMeta.set(key, {
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || []
  });
  const generation = (pendingUploadSnapshotGenerations.get(key) || 0) + 1;
  pendingUploadSnapshotGenerations.set(key, generation);
  pendingUploadSnapshotRevisions.set(
    key,
    (pendingUploadSnapshotRevisions.get(key) || 0) + 1
  );

  return savePendingUploadMeta({
    topicId,
    messageId,
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || [],
    message: meta.message ? stripRuntimeMediaState(meta.message) : undefined
  }).then(async () => {
    if (
      pendingUploadSnapshotGenerations.get(key) !== generation ||
      !pendingUploadMeta.has(key)
    ) {
      await deletePendingUploadMeta(topicId, messageId);
    }
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

const schedulePendingUploadMessageSnapshot = (
  topicId: string,
  messageId: string
): void => {
  if (!topicId || !messageId) {
    return;
  }

  const key = getPendingUploadKey(topicId, messageId);
  const previousTimeout = pendingUploadSnapshotTimeouts.get(key);

  if (previousTimeout) {
    clearTimeout(previousTimeout);
  }

  const generation = pendingUploadSnapshotGenerations.get(key) || 0;
  const revision = (pendingUploadSnapshotRevisions.get(key) || 0) + 1;
  pendingUploadSnapshotRevisions.set(key, revision);
  const timeoutId = setTimeout(async () => {
    pendingUploadSnapshotTimeouts.delete(key);
    const meta = await getPendingUploadMessageMeta(topicId, messageId);

    if (
      !meta ||
      pendingUploadSnapshotGenerations.get(key) !== generation ||
      pendingUploadSnapshotRevisions.get(key) !== revision ||
      !pendingUploadMeta.has(key)
    ) {
      return;
    }

    const message = getFullMessagesByTopicId(topicId).find(
      currentMessage =>
        currentMessage.id === messageId ||
        getClientId(currentMessage) === messageId
    );

    if (!message) {
      return;
    }

    await savePendingUploadMeta({
      topicId,
      messageId,
      replyMessageId: meta.replyMessageId,
      forwardMessageIds: meta.forwardMessageIds,
      message: stripRuntimeMediaState(message)
    });

    if (
      pendingUploadSnapshotGenerations.get(key) !== generation ||
      !pendingUploadMeta.has(key)
    ) {
      await deletePendingUploadMeta(topicId, messageId);
    }
  }, PENDING_UPLOAD_SNAPSHOT_PERSIST_DELAY_MS);

  pendingUploadSnapshotTimeouts.set(key, timeoutId);
};

export const registerPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: { file: File; isMedia: boolean },
  onProgress?: (percent: number) => void
): Promise<void> => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key) || new Map();

  messageFiles.set(fileId, payload);
  pendingUploadFiles.set(key, messageFiles);
  return savePendingUploadFile({
    topicId,
    messageId,
    fileId,
    file: payload.file,
    isMedia: payload.isMedia,
    onProgress
  });
};

export const getPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string,
  onProgress?: (percent: number) => void
): Promise<{ file: File; isMedia: boolean } | null> => {
  const key = getPendingUploadKey(topicId, messageId);
  const cached = pendingUploadFiles.get(key)?.get(fileId) || null;

  if (cached) {
    return Promise.resolve(cached);
  }

  return loadPendingUploadFile(
    topicId,
    messageId,
    fileId,
    undefined,
    onProgress
  ).then(file => {
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
  const snapshotTimeout = pendingUploadSnapshotTimeouts.get(key);

  if (snapshotTimeout) {
    clearTimeout(snapshotTimeout);
    pendingUploadSnapshotTimeouts.delete(key);
  }

  pendingUploadSnapshotGenerations.set(
    key,
    (pendingUploadSnapshotGenerations.get(key) || 0) + 1
  );
  pendingUploadSnapshotRevisions.set(
    key,
    (pendingUploadSnapshotRevisions.get(key) || 0) + 1
  );

  void getChatSDK()?.abortPendingMessageUploads(messageId);
  void deletePendingUploadFilesForMessage(
    topicId,
    messageId,
    Array.from(messageFiles?.keys() || [])
  );

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
  topicId?: string,
  options?: { isMention?: boolean }
): Promise<void> => {
  const isActivelyVisible = getIsAppActivelyVisible();
  const suppressionDeadline = topicId
    ? notificationSoundSuppressedUntilByTopic.get(topicId) || 0
    : 0;

  if (topicId && isTopicMuted(topicId) && !options?.isMention) {
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

export const playNotificationSound = (
  topicId?: string,
  options?: { isMention?: boolean }
): void => {
  void playNotificationSoundInternal(topicId, options);
};
