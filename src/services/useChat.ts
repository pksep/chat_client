import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { User } from '@pksep/zod-shared-chat';
import { MessageStatus } from './useChatSDK/types';
import type { ChatMessage } from '../types/messages';
import { setAuthUser, getAuthUser, authedUser } from '../composables/useAuth';
import {
  useTopics,
  changeUnreadMessageCount,
  deleteTopicFromList
} from '../composables/useTopics';
import {
  updateLocalGroupDetails,
  updateLocalLastMessageGroup
} from '../composables/useGroup';
import {
  addMessageToLocal,
  changeLocalReadStatus,
  deleteMessageFromLocal,
  editMessageFromLocal,
  playNotificationSound
} from './useMessages';
import { IMedia, IMessage } from 'src/components/interfaces/interfaces';

let chatSDK: ChatSDK | null = null;

const isWebsocketConnecting = ref(true);
const isRecentlyReconnected = ref(false);
const currentUserId = ref<string | null>(null);

const messagesStore = shallowRef<Record<string, ChatMessage[]>>({});

const messageChangeCallbacks: Array<(topicId?: string) => void> = [];

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
  if (!chatSDK) return;

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
    const updatedUser: User = event.payload;
    const currentAuthUser = getAuthUser();

    if (currentAuthUser && currentAuthUser.id === updatedUser.id) {
      setAuthUser(updatedUser);
    }
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

  currentUserId.value = options.userId || null;

  isWebsocketConnecting.value = true;
  await chatSDK.connect();
  isWebsocketConnecting.value = false;
  setupChatListeners();
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
      replyMessageId: params.replyMessageId
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

export const uploadFile = async (
  file: File
): Promise<{ path: string; thumbnailPath: string; file: File }> => {
  const sdk = getChatSDK();

  const { objectName, thumbnailObjectName } = await sdk.uploadFile(file);
  return { file, path: objectName, thumbnailPath: thumbnailObjectName };
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

export const getIsRecentlyReconnected = () => isRecentlyReconnected.value;

export const markAsRead = async (dto: {
  messageIds: string[];
  topicId: string;
}): Promise<void> => {
  if (document.hidden) return;
  const sdk = getChatSDK();
  const { messageIds, topicId } = dto;

  if (messageIds.length === 0) return;

  await sdk.markMessagesAsRead(topicId, messageIds);
};
