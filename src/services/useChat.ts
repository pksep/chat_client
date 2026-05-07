import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
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
  setTopicTypingState,
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
import {
  handleIncomingCall,
  handleCallAnswered,
  handleCallEnded,
  removeActiveGroupCall,
  removeInvitedGroupCall,
  restoreInvitedGroupCallFromUrl,
  syncServerActiveCalls
} from './useCalls';
import { roomId as liveKitRoomId } from './useLiveKit';
import { Capacitor } from '@capacitor/core';
import { initCallKit, showIncomingCallKit, endAllCallKits } from './useCallKit';
import { clearTopicNotifications } from './useNotificationNavigation';
import type { MediaPreviewDimensions } from '../utils/mediaPreview';
import { useUrlWatcher } from '../composables/navigation';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import {
  loadShadowSyncMeta,
  recordShadowChatEvent,
  saveShadowReadState,
  saveShadowSyncMeta
} from './useShadowChatSync';

let chatSDK: ChatSDK | null = null;

const isWebsocketConnecting = ref(true);
const hasWebsocketConnection = ref(false);
const browserOnline = ref(
  typeof navigator === 'undefined' ? true : navigator.onLine
);
const isRecentlyReconnected = ref(false);
const currentUserId = ref<string | null>(null);
const suspendIncomingMergeByTopic = ref<Record<string, boolean>>({});
const bufferedIncomingMessagesByTopic = ref<Record<string, IMessage[]>>({});

const messagesStore = shallowRef<Record<string, ChatMessage[]>>({});

const messageChangeCallbacks: Array<(topicId?: string) => void> = [];
let areChatListenersBound = false;

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

  const handleIncomingSocketMessage = (message: IMessage): void => {
    const { updateLocalLastMessageTopic } = useTopics();
    const isDuplicateMessage = hasMessageInTopic(message.topicId, message.id);
    const unreadCountBefore = totalUnreadCount.value;
    const shouldSuspendMerge =
      message.senderUserId !== currentUserId.value &&
      route.value.id === message.topicId &&
      suspendIncomingMergeByTopic.value[message.topicId] === true;

    if (!shouldSuspendMerge) {
      addMessageToLocal(message.topicId, message);
    } else if (
      !isDuplicateMessage &&
      message.senderUserId !== currentUserId.value &&
      !message.isReadByMe &&
      !message.isSystem
    ) {
      const existingBuffered =
        bufferedIncomingMessagesByTopic.value[message.topicId] || [];
      if (!existingBuffered.some(item => item.id === message.id)) {
        bufferedIncomingMessagesByTopic.value[message.topicId] = [
          ...existingBuffered,
          message
        ];
      }

      changeUnreadMessageCount(1, message.topicId);
    }

    if (!isDuplicateMessage && message.senderUserId !== currentUserId.value) {
      if (
        document.visibilityState !== 'visible' &&
        message.topicId === route.value.id &&
        totalUnreadCount.value === unreadCountBefore
      ) {
        incrementDisplayedUnreadCount(1);
      }

      playNotificationSound(message.topicId);
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

  const handleChangeMessagePayload = (payload: {
    type: 'NEW' | 'CHANGE' | 'DELETE' | 'PIN';
    data: any;
    messageId?: string;
    ptsMeta?: PtsMeta;
  }): void => {
    persistPtsMeta(payload.ptsMeta);

    if (payload.type === 'NEW') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: 'new_message',
        source: 'ws',
        payload: payload.data
      });
      handleIncomingSocketMessage(payload.data);
    } else if (payload.type === 'DELETE') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: 'delete_message',
        source: 'ws',
        payload: payload.data
      });
      deleteMessageFromLocal(payload.data.topicId, payload.data.id);
    } else if (payload.type === 'CHANGE' || payload.type === 'PIN') {
      void recordShadowChatEvent({
        topicId: payload.data.topicId,
        type: payload.type === 'PIN' ? 'pin_message' : 'edit_message',
        source: 'ws',
        payload: payload.data
      });
      editMessageFromLocal(payload.data.topicId, payload.data);
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
    ptsMeta?: PtsMeta;
  }): void => {
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
  };

  const handleUserUpdatedPayload = (payload: {
    id: string;
    lastOnline: Date | null;
    ptsMeta?: PtsMeta;
  }): void => {
    persistPtsMeta(payload.ptsMeta);
    updateLocalUserStatus(payload.id, payload.lastOnline);
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
    appendMessageToLocal(event.payload.topicId, event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_DELETED, event => {
    const payloadTopicId = (event.payload as any).topicId;

    if (payloadTopicId) {
      deleteMessageFromLocal(payloadTopicId, event.payload.messageId);
    }

    const topicIds = Object.keys(messagesStore.value);
    topicIds.forEach(topicId => {
      const existing = messagesStore.value[topicId] || [];
      const next = existing.filter(item => item.id !== event.payload.messageId);
      if (next.length !== existing.length) {
        messagesStore.value[topicId] = next;
        notifyMessageChange(topicId);
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
          handleChangeMessagePayload({
            ...(event.payload as any),
            ptsMeta
          });
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
          persistPtsMeta(ptsMeta);
          break;
      }
    });
  });

  chatSDK.subscribeToEvent(WebSocketEventType.INCOMING_CALL, ({ payload }) => {
    const user = getUserById(payload.callerId);
    if (user) {
      handleIncomingCall(user, payload.roomId, payload.topicId);
      const topic = useTopics().getSelectedTopic(payload.topicId) as any;
      const isGroupCall = topic?.type === TopicType.Group;

      // If we are on native mobile, show the system incoming call screen
      if (Capacitor.isNativePlatform() && !isGroupCall) {
        showIncomingCallKit(
          user.initials,
          payload.roomId,
          user.avatarUrl,
          payload.topicId
        );
      }
    }
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CALL_ANSWERED, ({ payload }) => {
    if (Capacitor.isNativePlatform()) {
      endAllCallKits();
    }
    handleCallAnswered(payload.userId, payload.roomId);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.ACTIVE_CALLS, ({ payload }) => {
    syncServerActiveCalls(payload.calls);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CALL_ENDED, ({ payload }) => {
    removeActiveGroupCall(payload.topicId);
    removeInvitedGroupCall(payload.roomId);

    // Only cleanup if the roomId matches our current active call
    if (payload.roomId === liveKitRoomId.value) {
      if (Capacitor.isNativePlatform()) {
        endAllCallKits();
      }
      handleCallEnded();
    }
  });
};

let isVisibilityListenerAdded = false;
let isResumeListenersAdded = false;
let lastVisibilityState = document.visibilityState;
let reconnectRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let isRefreshingAfterReconnect = false;
const MAX_BACKGROUND_TOPIC_RECONCILES = 12;
let networkStatePollInterval: ReturnType<typeof setInterval> | null = null;

const route = useUrlWatcher();

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

const refreshActiveTopicMessagesAfterReconnect = async (
  topicId: string
): Promise<void> => {
  const existingMessages = getFullMessagesByTopicId(topicId);
  const latestMessages = await fetchMessagesForTopic(topicId, {
    limit: 50,
    skipSave: true
  });

  if (latestMessages.length > 0) {
    mergeMessagesForTopic(topicId, latestMessages, 'replace', {
      syncLastMessage: true
    });
    return;
  }

  if (existingMessages.length === 0) {
    await fetchMessagesForTopic(topicId);
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

  await Promise.allSettled(
    topicsToRefresh.map(topic =>
      fetchMessagesForTopic(topic.id, {
        limit: 100,
        forceRefresh: true,
        forceNetwork: true,
        syncLastMessage: true
      })
    )
  );
};

const refreshDataAfterReconnect = async (): Promise<void> => {
  if (isRefreshingAfterReconnect) {
    return;
  }

  isRefreshingAfterReconnect = true;

  try {
    await Promise.allSettled([fetchAllTopics(), fetchAllUsers()]);
    await reconcileTopicCachesAfterReconnect();

    if (route.value.id) {
      await Promise.allSettled([
        fetchPinnedMessagesForTopic(route.value.id),
        refreshActiveTopicMessagesAfterReconnect(route.value.id)
      ]);

      if (route.value.type === RouteTypes.GROUP) {
        getGroupById(route.value.id);
      }
    }
  } finally {
    isRefreshingAfterReconnect = false;
  }
};

const reconnectChatOnResume = (): void => {
  if (!chatSDK) {
    return;
  }

  chatSDK.reconnectIfNeeded();
};

const syncBrowserNetworkState = (isOnline: boolean): void => {
  browserOnline.value = isOnline;

  if (!isOnline) {
    hasWebsocketConnection.value = false;
    isWebsocketConnecting.value = false;
    return;
  }

  if (chatSDK) {
    isWebsocketConnecting.value = true;
    reconnectChatOnResume();
  }
};

const pollBrowserNetworkState = (): void => {
  if (typeof navigator === 'undefined') {
    return;
  }

  const nextOnlineState = navigator.onLine;

  if (nextOnlineState !== browserOnline.value) {
    syncBrowserNetworkState(nextOnlineState);
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

  const isActive = document.visibilityState === 'visible';
  chatSDK.sendWebSocketEvent(WebSocketEventType.TOGGLE_PRESENCE, {
    isActive
  });
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
  chatSDK.setConnectionStateListener(connected => {
    const wasConnected = hasWebsocketConnection.value;
    isWebsocketConnecting.value = browserOnline.value && !connected;
    hasWebsocketConnection.value = connected;

    void saveShadowSyncMeta('ws_connection', {
      connected,
      timestamp: new Date().toISOString()
    });

    if (connected && wasConnected === false && !isWebsocketConnecting.value) {
      void syncPtsStateToServer();
      markRecentlyReconnected();
      void refreshDataAfterReconnect();
    }
  });
  areChatListenersBound = false;

  currentUserId.value = options.userId || null;

  if (!isVisibilityListenerAdded) {
    document.addEventListener('visibilitychange', () => {
      if (!chatSDK) return;
      if (document.visibilityState === lastVisibilityState) return;

      lastVisibilityState = document.visibilityState;
      reconnectChatOnResume();
      syncPresenceForVisibility();
    });
    isVisibilityListenerAdded = true;
  }

  if (!isResumeListenersAdded) {
    window.addEventListener('focus', () => {
      reconnectChatOnResume();
      if (!document.hidden) {
        syncPresenceForVisibility();
      }
    });

    window.addEventListener('online', () => {
      syncBrowserNetworkState(true);
      reconnectChatOnResume();
      if (!document.hidden) {
        syncPresenceForVisibility();
      }
    });

    window.addEventListener('offline', () => {
      syncBrowserNetworkState(false);
    });

    const networkInformation = (
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            connection?: {
              addEventListener?: (type: string, cb: () => void) => void;
            };
          })
        : null
    )?.connection;

    networkInformation?.addEventListener?.('change', () => {
      syncBrowserNetworkState(navigator.onLine);

      if (navigator.onLine) {
        reconnectChatOnResume();
      }
    });

    ensureNetworkStatePolling();

    isResumeListenersAdded = true;
  }

  browserOnline.value = navigator.onLine;
  isWebsocketConnecting.value = navigator.onLine;
  hasWebsocketConnection.value = false;
  setupChatListeners();
  await chatSDK.connect();
  await syncPtsStateToServer();
  isWebsocketConnecting.value = false;
  await restoreInvitedGroupCallFromUrl();

  if (Capacitor.isNativePlatform()) {
    initCallKit();
  }

  addMessageHistoryHandler();
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
}): Promise<void> => {
  const sdk = getChatSDK();

  try {
    sdk.sendWebSocketEvent(WebSocketEventType.TOGGLE_PIN_MESSAGE, {
      topicId: params.topicId,
      messageId: params.messageId,
      userId: authedUser.value.id
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

  try {
    sdk.sendWebSocketEvent(WebSocketEventType.TOGGLE_REACTION, params);
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
  }
};

export const uploadFile = async (
  file: File,
  previewMeta?: MediaPreviewDimensions,
  onProgress?: (percent: number) => void,
  isMedia = false
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
    isMedia
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
  const canUseVisibleAsFocused =
    Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

  return (
    browserOnline.value &&
    hasWebsocketConnection.value &&
    document.visibilityState === 'visible' &&
    (document.hasFocus() || canUseVisibleAsFocused)
  );
};

export const getIsRecentlyReconnected = () => isRecentlyReconnected.value;

export const markAsRead = async (dto: {
  messageIds: string[];
  topicId: string;
}): Promise<void> => {
  const sdk = getChatSDK();
  const { messageIds, topicId } = dto;

  if (messageIds.length === 0) return;

  await sdk.markMessagesAsRead(topicId, messageIds);
  await clearTopicNotifications(topicId);
};
