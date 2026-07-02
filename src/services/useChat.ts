import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
import type { UploadTelemetryContext } from './useChatSDK';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import type { PtsMeta } from './useChatSDK/websocketEvents';
import { MessageStatus, TopicType } from './useChatSDK/types';
import type { ChatMessage } from '../types/messages';
import { authedUser } from '../composables/useAuth';
import {
  changeUnreadMessageCount,
  useTopics,
  deleteTopicFromList,
  fetchAllTopics,
  getTopicList,
  incrementDisplayedUnreadCount,
  isTopicMuted,
  updateLocalTopicUser,
  setTopicTypingState,
  updateTopicUnreadReaction,
  getTopicUnreadReactionMessageId,
  clearTopicUnreadReaction,
  totalUnreadCount
} from '../composables/useTopics';
import {
  updateLocalGroupDetails,
  updateLocalLastMessageGroup,
  getGroupById
} from '../composables/useGroup';
import {
  fetchAllUsers,
  getUserById,
  updateLocalUserStatus
} from '../composables/useUsers';
import {
  addMessageToLocal,
  changeLocalReadStatus,
  changeReactionFromLocal,
  deleteMessageFromLocal,
  editMessageFromLocal,
  playNotificationSound,
  fetchMessagesForTopic,
  fetchPinnedMessagesForTopic,
  getFullMessagesByTopicId,
  mergeMessagesForTopic
} from './useMessages';
import { IMedia, IMessage } from 'src/components/interfaces/interfaces';
import { isUnreadTrackableMessageForUser } from '../utils/messageTracking';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { initCallKit, showIncomingCallKit, endAllCallKits } from './useCallKit';
import { clearTopicNotifications } from './useNotificationNavigation';
import {
  showTauriIncomingCallNotification,
  showTauriMessageNotification
} from './useTauriNotifications';
import {
  ensureTauriWindowStateTracking,
  getIsAppActivelyVisible,
  subscribeToAppVisibilityChanges
} from './useAppVisibility';
import type { MediaPreviewDimensions } from '../utils/mediaPreview';
import { useUrlWatcher } from '../composables/navigation';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import {
  getStoredChatAccessToken,
  isAuthError,
  mergeAuthUser
} from '../composables/useAuth';
import {
  loadShadowSyncMeta,
  recordShadowChatEvent,
  saveShadowTopicSnapshot,
  saveShadowReadState,
  saveShadowSyncMeta
} from './useShadowChatSync';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';
import {
  bootstrapCallHistory,
  initializeCallHistorySync,
  removeCallHistoryMessage,
  upsertCallHistoryMessage
} from './useCallHistory';
import { normalizeUserStatus } from '../utils/userStatus';
import { normalizeDateValue } from '../utils/dateValue';
import { getIsTopicMessageVisible } from './useTopicViewportState';
import { isGroupCallInviteUrl } from '../utils/groupCallInviteUrl';

let chatSDK: ChatSDK | null = null;
type CallsApi = typeof import('./useCalls');
let callsApi: CallsApi | null = null;
let callsApiPromise: Promise<CallsApi> | null = null;

const loadCallsApi = async (): Promise<CallsApi> => {
  if (!callsApiPromise) {
    callsApiPromise = import('./useCalls').then(api => {
      callsApi = api;
      return api;
    });
  }

  return callsApiPromise;
};

const isWebsocketConnecting = ref(true);
const hasWebsocketConnection = ref(false);
const browserOnline = ref(
  Capacitor.isNativePlatform() ||
    typeof navigator === 'undefined' ||
    navigator.onLine
);
const isRecentlyReconnected = ref(false);
const currentUserId = ref<string | null>(null);
const suspendIncomingMergeByTopic = ref<Record<string, boolean>>({});
const bufferedIncomingMessagesByTopic = ref<Record<string, IMessage[]>>({});

const messagesStore = shallowRef<Record<string, ChatMessage[]>>({});

const messageChangeCallbacks: Array<(topicId?: string) => void> = [];
let areChatListenersBound = false;
let latestProcessedPts = 0;
const processedPts = new Set<number>();

type MessageHandlingOptions = {
  silent?: boolean;
};

type ReconnectRefreshReason =
  | 'websocket-reconnect'
  | 'app-visible'
  | 'window-focus'
  | 'browser-online'
  | 'native-app-active'
  | 'native-resume'
  | 'network-change'
  | 'network-poll';

type NetworkInformationLike = {
  type?: string;
  effectiveType?: string;
  addEventListener?: (type: string, cb: () => void) => void;
};

const notifyMessageChange = (topicId?: string): void => {
  messageChangeCallbacks.forEach(callback => {
    try {
      callback(topicId);
    } catch (error) {
      console.error('Error in message change callback:', error);
    }
  });
};

const hasMessageInTopic = (
  topicId: string,
  messageId?: string | null
): boolean => {
  if (!topicId || !messageId) {
    return false;
  }

  return getFullMessagesByTopicId(topicId).some(
    message => message.id === messageId
  );
};

const normalizePts = (pts?: string | number | null): number => {
  const normalizedPts = Number(pts);
  return Number.isFinite(normalizedPts) ? normalizedPts : 0;
};

const shouldProcessPtsMeta = (ptsMeta?: PtsMeta): boolean => {
  const pts = normalizePts(ptsMeta?.pts);

  if (!pts) {
    return true;
  }

  if (processedPts.has(pts)) {
    return false;
  }

  processedPts.add(pts);
  if (processedPts.size > 1000) {
    const oldestPts = processedPts.values().next().value;
    if (oldestPts !== undefined) {
      processedPts.delete(oldestPts);
    }
  }

  latestProcessedPts = Math.max(latestProcessedPts, pts);
  return true;
};

const persistPtsMeta = (ptsMeta?: PtsMeta): void => {
  if (!ptsMeta?.pts) {
    return;
  }

  void saveShadowSyncMeta('pts:last', {
    pts: ptsMeta.pts,
    eventId: ptsMeta.eventId,
    topicId: ptsMeta.topicId,
    timestamp: new Date().toISOString()
  });

  if (ptsMeta.topicId) {
    void saveShadowSyncMeta(`pts:topic:${ptsMeta.topicId}`, {
      pts: ptsMeta.pts,
      eventId: ptsMeta.eventId,
      topicId: ptsMeta.topicId,
      timestamp: new Date().toISOString()
    });
  }
};

const syncPtsStateToServer = async (): Promise<void> => {
  if (!chatSDK) {
    return;
  }

  const lastPtsMeta = await loadShadowSyncMeta<{ pts?: string }>('pts:last');

  if (!lastPtsMeta?.pts) {
    return;
  }

  latestProcessedPts = Math.max(
    latestProcessedPts,
    normalizePts(lastPtsMeta.pts)
  );
  if (latestProcessedPts) {
    processedPts.add(latestProcessedPts);
  }

  chatSDK.sendWebSocketEvent(WebSocketEventType.SYNC_STATE, {
    pts: lastPtsMeta.pts
  });
};

export const setSuspendIncomingMergeForTopic = (
  topicId: string,
  suspended: boolean
): void => {
  if (!topicId) {
    return;
  }

  suspendIncomingMergeByTopic.value[topicId] = suspended;
};

export const consumeBufferedIncomingMessagesForTopic = (
  topicId: string
): IMessage[] => {
  if (!topicId) {
    return [];
  }

  const messages = bufferedIncomingMessagesByTopic.value[topicId] || [];
  bufferedIncomingMessagesByTopic.value[topicId] = [];

  return messages;
};

export const getBufferedIncomingMessagesCountForTopic = (
  topicId: string
): number => {
  if (!topicId) {
    return 0;
  }

  return bufferedIncomingMessagesByTopic.value[topicId]?.length || 0;
};

const setupChatListeners = (): void => {
  if (!chatSDK || areChatListenersBound) return;

  areChatListenersBound = true;

  const clearDeletedReactionTarget = (
    topicId: string,
    messageId?: string
  ): void => {
    if (messageId && getTopicUnreadReactionMessageId(topicId) === messageId) {
      clearTopicUnreadReaction(topicId);
    }
  };

  const handleIncomingSocketMessage = (
    message: IMessage,
    opts?: MessageHandlingOptions
  ): void => {
    const { updateLocalLastMessageTopic } = useTopics();
    void upsertCallHistoryMessage(message);
    const isDuplicateMessage = hasMessageInTopic(message.topicId, message.id);
    const unreadCountBefore = totalUnreadCount.value;
    const isIncomingFromAnotherUser =
      message.senderUserId !== currentUserId.value;
    const isUnreadIncomingMessage =
      isIncomingFromAnotherUser && !message.isReadByMe;
    const shouldSuspendMerge =
      isIncomingFromAnotherUser &&
      route.value.id === message.topicId &&
      suspendIncomingMergeByTopic.value[message.topicId] === true;

    if (!shouldSuspendMerge) {
      addMessageToLocal(message.topicId, message);
    } else if (!isDuplicateMessage) {
      const existingBuffered =
        bufferedIncomingMessagesByTopic.value[message.topicId] || [];
      if (!existingBuffered.some(item => item.id === message.id)) {
        bufferedIncomingMessagesByTopic.value[message.topicId] = [
          ...existingBuffered,
          message
        ];
      }

      if (
        isUnreadIncomingMessage &&
        isUnreadTrackableMessageForUser(message, currentUserId.value)
      ) {
        changeUnreadMessageCount(1, message.topicId);
      }
    }

    if (!isDuplicateMessage && isIncomingFromAnotherUser) {
      const isCurrentTopicActivelyVisible =
        route.value.id === message.topicId && getIsAppActivelyVisible();

      if (isCurrentTopicActivelyVisible) {
        void clearTopicNotifications(message.topicId);
      }

      if (
        !isCurrentTopicActivelyVisible &&
        message.topicId === route.value.id &&
        totalUnreadCount.value === unreadCountBefore
      ) {
        incrementDisplayedUnreadCount(1);
      }

      if (!opts?.silent) {
        playNotificationSound(message.topicId);
      }

      if (
        !opts?.silent &&
        !isTopicMuted(message.topicId) &&
        !isCurrentTopicActivelyVisible
      ) {
        const topic = useTopics().getSelectedTopic(message.topicId) as any;

        void showTauriMessageNotification({
          message,
          sender: message.senderUser || getUserById(message.senderUserId),
          topic
        });
      }
    }

    updateLocalLastMessageTopic(message.topicId, message);
    updateLocalLastMessageGroup(message.topicId, message);
  };

  const handleTopicChangePayload = (payload: {
    type: 'UPDATE' | 'CREATE' | 'DELETE';
    topicId: string;
    data: any;
    ptsMeta?: PtsMeta;
  }): void => {
    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);

    void recordShadowChatEvent({
      topicId: payload.topicId,
      type: 'topic_changed',
      source: 'ws',
      payload
    });

    if (payload.type === 'UPDATE') {
      updateLocalGroupDetails(
        payload.topicId,
        payload.data.name,
        payload.data.avatarUrl
      );
    } else if (payload.type === 'CREATE') {
      const { addTopicList } = useTopics();
      addTopicList(payload.data);
    } else if (payload.type === 'DELETE') {
      deleteTopicFromList(payload.data.id);
    }
  };

  const handleChangeMessagePayload = (
    payload: {
      type: 'NEW' | 'CHANGE' | 'DELETE' | 'PIN';
      data: any;
      messageId?: string;
      ptsMeta?: PtsMeta;
      scope?: 'ALL' | 'SELF';
      targetUserId?: string | null;
    },
    opts?: MessageHandlingOptions
  ): void => {
    if (
      payload.scope === 'SELF' &&
      payload.targetUserId &&
      payload.targetUserId !== currentUserId.value
    ) {
      return;
    }

    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);

    if (payload.type === 'NEW') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: 'new_message',
        source: 'ws',
        payload: payload.data
      });
      handleIncomingSocketMessage(payload.data, opts);
    } else if (payload.type === 'DELETE') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: 'delete_message',
        source: 'ws',
        payload: payload.data
      });
      void removeCallHistoryMessage(payload.data.id || payload.messageId);
      clearDeletedReactionTarget(
        payload.data.topicId,
        payload.data.id || payload.messageId
      );
      deleteMessageFromLocal(
        payload.data.topicId,
        payload.data.id || payload.messageId
      );
    } else if (payload.type === 'CHANGE' || payload.type === 'PIN') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: payload.type === 'PIN' ? 'pin_message' : 'edit_message',
        source: 'ws',
        payload: payload.data
      });
      void saveShadowTopicSnapshot(payload.data.topicId, [payload.data], 'ws');
      if (payload.type === 'CHANGE' || payload.scope !== 'SELF') {
        editMessageFromLocal(payload.data.topicId, payload.data);
      }
      void upsertCallHistoryMessage(payload.data);
      if (payload.type === 'PIN') {
        void fetchPinnedMessagesForTopic(payload.data.topicId);
      }
      const { updateLocalLastMessageTopic } = useTopics();
      updateLocalLastMessageTopic(payload.data.topicId);
      updateLocalLastMessageGroup(payload.data.topicId);
    }
  };

  const handleReadMessagePayload = (payload: {
    topicId: string;
    messageIds: string[];
    userId?: string;
    ptsMeta?: PtsMeta;
  }): void => {
    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);

    void recordShadowChatEvent({
      topicId: payload.topicId,
      type: 'read_state',
      source: 'ws',
      payload
    });

    if (payload.userId === currentUserId.value) {
      const lastReadMessageId =
        payload.messageIds[payload.messageIds.length - 1] || null;
      const lastReadMessage = lastReadMessageId
        ? getFullMessagesByTopicId(payload.topicId).find(
            message => message.id === lastReadMessageId
          )
        : null;

      void saveShadowReadState(
        payload.topicId,
        lastReadMessageId,
        lastReadMessage?.createdAt
          ? new Date(lastReadMessage.createdAt).toISOString()
          : new Date().toISOString(),
        'ws'
      );
    }

    changeLocalReadStatus(payload.topicId, payload.messageIds, payload.userId);

    if (payload.userId === currentUserId.value) {
      void clearTopicNotifications(payload.topicId);
    }
  };

  const handleReactionPayload = (payload: {
    action: 'added' | 'updated' | 'removed';
    messageId: string;
    reactionId?: string;
    topicId: string;
    reaction?: any;
    messageSenderUserId?: string;
    reactionSenderUserId?: string;
    ptsMeta?: PtsMeta;
  }): void => {
    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);

    void recordShadowChatEvent({
      topicId: payload.topicId,
      type: 'reaction_updated',
      source: 'ws',
      payload
    });

    changeReactionFromLocal(
      payload.topicId,
      payload.messageId,
      payload.action,
      payload.reaction,
      payload.reactionId
    );

    const localMessage = getFullMessagesByTopicId(payload.topicId).find(
      message => message.id === payload.messageId
    );
    const topicLastMessage = useTopics().getSelectedTopic(
      payload.topicId
    )?.lastMessage;
    const messageSenderUserId =
      payload.messageSenderUserId ||
      localMessage?.senderUserId ||
      (topicLastMessage?.id === payload.messageId
        ? topicLastMessage.senderUserId
        : undefined);
    const reactionSenderUserId =
      payload.reactionSenderUserId || payload.reaction?.senderUserId;

    if (
      messageSenderUserId !== currentUserId.value ||
      reactionSenderUserId === currentUserId.value
    ) {
      return;
    }

    if (
      route.value.id === payload.topicId &&
      getIsAppActivelyVisible() &&
      getIsTopicMessageVisible(payload.topicId, payload.messageId)
    ) {
      void markTopicReactionSeenChat({
        topicId: payload.topicId
      });
      return;
    }

    updateTopicUnreadReaction(
      payload.topicId,
      payload.action,
      payload.reaction?.id || payload.reactionId,
      payload.messageId
    );
  };

  const handleReactionSeenPayload = (payload: {
    topicId: string;
    userId: string;
    lastSeenReactionAt: string;
    ptsMeta?: PtsMeta;
  }): void => {
    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);

    void recordShadowChatEvent({
      topicId: payload.topicId,
      type: 'reaction_seen',
      source: 'ws',
      payload
    });

    if (payload.userId !== currentUserId.value) {
      return;
    }

    clearTopicUnreadReaction(payload.topicId);
  };

  const handleUserUpdatedPayload = (payload: {
    id: string;
    lastOnline: Date | string | null;
    status?: {
      icon: string;
      text: string;
    } | null;
    ptsMeta?: PtsMeta;
  }): void => {
    if (!shouldProcessPtsMeta(payload.ptsMeta)) {
      return;
    }

    persistPtsMeta(payload.ptsMeta);
    const normalizedLastOnline = normalizeDateValue(payload.lastOnline);

    const normalizedStatus =
      payload.status === undefined
        ? undefined
        : normalizeUserStatus(payload.status);

    updateLocalUserStatus(payload.id, normalizedLastOnline, normalizedStatus);
    updateLocalTopicUser(payload.id, {
      lastOnline: normalizedLastOnline,
      ...(normalizedStatus !== undefined ? { status: normalizedStatus } : {})
    });

    if (payload.id === currentUserId.value) {
      mergeAuthUser({
        lastOnline: normalizedLastOnline,
        ...(normalizedStatus !== undefined ? { status: normalizedStatus } : {})
      });
    }
  };

  chatSDK.subscribeToEvent(WebSocketEventType.NEW_MESSAGE, event => {
    void recordShadowChatEvent({
      topicId: event.payload.topicId,
      type: 'new_message',
      source: 'ws',
      payload: event.payload
    });
    handleIncomingSocketMessage(event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_UPDATED, event => {
    void upsertCallHistoryMessage(event.payload);
    appendMessageToLocal(event.payload.topicId, event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_DELETED, event => {
    void removeCallHistoryMessage(event.payload.messageId);
    const payloadTopicId = (event.payload as any).topicId;

    if (payloadTopicId) {
      clearDeletedReactionTarget(payloadTopicId, event.payload.messageId);
      deleteMessageFromLocal(payloadTopicId, event.payload.messageId);
      return;
    }

    Object.entries(messagesStore.value).forEach(([topicId, messages]) => {
      if (messages.some(item => item.id === event.payload.messageId)) {
        clearDeletedReactionTarget(topicId, event.payload.messageId);
        deleteMessageFromLocal(topicId, event.payload.messageId);
      }
    });
  });

  chatSDK.subscribeToEvent(WebSocketEventType.USER_UPDATED, event => {
    handleUserUpdatedPayload(event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.TYPING_STATUS, ({ payload }) => {
    setTopicTypingState(payload.topicId, payload.userId, payload.isTyping);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CHANGE_TOPIC, ({ payload }) => {
    handleTopicChangePayload(payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CHANGE_MESSAGE, ({ payload }) => {
    handleChangeMessagePayload(payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.READ_MESSAGE, ({ payload }) => {
    handleReadMessagePayload(payload);
  });

  chatSDK.subscribeToEvent(
    WebSocketEventType.REACTION_UPDATED,
    ({ payload }) => {
      handleReactionPayload(payload);
    }
  );

  chatSDK.subscribeToEvent(WebSocketEventType.REACTION_SEEN, ({ payload }) => {
    handleReactionSeenPayload(payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.SYNC_REPLAY, ({ payload }) => {
    payload.events.forEach(event => {
      const ptsMeta: PtsMeta = {
        eventId: event.eventId,
        pts: event.pts,
        topicId: event.topicId
      };

      switch (event.eventType) {
        case 'message.new':
        case 'message.change':
        case 'message.delete':
        case 'message.pin':
          handleChangeMessagePayload(
            {
              ...(event.payload as any),
              ptsMeta
            },
            { silent: true }
          );
          break;
        case 'message.read':
          handleReadMessagePayload({
            ...(event.payload as any),
            ptsMeta
          });
          break;
        case 'message.reaction':
          handleReactionPayload({
            ...(event.payload as any),
            ptsMeta
          });
          break;
        case 'message.reaction_seen':
          handleReactionSeenPayload({
            ...(event.payload as any),
            ptsMeta
          });
          break;
        case 'topic.update':
        case 'topic.create':
        case 'topic.delete':
          handleTopicChangePayload({
            ...(event.payload as any),
            ptsMeta
          });
          break;
        case 'user.updated':
          handleUserUpdatedPayload({
            ...(event.payload as any),
            ptsMeta
          });
          break;
        default:
          if (shouldProcessPtsMeta(ptsMeta)) {
            persistPtsMeta(ptsMeta);
          }
          break;
      }
    });
  });

  chatSDK.subscribeToEvent(WebSocketEventType.INCOMING_CALL, ({ payload }) => {
    void (async () => {
      const { handleIncomingCall } = await loadCallsApi();
      const topic = useTopics().getSelectedTopic(payload.topicId) as any;
      const topicType = payload.topicType || topic?.type;
      const user =
        getUserById(payload.callerId) ||
        topic?.members?.find((member: any) => member.id === payload.callerId) ||
        (topic?.user?.id === payload.callerId ? topic.user : null);
      const isReceived = await handleIncomingCall(
        user || null,
        payload.roomId,
        payload.topicId,
        topicType,
        payload.startTime
      );
      const isGroupCall = topicType === TopicType.Group;

      if (isReceived) {
        void showTauriIncomingCallNotification({
          caller: user || null,
          roomId: payload.roomId,
          topic,
          topicId: payload.topicId,
          topicType
        });
      }

      if (Capacitor.isNativePlatform() && !isGroupCall && isReceived && user) {
        showIncomingCallKit(
          user.initials,
          payload.roomId,
          user.avatarUrl,
          payload.topicId
        );
      }
    })();
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CALL_ANSWERED, ({ payload }) => {
    void (async () => {
      const { dismissIncomingCall, handleCallAnswered } = await loadCallsApi();

      if (Capacitor.isNativePlatform()) {
        endAllCallKits();
      }
      dismissIncomingCall(payload.roomId, payload.topicId);
      handleCallAnswered(
        payload.userId,
        payload.roomId,
        payload.topicId,
        payload.startTime,
        payload.elapsedDurationMs
      );
    })();
  });

  chatSDK.subscribeToEvent(
    WebSocketEventType.DISMISS_INCOMING_CALL,
    ({ payload }) => {
      void (async () => {
        const { dismissIncomingCall } = await loadCallsApi();

        if (Capacitor.isNativePlatform()) {
          endAllCallKits();
        }
        dismissIncomingCall(payload.roomId, payload.topicId);
      })();
    }
  );

  chatSDK.subscribeToEvent(WebSocketEventType.ACTIVE_CALLS, ({ payload }) => {
    void (async () => {
      if (!payload.calls?.length && !callsApi && !callsApiPromise) {
        return;
      }

      const { syncServerActiveCalls } = await loadCallsApi();
      syncServerActiveCalls(payload.calls, payload.replace ?? true);
    })();
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CALL_ENDED, ({ payload }) => {
    void (async () => {
      const loadedCallsApi = callsApiPromise ? await loadCallsApi() : callsApi;
      const didEndCall =
        loadedCallsApi?.handleCallEnded(
          payload.roomId,
          payload.topicId,
          payload.reason,
          payload.userId
        ) ?? false;

      loadedCallsApi?.removeActiveGroupCall(payload.topicId);
      loadedCallsApi?.removeInvitedGroupCall(payload.roomId);

      if (!didEndCall) {
        if (payload.topicId) {
          void fetchAllTopics();
        }
        return;
      }

      if (Capacitor.isNativePlatform()) {
        endAllCallKits();
      }

      if (payload.topicId) {
        const endedTopic = useTopics().getSelectedTopic(payload.topicId) as any;

        if (endedTopic?.type === TopicType.DM) {
          await new Promise(resolve => setTimeout(resolve, 500));

          await Promise.allSettled([
            fetchMessagesForTopic(payload.topicId, {
              limit: 50,
              forceRefresh: true,
              forceNetwork: true,
              syncLastMessage: true
            }),
            fetchAllTopics()
          ]);
        }
      }
    })();
  });

  chatSDK.subscribeToEvent(
    WebSocketEventType.CALL_PARTICIPANT_LEFT,
    ({ payload }) => {
      void (async () => {
        const loadedCallsApi = callsApiPromise
          ? await loadCallsApi()
          : callsApi;

        loadedCallsApi?.handleCallParticipantLeft(
          payload.participantId,
          payload.roomId,
          payload.topicId
        );
      })();
    }
  );
};

let isVisibilityListenerAdded = false;
let isResumeListenersAdded = false;
let lastVisibilityState = document.visibilityState;
let reconnectRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let isRefreshingAfterReconnect = false;
let shouldRerunRefreshAfterReconnect = false;
let hasCompletedInitialConnection = false;
const MAX_BACKGROUND_TOPIC_RECONCILES = 12;
const FRESH_SYNC_THROTTLE_MS = 5000;
const HARD_RECONNECT_THROTTLE_MS = 10000;
const NATIVE_NETWORK_RECOVERY_GRACE_MS = 15000;
const HTTP_HEALTH_PROBE_TIMEOUT_MS = 8000;
const HTTP_HEALTH_PROBE_RETRY_DELAY_MS = 1500;
const NATIVE_HTTP_HEALTH_PROBE_ATTEMPTS = 3;
let networkStatePollInterval: ReturnType<typeof setInterval> | null = null;
let removeAppVisibilityListener: (() => void) | null = null;
let lastFreshSyncRequestedAt = 0;
let lastHardReconnectAt = 0;
let nativeNetworkRecoveryUntil = 0;
let connectionAttemptId = 0;

const route = useUrlWatcher();

const getNetworkInformation = (): NetworkInformationLike | null =>
  (
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & {
          connection?: NetworkInformationLike;
        })
      : null
  )?.connection || null;

const getNetworkFingerprint = (onlineOverride?: boolean): string => {
  const connection = getNetworkInformation();
  const online =
    typeof onlineOverride === 'boolean'
      ? onlineOverride
      : typeof navigator === 'undefined'
        ? true
        : navigator.onLine;

  return [
    `online:${online}`,
    `type:${connection?.type || ''}`,
    `effectiveType:${connection?.effectiveType || ''}`
  ].join('|');
};

let lastKnownNetworkFingerprint = getNetworkFingerprint();

const shouldAssumeOnlineForNativeRecovery = (
  reason: ReconnectRefreshReason,
  assumeOnlineOnNative?: boolean
): boolean =>
  Capacitor.isNativePlatform() &&
  (assumeOnlineOnNative ||
    reason === 'native-app-active' ||
    reason === 'native-resume' ||
    Date.now() < nativeNetworkRecoveryUntil ||
    chatSDK?.isConnected());

const resolveEffectiveOnlineState = (
  reason: ReconnectRefreshReason,
  assumeOnlineOnNative?: boolean
): boolean => {
  if (typeof navigator === 'undefined') {
    return true;
  }

  if (shouldAssumeOnlineForNativeRecovery(reason, assumeOnlineOnNative)) {
    return true;
  }

  return navigator.onLine;
};

const waitForReconnectIdle = (): Promise<void> =>
  new Promise(resolve => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 1500 });
      return;
    }

    setTimeout(resolve, 0);
  });

const waitForReconnectDelay = (delayMs: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, delayMs);
  });

const getMessageTimestamp = (
  message?: Pick<IMessage, 'createdAt' | 'updatedAt'> | null
): number => {
  if (!message) {
    return 0;
  }

  const value = message.updatedAt || message.createdAt;

  if (!value) {
    return 0;
  }

  return new Date(value).getTime();
};

const markRecentlyReconnected = (): void => {
  isRecentlyReconnected.value = true;

  if (reconnectRefreshTimeout) {
    clearTimeout(reconnectRefreshTimeout);
  }

  reconnectRefreshTimeout = setTimeout(() => {
    isRecentlyReconnected.value = false;
    reconnectRefreshTimeout = null;
  }, 3000);
};

const resetNetworkRuntimeStateForFreshSync = (): void => {
  processedPts.clear();
  latestProcessedPts = 0;
  suspendIncomingMergeByTopic.value = {};
  bufferedIncomingMessagesByTopic.value = {};
};

const syncCurrentUserFromFreshUsers = (): void => {
  if (!currentUserId.value) {
    return;
  }

  const refreshedUser = getUserById(currentUserId.value);

  if (!refreshedUser) {
    return;
  }

  mergeAuthUser(refreshedUser);
};

const refreshActiveTopicMessagesAfterReconnect = async (
  topicId: string
): Promise<void> => {
  const existingMessages = getFullMessagesByTopicId(topicId);
  const latestMessages = await fetchMessagesForTopic(topicId, {
    limit: 100,
    forceRefresh: true,
    forceNetwork: true,
    skipSave: true
  });

  if (latestMessages.length > 0) {
    mergeMessagesForTopic(topicId, latestMessages, 'replace', {
      syncLastMessage: true
    });
    return;
  }

  if (existingMessages.length === 0) {
    await fetchMessagesForTopic(topicId, {
      limit: 100,
      forceRefresh: true,
      forceNetwork: true,
      syncLastMessage: true
    });
  }
};

const reconcileTopicCachesAfterReconnect = async (): Promise<void> => {
  const topicsToRefresh = getTopicList()
    .filter(topic => {
      if (!topic?.id || topic.id === route.value.id) {
        return false;
      }

      const serverLastMessage = topic.lastMessage;

      if (!serverLastMessage?.id) {
        return false;
      }

      const localLastMessage = getFullMessagesByTopicId(topic.id).at(-1);

      if (!localLastMessage?.id) {
        return true;
      }

      if (localLastMessage.id !== serverLastMessage.id) {
        return true;
      }

      return (
        getMessageTimestamp(localLastMessage) <
        getMessageTimestamp(serverLastMessage)
      );
    })
    .slice(0, MAX_BACKGROUND_TOPIC_RECONCILES);

  if (topicsToRefresh.length === 0) {
    return;
  }

  for (const topic of topicsToRefresh) {
    await waitForReconnectIdle();
    await fetchMessagesForTopic(topic.id, {
      limit: 100,
      forceRefresh: true,
      forceNetwork: true,
      syncLastMessage: true
    });
  }
};

const shouldContinueReconnectRefresh = (): boolean =>
  Boolean(chatSDK && browserOnline.value);

const waitForChatHttpHealth = async (
  reason: ReconnectRefreshReason
): Promise<boolean> => {
  if (!chatSDK) {
    return false;
  }

  const attempts = Capacitor.isNativePlatform()
    ? NATIVE_HTTP_HEALTH_PROBE_ATTEMPTS
    : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const healthy = await chatSDK.probeConnection(
      HTTP_HEALTH_PROBE_TIMEOUT_MS
    );

    void saveShadowSyncMeta('fresh_sync:http_health', {
      reason,
      attempt,
      healthy,
      timestamp: new Date().toISOString()
    });

    if (healthy) {
      browserOnline.value = true;
      return true;
    }

    if (attempt < attempts) {
      await waitForReconnectDelay(HTTP_HEALTH_PROBE_RETRY_DELAY_MS);
    }
  }

  hasWebsocketConnection.value = false;
  isWebsocketConnecting.value = false;

  if (!shouldAssumeOnlineForNativeRecovery(reason)) {
    browserOnline.value = false;
  }

  return false;
};

const runActiveTopicRefreshAfterReconnect = async (): Promise<void> => {
  const activeTopicId = route.value.id;

  if (!activeTopicId) {
    return;
  }

  await Promise.allSettled([
    fetchPinnedMessagesForTopic(activeTopicId),
    refreshActiveTopicMessagesAfterReconnect(activeTopicId)
  ]);

  if (
    route.value.id === activeTopicId &&
    route.value.type === RouteTypes.GROUP
  ) {
    getGroupById(activeTopicId);
  }
};

const recoverActiveCallAfterReconnect = async (
  reason: ReconnectRefreshReason
): Promise<void> => {
  const { recoverActiveCallAfterNetworkChange } = await loadCallsApi();
  await recoverActiveCallAfterNetworkChange(reason);
};

const waitForNextReconnectRefreshStage = async (): Promise<void> => {
  if (!shouldContinueReconnectRefresh()) {
    return;
  }

  await waitForReconnectIdle();
};

const runStagedReconnectRefresh = async (
  reason: ReconnectRefreshReason
): Promise<void> => {
  console.info('Chat fresh sync started after reconnect/resume', { reason });
  void saveShadowSyncMeta('fresh_sync:last_started', {
    reason,
    timestamp: new Date().toISOString()
  });
  resetNetworkRuntimeStateForFreshSync();
  await syncPtsStateToServer();

  const hasHttpConnection = await waitForChatHttpHealth(reason);

  if (!hasHttpConnection) {
    throw new Error('Chat HTTP health check failed');
  }

  await Promise.allSettled([fetchAllUsers()]);
  syncCurrentUserFromFreshUsers();
  await waitForNextReconnectRefreshStage();

  if (!shouldContinueReconnectRefresh()) {
    return;
  }

  await fetchAllTopics();
  await Promise.allSettled([recoverActiveCallAfterReconnect(reason)]);
  await waitForNextReconnectRefreshStage();

  if (!shouldContinueReconnectRefresh()) {
    return;
  }

  await runActiveTopicRefreshAfterReconnect();
  await waitForNextReconnectRefreshStage();

  if (!shouldContinueReconnectRefresh()) {
    return;
  }

  await reconcileTopicCachesAfterReconnect();
  await Promise.allSettled([bootstrapCallHistory(chatSDK, { force: true })]);
  void saveShadowSyncMeta('fresh_sync:last_completed', {
    reason,
    timestamp: new Date().toISOString()
  });
};

const refreshDataAfterReconnect = async (
  reason: ReconnectRefreshReason
): Promise<void> => {
  if (isRefreshingAfterReconnect) {
    shouldRerunRefreshAfterReconnect = true;
    return;
  }

  isRefreshingAfterReconnect = true;

  try {
    do {
      shouldRerunRefreshAfterReconnect = false;
      await runStagedReconnectRefresh(reason);
    } while (
      shouldRerunRefreshAfterReconnect &&
      shouldContinueReconnectRefresh()
    );
  } catch (error) {
    console.warn('Chat fresh sync failed after reconnect/resume:', error);
    void saveShadowSyncMeta('fresh_sync:last_failed', {
      reason,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    isRefreshingAfterReconnect = false;
    shouldRerunRefreshAfterReconnect = false;
  }
};

const requestFreshDataRefresh = (
  reason: ReconnectRefreshReason,
  opts?: { force?: boolean }
): void => {
  if (!shouldContinueReconnectRefresh()) {
    return;
  }

  const now = Date.now();

  if (
    !opts?.force &&
    now - lastFreshSyncRequestedAt < FRESH_SYNC_THROTTLE_MS
  ) {
    if (isRefreshingAfterReconnect) {
      shouldRerunRefreshAfterReconnect = true;
    }
    return;
  }

  lastFreshSyncRequestedAt = now;
  markRecentlyReconnected();
  void refreshDataAfterReconnect(reason);
};

const reconnectChatOnResume = (): void => {
  if (!chatSDK) {
    return;
  }

  chatSDK.reconnectIfNeeded();
};

const hardReconnectChatAfterNetworkChange = (
  reason: ReconnectRefreshReason
): void => {
  if (!chatSDK || !browserOnline.value) {
    return;
  }

  const now = Date.now();

  if (now - lastHardReconnectAt < HARD_RECONNECT_THROTTLE_MS) {
    reconnectChatOnResume();
    return;
  }

  lastHardReconnectAt = now;
  console.info('Chat websocket hard reconnect after network change', {
    reason
  });
  void saveShadowSyncMeta('websocket:hard_reconnect', {
    reason,
    timestamp: new Date().toISOString()
  });
  isWebsocketConnecting.value = true;
  hasWebsocketConnection.value = false;

  const sdk = chatSDK;
  sdk.disconnect();
  startChatConnectionInBackground(sdk);
};

const syncFreshDataForResume = (
  reason: ReconnectRefreshReason,
  opts?: { hardReconnect?: boolean; forceRefresh?: boolean }
): void => {
  if (!chatSDK || !browserOnline.value) {
    return;
  }

  if (opts?.hardReconnect) {
    hardReconnectChatAfterNetworkChange(reason);
  } else {
    reconnectChatOnResume();
  }

  if (getIsAppActivelyVisible()) {
    syncPresenceForVisibility();
  }

  requestFreshDataRefresh(reason, {
    force: opts?.forceRefresh || opts?.hardReconnect
  });
};

const handleNetworkOrResumeChange = (
  reason: ReconnectRefreshReason,
  opts?: {
    forceHardReconnect?: boolean;
    forceRefresh?: boolean;
    assumeOnlineOnNative?: boolean;
  }
): void => {
  if (typeof navigator === 'undefined') {
    return;
  }

  const effectiveOnline = resolveEffectiveOnlineState(
    reason,
    opts?.assumeOnlineOnNative
  );

  if (
    Capacitor.isNativePlatform() &&
    (opts?.assumeOnlineOnNative ||
      reason === 'native-app-active' ||
      reason === 'native-resume')
  ) {
    nativeNetworkRecoveryUntil = Date.now() + NATIVE_NETWORK_RECOVERY_GRACE_MS;
  }

  const nextFingerprint = getNetworkFingerprint(effectiveOnline);
  const hasNetworkChanged = nextFingerprint !== lastKnownNetworkFingerprint;
  lastKnownNetworkFingerprint = nextFingerprint;
  syncBrowserNetworkState(effectiveOnline);

  if (!effectiveOnline) {
    return;
  }

  syncFreshDataForResume(reason, {
    hardReconnect: opts?.forceHardReconnect || hasNetworkChanged,
    forceRefresh: opts?.forceRefresh || hasNetworkChanged
  });
};

const syncBrowserNetworkState = (isOnline: boolean): void => {
  browserOnline.value = isOnline;

  if (!isOnline) {
    hasWebsocketConnection.value = false;
    isWebsocketConnecting.value = false;
    return;
  }

  if (chatSDK) {
    const isConnected = chatSDK.isConnected();
    hasWebsocketConnection.value = isConnected;
    isWebsocketConnecting.value = !isConnected;

    if (!isConnected) {
      reconnectChatOnResume();
    }
  }
};

const pollBrowserNetworkState = (): void => {
  if (typeof navigator === 'undefined') {
    return;
  }

  const nextOnlineState = navigator.onLine;
  const nextFingerprint = getNetworkFingerprint();

  if (
    nextOnlineState !== browserOnline.value ||
    nextFingerprint !== lastKnownNetworkFingerprint
  ) {
    handleNetworkOrResumeChange('network-poll', {
      forceRefresh: nextOnlineState !== browserOnline.value
    });
  }
};

const ensureNetworkStatePolling = (): void => {
  if (networkStatePollInterval) {
    return;
  }

  networkStatePollInterval = setInterval(() => {
    pollBrowserNetworkState();
  }, 1000);
};

const syncPresenceForVisibility = (): void => {
  if (!chatSDK) {
    return;
  }

  const isActive =
    getIsAppActivelyVisible() ||
    (Capacitor.isNativePlatform() && callsApi?.isCallActive.value);

  chatSDK.sendWebSocketEvent(WebSocketEventType.TOGGLE_PRESENCE, {
    isActive
  });
};

const restoreInvitedGroupCallIfNeeded = (): void => {
  if (
    typeof window === 'undefined' ||
    !isGroupCallInviteUrl(window.location.href)
  ) {
    return;
  }

  void loadCallsApi()
    .then(({ restoreInvitedGroupCallFromUrl }) =>
      restoreInvitedGroupCallFromUrl()
    )
    .catch(error => {
      console.warn('Failed to restore invited group call:', error);
    });
};

const startChatConnectionInBackground = (sdk: ChatSDK): void => {
  const attemptId = ++connectionAttemptId;

  void (async () => {
    try {
      await sdk.connect();

      if (chatSDK !== sdk || attemptId !== connectionAttemptId) {
        return;
      }

      initializeCallHistorySync(sdk);
      await syncPtsStateToServer();
    } catch (error) {
      if (chatSDK !== sdk || attemptId !== connectionAttemptId) {
        return;
      }

      console.warn('Chat websocket startup continues in background:', error);
    } finally {
      if (chatSDK === sdk && attemptId === connectionAttemptId) {
        isWebsocketConnecting.value = false;
        restoreInvitedGroupCallIfNeeded();

        if (Capacitor.isNativePlatform()) {
          initCallKit();
        }

        ensureTauriWindowStateTracking();

        if (!removeAppVisibilityListener) {
          removeAppVisibilityListener = subscribeToAppVisibilityChanges(() => {
            syncPresenceForVisibility();

            if (getIsAppActivelyVisible()) {
              handleNetworkOrResumeChange('app-visible', {
                assumeOnlineOnNative: true,
                forceHardReconnect: true,
                forceRefresh: true
              });
            }
          });
        }
      }
    }
  })();
};

export const initializeChat = async (options: {
  token: string;
  apiUrl: string;
  wsUrl: string;
  userId?: string;
}): Promise<void> => {
  chatSDK = new ChatSDK({
    apiUrl: options.apiUrl,
    wsUrl: options.wsUrl,
    token: options.token
  });
  hasCompletedInitialConnection = false;
  chatSDK.setConnectionStateListener(connected => {
    const wasConnected = hasWebsocketConnection.value;
    isWebsocketConnecting.value = browserOnline.value && !connected;
    hasWebsocketConnection.value = connected;

    void saveShadowSyncMeta('ws_connection', {
      connected,
      timestamp: new Date().toISOString()
    });

    if (!connected) {
      return;
    }

    if (!hasCompletedInitialConnection) {
      hasCompletedInitialConnection = true;
      return;
    }

    if (wasConnected === false && !isWebsocketConnecting.value) {
      void syncPtsStateToServer();
      requestFreshDataRefresh('websocket-reconnect', { force: true });
    }
  });
  areChatListenersBound = false;

  currentUserId.value = options.userId || null;

  if (!isVisibilityListenerAdded) {
    document.addEventListener('visibilitychange', () => {
      if (!chatSDK) return;
      if (document.visibilityState === lastVisibilityState) return;

      lastVisibilityState = document.visibilityState;
      if (document.visibilityState === 'visible') {
        handleNetworkOrResumeChange('app-visible', {
          assumeOnlineOnNative: true,
          forceHardReconnect: true,
          forceRefresh: true
        });
        return;
      }

      syncPresenceForVisibility();
    });
    isVisibilityListenerAdded = true;
  }

  if (!isResumeListenersAdded) {
    window.addEventListener('focus', () => {
      handleNetworkOrResumeChange('window-focus', {
        assumeOnlineOnNative: true
      });
    });

    window.addEventListener('online', () => {
      handleNetworkOrResumeChange('browser-online', {
        assumeOnlineOnNative: true,
        forceHardReconnect: true,
        forceRefresh: true
      });
    });

    window.addEventListener('offline', () => {
      if (Capacitor.isNativePlatform()) {
        handleNetworkOrResumeChange('network-change', {
          assumeOnlineOnNative: true,
          forceHardReconnect: true,
          forceRefresh: true
        });
        return;
      }

      syncBrowserNetworkState(false);
      lastKnownNetworkFingerprint = getNetworkFingerprint();
    });

    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          syncPresenceForVisibility();
          return;
        }

        handleNetworkOrResumeChange('native-app-active', {
          assumeOnlineOnNative: true,
          forceHardReconnect: true,
          forceRefresh: true
        });
      });

      void CapacitorApp.addListener('resume', () => {
        handleNetworkOrResumeChange('native-resume', {
          assumeOnlineOnNative: true,
          forceHardReconnect: true,
          forceRefresh: true
        });
      });
    }

    const networkInformation = getNetworkInformation();

    networkInformation?.addEventListener?.('change', () => {
      handleNetworkOrResumeChange('network-change', {
        assumeOnlineOnNative: true,
        forceHardReconnect: true,
        forceRefresh: true
      });
    });

    ensureNetworkStatePolling();

    isResumeListenersAdded = true;
  }

  browserOnline.value = Capacitor.isNativePlatform() || navigator.onLine;
  lastKnownNetworkFingerprint = getNetworkFingerprint(browserOnline.value);
  isWebsocketConnecting.value = browserOnline.value;
  hasWebsocketConnection.value = false;
  setupChatListeners();
  addMessageHistoryHandler();
  startChatConnectionInBackground(chatSDK);
};

export const getChatSDK = (): ChatSDK | null => {
  return chatSDK;
};

export const setCurrentUserId = (userId?: string | null): void => {
  currentUserId.value = userId || null;
};

export const getCurrentUserId = (): string | null => {
  return currentUserId.value;
};

export const saveMessagesToLocal = (
  topicId: string,
  messages: ChatMessage[]
): void => {
  messagesStore.value[topicId] = messages;
};

export const appendMessageToLocal = (
  topicId: string,
  message: ChatMessage
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const index = existingMessages.findIndex(item => item.id === message.id);

  if (index !== -1) {
    const updated = [...existingMessages];
    updated[index] = message;
    messagesStore.value[topicId] = updated;
  } else {
    messagesStore.value[topicId] = [...existingMessages, message];
  }

  notifyMessageChange(topicId);
};

export const subscribeToMessageChanges = (
  callback: (topicId?: string) => void
): (() => void) => {
  messageChangeCallbacks.push(callback);

  return () => {
    const index = messageChangeCallbacks.indexOf(callback);
    if (index > -1) {
      messageChangeCallbacks.splice(index, 1);
    }
  };
};

export const generateNewMessage = (params: {
  topicId: string;
  text?: string;
  taggedUserIds?: string[];
  medias?: IMedia[];
}): IMessage => {
  return {
    createdAt: new Date(),
    topicId: params.topicId,
    deletedAt: null,
    isEdit: false,
    isPin: false,
    id: null,
    isSystem: false,
    replyMessageId: null,
    senderUserId: authedUser.value.id,
    status: MessageStatus.Wait,
    text: params.text,
    taggedUserIds: params.taggedUserIds,
    updatedAt: null,
    senderUser: authedUser.value,
    media: params.medias
  };
};

export const sendMessageChat = async (params: {
  topicId: string;
  text?: string;
  messageId?: string;
  replyMessageId?: string;
  forwardMessageId?: string;
  taggedUserIds?: string[];
  medias?: IMedia[];
  ex?: string;
}): Promise<boolean> => {
  const sdk = getChatSDK();

  try {
    if (!sdk) {
      return false;
    }

    if (params.messageId) {
      return sdk.sendWebSocketEvent(WebSocketEventType.EDIT_MESSAGE, {
        messageId: params.messageId,
        text: params.text
      });
    }

    return sdk.sendWebSocketEvent(WebSocketEventType.SEND_MESSAGE, {
      topicId: params.topicId,
      text: params.text,
      medias: params.medias,
      ex: params.ex,
      replyMessageId: params.replyMessageId,
      forwardMessageId: params.forwardMessageId,
      taggedUserIds: params.taggedUserIds
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
    return false;
  }
};

export const sendTypingStatus = async (params: {
  topicId: string;
  isTyping: boolean;
}): Promise<boolean> => {
  const sdk = getChatSDK();

  try {
    if (!sdk) {
      return false;
    }

    return sdk.sendWebSocketEvent(WebSocketEventType.TYPING_STATUS, params);
  } catch (error) {
    console.error(
      '[ChatSDK] Failed to send typing status via WebSocket:',
      error
    );
    return false;
  }
};

export const togglePinMessageChat = async (params: {
  topicId: string;
  messageId?: string;
  scope?: 'ALL' | 'SELF';
}): Promise<void> => {
  const sdk = getChatSDK();

  try {
    sdk.sendWebSocketEvent(WebSocketEventType.TOGGLE_PIN_MESSAGE, {
      topicId: params.topicId,
      messageId: params.messageId,
      userId: authedUser.value.id,
      scope: params.scope
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
  }
};

export const deleteMessageChat = async (params: {
  messageId: string;
  topicId: string;
}): Promise<void> => {
  const sdk = getChatSDK();

  try {
    sdk.sendWebSocketEvent(WebSocketEventType.DELETE_MESSAGE, {
      messageId: params.messageId,
      topicId: params.topicId
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
  }
};

export const setReactionMessage = async (params: {
  messageId: string;
  emoji: string;
  topicId: string;
}): Promise<void> => {
  const sdk = getChatSDK();
  const sendReactionOverSocket = (): boolean => {
    try {
      return sdk.sendWebSocketEvent(WebSocketEventType.TOGGLE_REACTION, params);
    } catch (error) {
      console.error('[ChatSDK] Failed to send reaction via WebSocket:', error);
      return false;
    }
  };

  if (sendReactionOverSocket()) {
    return;
  }

  try {
    await sdk.toggleMessageReaction(
      params.topicId,
      params.messageId,
      params.emoji
    );
  } catch (error) {
    if (isAuthError(error)) {
      const token = getAuthToken() || getStoredChatAccessToken();

      if (!token) {
        console.warn(
          '[ChatSDK] Skipping reaction REST fallback because auth token is missing'
        );
        return;
      }

      try {
        const config = getConfig();
        const response = await fetch(
          `${config.CHAT_API_DOMAIN}/topics/${params.topicId}/messages/${params.messageId}/reactions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ emoji: params.emoji })
          }
        );

        if (!response.ok) {
          console.warn(
            '[ChatSDK] Reaction REST fallback returned non-OK status:',
            response.status
          );
        }
      } catch (fallbackError) {
        console.error(
          '[ChatSDK] Failed to toggle reaction via REST fallback:',
          fallbackError
        );
      }

      return;
    }

    if (!sendReactionOverSocket()) {
      console.error('[ChatSDK] Failed to toggle message reaction:', error);
    }
  }
};

export const markTopicReactionSeenChat = async (params: {
  topicId: string;
}): Promise<boolean> => {
  const sdk = getChatSDK();

  try {
    if (!sdk) {
      return false;
    }

    return sdk.sendWebSocketEvent(
      WebSocketEventType.MARK_REACTION_SEEN,
      params
    );
  } catch (error) {
    console.error(
      '[ChatSDK] Failed to send reaction seen via WebSocket:',
      error
    );
    return false;
  }
};

export const uploadFile = async (
  file: File,
  previewMeta?: MediaPreviewDimensions,
  onProgress?: (percent: number) => void,
  isMedia = false,
  telemetry?: UploadTelemetryContext
): Promise<{
  path: string;
  thumbnailPath: string | null;
  file: File;
  ex?: {
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
  };
}> => {
  const sdk = getChatSDK();

  const { objectName, thumbnailObjectName, ex } = await sdk.uploadFile(
    file,
    previewMeta,
    onProgress,
    isMedia,
    telemetry
  );
  return { file, path: objectName, thumbnailPath: thumbnailObjectName, ex };
};

const messageHistoryRequests: Map<
  string,
  {
    resolve: (value: ChatMessage[]) => void;
    reject: (reason: any) => void;
    timeoutId: number;
  }
> = new Map();

const addMessageHistoryHandler = (): void => {
  if (!chatSDK) return;
  chatSDK.subscribeToEvent(
    WebSocketEventType.MESSAGE_HISTORY_RESPONSE,
    event => {
      const { requestId, messages, error } = event.payload;
      const request = messageHistoryRequests.get(requestId);

      if (request) {
        clearTimeout(request.timeoutId);
        messageHistoryRequests.delete(requestId);

        if (error) {
          request.reject(new Error(error));
        } else {
          const topicId = messages[0]?.topicId;

          if (topicId) {
            saveMessagesToLocal(topicId, messages);
            notifyMessageChange(topicId);
          }

          request.resolve(messages);
        }
      }
    }
  );
};

export const getMessagesWithLoadingStatus = (): ChatMessage[] => {
  const cachedMessages = [];
  const hasConnection = !getIsWebsocketConnecting();

  if (hasConnection) {
    return cachedMessages;
  }

  const messagesWithStatus = cachedMessages.map(message => ({
    ...message,
    status: message.status || MessageStatus.Wait,
    loading: true
  }));

  return messagesWithStatus;
};

export const getIsWebsocketConnecting = () =>
  browserOnline.value && isWebsocketConnecting.value;
export const getHasWebsocketConnection = () =>
  browserOnline.value && hasWebsocketConnection.value;
export const getHasBrowserNetwork = () => browserOnline.value;
export const getCanSendReadReceipts = (): boolean => {
  return (
    browserOnline.value &&
    hasWebsocketConnection.value &&
    getIsAppActivelyVisible()
  );
};

export const getIsRecentlyReconnected = () => isRecentlyReconnected.value;

export const markAsRead = async (dto: {
  messageIds: string[];
  topicId: string;
  reachedEnd?: boolean;
}): Promise<void> => {
  const sdk = getChatSDK();
  const { messageIds, topicId, reachedEnd = false } = dto;

  if (messageIds.length === 0) return;

  await sdk.markMessagesAsRead(topicId, messageIds, reachedEnd);
  await clearTopicNotifications(topicId);
};
