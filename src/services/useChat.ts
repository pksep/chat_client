import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { MessageStatus } from './useChatSDK/types';
import type { ChatMessage } from '../types/messages';
import { authedUser } from '../composables/useAuth';
import {
  useTopics,
  changeUnreadMessageCount,
  deleteTopicFromList,
  fetchAllTopics
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
  getMessagesByTopicId,
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

let chatSDK: ChatSDK | null = null;
let activeCallNotification: Notification | null = null;

const isWebsocketConnecting = ref(true);
const hasWebsocketConnection = ref(false);
const isRecentlyReconnected = ref(false);
const currentUserId = ref<string | null>(null);

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

const setupChatListeners = (): void => {
  if (!chatSDK || areChatListenersBound) return;

  areChatListenersBound = true;

  chatSDK.subscribeToEvent(WebSocketEventType.NEW_MESSAGE, event => {
    appendMessageToLocal(event.payload.topicId, event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_UPDATED, event => {
    appendMessageToLocal(event.payload.topicId, event.payload);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_DELETED, event => {
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
    const { id, lastOnline } = event.payload;
    updateLocalUserStatus(id, lastOnline);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CHANGE_TOPIC, ({ payload }) => {
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
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CHANGE_MESSAGE, ({ payload }) => {
    const { updateLocalLastMessageTopic } = useTopics();

    if (payload.type === 'NEW') {
      addMessageToLocal(payload.data.topicId, payload.data);
      if (payload.data.senderUserId !== currentUserId.value) {
        playNotificationSound(payload.data.topicId);
        changeUnreadMessageCount(1, payload.data.topicId);
      }
    } else if (payload.type === 'DELETE') {
      deleteMessageFromLocal(payload.data.topicId, payload.data.id);
    } else if (payload.type === 'CHANGE' || payload.type === 'PIN') {
      editMessageFromLocal(payload.data.topicId, payload.data);
    }

    updateLocalLastMessageTopic(payload.data.topicId);
    updateLocalLastMessageGroup(payload.data.topicId);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.READ_MESSAGE, ({ payload }) => {
    changeLocalReadStatus(payload.topicId, payload.messageIds, payload.userId);

    if (payload.userId === currentUserId.value) {
      void clearTopicNotifications(payload.topicId);
    }
  });

  chatSDK.subscribeToEvent(
    WebSocketEventType.REACTION_UPDATED,
    ({ payload }) => {
      changeReactionFromLocal(
        payload.topicId,
        payload.messageId,
        payload.action,
        payload.reaction,
        payload.reactionId
      );
    }
  );

  chatSDK.subscribeToEvent(WebSocketEventType.INCOMING_CALL, ({ payload }) => {
    const user = getUserById(payload.callerId);
    if (user) {
      handleIncomingCall(user, payload.roomId, payload.topicId);

      // If we are on native mobile, show the system incoming call screen
      if (Capacitor.isNativePlatform()) {
        showIncomingCallKit(user.initials, payload.roomId, user.avatarUrl);
      } else {
        // Desktop/Web: If page is hidden (minimized), show a system notification
        if (document.hidden && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            if (activeCallNotification) activeCallNotification.close();

            activeCallNotification = new Notification('Входящий вызов', {
              body: `Звонит ${user.initials}`,
              icon: '/favicon.ico',
              requireInteraction: true
            });

            activeCallNotification.onclick = () => {
              window.focus();
              if (activeCallNotification) {
                activeCallNotification.close();
                activeCallNotification = null;
              }
            };
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        }
      }
    }
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CALL_ANSWERED, ({ payload }) => {
    if (activeCallNotification) {
      activeCallNotification.close();
      activeCallNotification = null;
    }
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
      if (activeCallNotification) {
        activeCallNotification.close();
        activeCallNotification = null;
      }
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

const route = useUrlWatcher();

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
  const existingMessages = getMessagesByTopicId(topicId);
  const existingMessageIds = new Set(
    existingMessages.map(message => message.id)
  );
  const latestMessages = await fetchMessagesForTopic(topicId, {
    limit: 50,
    skipSave: true
  });

  if (latestMessages.length > 0) {
    mergeMessagesForTopic(topicId, latestMessages, 'replace');

    const hasIncomingMessages = latestMessages.some(
      message =>
        !existingMessageIds.has(message.id) &&
        message.senderUserId !== currentUserId.value
    );

    if (hasIncomingMessages) {
      playNotificationSound(topicId);
    }
    return;
  }

  if (existingMessages.length === 0) {
    const fallbackMessages = await fetchMessagesForTopic(topicId);

    const hasIncomingMessages = fallbackMessages.some(
      message => message.senderUserId !== currentUserId.value
    );

    if (hasIncomingMessages) {
      playNotificationSound(topicId);
    }
  }
};

const refreshDataAfterReconnect = async (): Promise<void> => {
  if (isRefreshingAfterReconnect) {
    return;
  }

  isRefreshingAfterReconnect = true;

  try {
    await Promise.allSettled([fetchAllTopics(), fetchAllUsers()]);

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
    hasWebsocketConnection.value = connected;

    if (connected && wasConnected === false && !isWebsocketConnecting.value) {
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
      reconnectChatOnResume();
      if (!document.hidden) {
        syncPresenceForVisibility();
      }
    });

    isResumeListenersAdded = true;
  }

  isWebsocketConnecting.value = true;
  hasWebsocketConnection.value = false;
  setupChatListeners();
  await chatSDK.connect();
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
}): Promise<void> => {
  const sdk = getChatSDK();

  try {
    if (params.messageId) {
      sdk.sendWebSocketEvent(WebSocketEventType.EDIT_MESSAGE, {
        messageId: params.messageId,
        text: params.text
      });

      return;
    }

    sdk.sendWebSocketEvent(WebSocketEventType.SEND_MESSAGE, {
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
  onProgress?: (percent: number) => void
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
    onProgress
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

export const getIsWebsocketConnecting = () => isWebsocketConnecting.value;
export const getHasWebsocketConnection = () => hasWebsocketConnection.value;

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
