import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { Media, User } from '@pksep/zod-shared-chat';
import { MessageStatus, TopicType } from './useChatSDK/types';
import type { ChatMessage } from '../types/messages';
import { setAuthUser, getAuthUser } from '../composables/useAuth';
import {
  addGroupList,
  updateLocalGroupDetails,
  updateLocalLastMessageGroup
} from './useGroup';
import {
  addTopicList,
  updateLocalLastMessageTopic
} from '../composables/useTopics';
import { addMessageToLocal } from './useMessages';

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
      if (payload.data.type === TopicType.Group) {
        addGroupList(payload.data);
      } else if (payload.data.type === TopicType.DM) {
        addTopicList(payload.data);
      }
    }
  });

  chatSDK.subscribeToEvent(WebSocketEventType.CHANGE_MESSAGE, ({ payload }) => {
    if (payload.type === 'NEW') {
      addMessageToLocal(payload.data.topicId, payload.data);

      updateLocalLastMessageTopic(payload.data.topicId, payload.data);
      updateLocalLastMessageGroup(payload.data.topicId, payload.data);
    }
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

export const getChatSDK = (): ChatSDK => {
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

export const sendMessageChat = async (params: {
  topicId: string;
  text?: string;
  file?: File;
  onlyMedia?: boolean;
}): Promise<void> => {
  const sdk = getChatSDK();

  try {
    let media: Media[] | undefined;
    if (params.file) {
      const uploaded = await sdk.uploadMedia(params.file, params.topicId);
      media = [uploaded];
    }
    console.log('sendWebSocketEvent', params.topicId);

    sdk.sendWebSocketEvent(WebSocketEventType.SEND_MESSAGE, {
      topicId: params.topicId,
      text: params.text,
      media
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
  }
};

export const uploadFile = async (file: File): Promise<string> => {
  const sdk = getChatSDK();
  const url = await sdk.uploadFile(file);
  return url;
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

export const markAsRead = async (topicId: string): Promise<void> => {
  const sdk = getChatSDK();
  const messages = [];
  const updatedMessages = messages.map(message => {
    if (message.senderUserId !== currentUserId.value) {
      return {
        ...message,
        status: MessageStatus.Read
      };
    }
    return message;
  });

  saveMessagesToLocal(topicId, updatedMessages);
  notifyMessageChange(topicId);

  const unreadMessages = messages.filter(
    message => message.senderUserId !== currentUserId.value
  );
  await Promise.all(
    unreadMessages.map(message =>
      sdk.updateMessageStatus(message.id, MessageStatus.Read)
    )
  );
};
