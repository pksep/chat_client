import { ref, shallowRef } from 'vue';
import { ChatSDK } from './useChatSDK';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import { MediaType, Message, Media } from '@pksep/zod-shared-chat';
import { MessageStatus } from './useChatSDK/types';
import type { S3Config } from './useChatSDK/s3Service';
import { S3Service } from './useChatSDK/s3Service';
import type { ChatMessage } from '../types/messages';
import { getUserById } from '../composables/useUsers';

let chatSDK: ChatSDK | null = null;
let s3Service: S3Service | null = null;

const isWebsocketConnecting = ref(true);
const isRecentlyReconnected = ref(false);
const currentUserId = ref<string | null>(null);

const messagesStore = shallowRef<Record<string, ChatMessage[]>>({});

const messageChangeCallbacks: Array<(topicId?: string) => void> = [];

const normalizeDate = (value?: Date | string | number): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
};

const mapMessage = (message: Message): ChatMessage => {
  const sender = message.senderUserId
    ? getUserById(message.senderUserId)
    : null;
  const createdAt = normalizeDate(message.createdAt);

  return {
    ...message,
    createdAt,
    updatedAt: normalizeDate(message.updatedAt),
    sendTime: createdAt.getTime(),
    senderNickname: sender?.nickname || '',
    faceURL: sender?.avatarUrl || '',
    isSystemMessage: message.isSystem || false,
    systemMessageContent: message.isSystem ? message.text || '' : undefined
  };
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

const setupChatListeners = (): void => {
  if (!chatSDK) return;

  chatSDK.subscribeToEvent(WebSocketEventType.NEW_MESSAGE, event => {
    const msg = mapMessage(event.payload);

    // Find if this is a confirmation of a message we sent by tempId
    const existingMessages = messagesStore.value[msg.topicId] || [];
    const matchingTempMessage = existingMessages.find(tempMsg =>
      tempMsg.tempId === msg.tempId
    );

    let messageToAdd = msg;
    if (matchingTempMessage) {
      // This is a confirmation of a sent message, update the local message
      const updatedMessages = existingMessages.map(m =>
        m.tempId === msg.tempId ? { ...msg, tempId: m.tempId } : m
      );
      messagesStore.value[msg.topicId] = updatedMessages;
      messageToAdd = { ...msg, tempId: matchingTempMessage.tempId };
    } else {
      // This is a new incoming message, add it to the list
      appendMessageToLocal(msg.topicId, messageToAdd);
    }

    // Notify topic-specific listeners if they exist
    if (topicMessageListeners[msg.topicId]) {
      topicMessageListeners[msg.topicId].forEach(listener => {
        try {
          listener(messageToAdd);
        } catch (error) {
          console.error('Error in topic message listener:', error);
        }
      });
    }
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_UPDATED, event => {
    const msg = mapMessage(event.payload);

    // Find if there's a temporary message that corresponds to this updated message
    const existingMessages = messagesStore.value[msg.topicId] || [];
    const matchingTempMessage = existingMessages.find(tempMsg =>
      tempMsg.id === msg.id || // Match by actual message ID
      tempMsg.tempId === msg.tempId // Or match by tempId if preserved
    );

    let messageToAdd = msg;
    if (matchingTempMessage) {
      // Preserve the tempId from the temporary message
      messageToAdd = { ...msg, tempId: matchingTempMessage.tempId };
    }

    appendMessageToLocal(msg.topicId, messageToAdd);

    // Notify topic-specific listeners if they exist
    if (topicMessageListeners[msg.topicId]) {
      topicMessageListeners[msg.topicId].forEach(listener => {
        try {
          listener(messageToAdd);
        } catch (error) {
          console.error('Error in topic message listener:', error);
        }
      });
    }
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_DELETED, event => {
    const topicIds = Object.keys(messagesStore.value);
    topicIds.forEach(topicId => {
      const existing = messagesStore.value[topicId] || [];
      const next = existing.filter(item => item.id !== event.payload.messageId);
      if (next.length !== existing.length) {
        messagesStore.value[topicId] = next;
        notifyMessageChange(topicId);

        // Notify topic-specific listeners if they exist
        if (topicMessageListeners[topicId]) {
          const deletedMessage = existing.find(item => item.id === event.payload.messageId);
          if (deletedMessage) {
            topicMessageListeners[topicId].forEach(listener => {
              try {
                // Pass null or a special indicator for deleted message
                listener({...deletedMessage, deletedAt: new Date()});
              } catch (error) {
                console.error('Error in topic message listener:', error);
              }
            });
          }
        }
      }
    });
  });


  // Add message history handler
  addMessageHistoryHandler();
};

export const initializeChat = async (options: {
  token: string;
  apiUrl: string;
  wsUrl: string;
  userId?: string;
  s3Config?: S3Config;
}): Promise<void> => {
  chatSDK = new ChatSDK(
    {
      apiUrl: options.apiUrl,
      wsUrl: options.wsUrl,
      token: options.token
    },
    options.s3Config
  );

  currentUserId.value = options.userId || null;
  if (options.s3Config) {
    s3Service = new S3Service(options.s3Config);
  }

  isWebsocketConnecting.value = true;
  await chatSDK.connect();
  isWebsocketConnecting.value = false;
  setupChatListeners();
};

export const getChatSDK = (): ChatSDK => {
  if (!chatSDK) {
    throw new Error('ChatSDK is not initialized');
  }
  return chatSDK;
};

export const setCurrentUserId = (userId?: string | null): void => {
  currentUserId.value = userId || null;
};

export const getCurrentUserId = (): string | null => {
  return currentUserId.value;
};

export const getIsWebsocketConnecting = () => isWebsocketConnecting.value;

export const getIsRecentlyReconnected = () => isRecentlyReconnected.value;

// Store for tracking message history requests
const messageHistoryRequests: Map<string, { resolve: (value: ChatMessage[]) => void, reject: (reason: any) => void, timeoutId: number }> = new Map();

export const fetchMessagesForTopic = async (
  topicId: string,
  opts?: { page?: number; limit?: number; since?: Date; append?: boolean }
): Promise<ChatMessage[]> => {
  try {
    // Try WebSocket first for message history (when server supports it)
    return await new Promise((resolve, reject) => {
      // First, return cached messages if available
      const cachedMessages = getMessagesByConversationId(topicId);

      if (cachedMessages.length > 0) {
        resolve(cachedMessages);
        return;
      }

      // Generate a unique request ID for this history request
      const requestId = `${topicId}_${Date.now()}`;

      // Set up timeout to prevent hanging requests
      const timeoutId = window.setTimeout(() => {
        messageHistoryRequests.delete(requestId);
        // If WebSocket request times out, fall back to HTTP
        console.warn(`WebSocket request for message history timed out for topic ${topicId}, falling back to HTTP`);
        resolve(cachedMessages); // Return cached messages or empty array
      }, 5000); // 5 second timeout

      // Store the promise callbacks
      messageHistoryRequests.set(requestId, { resolve, reject, timeoutId });

      try {
        const sdk = getChatSDK();


        // Request message history via WebSocket
        sdk.sendWebSocketEvent(WebSocketEventType.REQUEST_MESSAGE_HISTORY, {
          topicId,
          requestId,
          limit: opts?.limit || 50,
          page: opts?.page || 1
        });
      } catch (error) {
        clearTimeout(timeoutId);
        messageHistoryRequests.delete(requestId);
        reject(error);
      }
    });
  } catch (error) {
    console.warn('WebSocket failed for message history, falling back to HTTP:', error);
    // Fallback to HTTP if WebSocket is not supported by server
    return []; // Return empty array since HTTP methods are disabled
  }
};

export const getMessagesByConversationId = (topicId: string): ChatMessage[] => {
  return messagesStore.value[topicId] || [];
};

// Add to setupChatListeners function
const addMessageHistoryHandler = (): void => {
  if (!chatSDK) return;
  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_HISTORY_RESPONSE, (event) => {
    const { requestId, messages, error } = event.payload;
    const request = messageHistoryRequests.get(requestId);

    if (request) {
      clearTimeout(request.timeoutId);
      messageHistoryRequests.delete(requestId);

      if (error) {
        request.reject(new Error(error));
      } else {
        // Process and cache the received messages
        const processedMessages = messages.map(mapMessage);
        const topicId = processedMessages[0]?.topicId;

        if (topicId) {
          saveMessagesToLocal(topicId, processedMessages);
          notifyMessageChange(topicId);
        }

        request.resolve(processedMessages);
      }
    }
  });
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


export const getMessagesWithLoadingStatus = (
  topicId: string
): ChatMessage[] => {
  const cachedMessages = getMessagesByConversationId(topicId);
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

const buildTempMessage = (params: {
  topicId: string;
  text?: string;
  media?: Media[];
}): ChatMessage => {
  const createdAt = new Date();
  const sender = currentUserId.value ? getUserById(currentUserId.value) : null;
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  return {
    id: tempId,
    topicId: params.topicId,
    senderUserId: currentUserId.value || '',
    reactions: [],
    text: params.text,
    media: params.media || [],
    replyMessageId: undefined,
    isEdit: false,
    status: MessageStatus.Wait,
    isPin: false,
    isSystem: false,
    createdAt,
    updatedAt: createdAt,
    sendTime: createdAt.getTime(),
    senderNickname: sender?.nickname || '',
    faceURL: sender?.avatarUrl || '',
    deletedAt: null,
    loading: true,
    tempId // Сохраняем временный ID для сопоставления с подтверждением
  };
};

export const sendMessageChat = async (params: {
  topicId: string;
  text?: string;
  file?: File;
  onlyMedia?: boolean;
}): Promise<void> => {
  const sdk = getChatSDK();

  // Create temporary message
  const tempMedia = params.file
    ? [{
        id: `temp-media-${Date.now()}`,
        path: URL.createObjectURL(params.file),
        messageId: '',
        type: params.file.type.startsWith('image/')
          ? MediaType.Image
          : params.file.type.startsWith('video/')
            ? MediaType.Video
            : MediaType.File,
        createdAt: new Date(),
        updatedAt: new Date()
      }]
    : undefined;

  const tempMessage = buildTempMessage({
    topicId: params.topicId,
    text: params.text,
    media: tempMedia
  });

  // Add temporary message to local storage immediately
  appendMessageToLocal(params.topicId, tempMessage);

  try {
    // Upload file if present
    let media: Media[] | undefined;
    if (params.file) {
      const uploaded = await sdk.uploadMedia(params.file, params.topicId);
      media = [uploaded];
    }

    // Send message via WebSocket
    sdk.sendWebSocketEvent(WebSocketEventType.SEND_MESSAGE, {
      topicId: params.topicId,
      text: params.text,
      media,
      replyMessageId: undefined
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message via WebSocket:', error);
    // Mark message as failed
    const existingMessages = messagesStore.value[params.topicId] || [];
    const updatedMessages = existingMessages.map(msg =>
      msg.id === tempMessage.id
        ? { ...msg, status: MessageStatus.Error }
        : msg
    );
    messagesStore.value[params.topicId] = updatedMessages;
    notifyMessageChange(params.topicId);
  }
};

export const uploadFile = async (file: File): Promise<string> => {
  if (!s3Service) {
    console.warn('[ChatSDK] S3 config missing, cannot upload file.');
    return '';
  }

  const uploadResult = await s3Service.uploadFile(file);
  return uploadResult.path;
};

// Map to store topic-specific message listeners
const topicMessageListeners: Record<string, Array<(message: ChatMessage) => void>> = {};

/**
 * Subscribe to receive all messages for a specific topic via WebSocket
 * This function sets up a listener that receives new messages for the specified topic
 */
export const subscribeToTopicMessages = (
  topicId: string,
  listener: (message: ChatMessage) => void
): (() => void) => {
  if (!topicMessageListeners[topicId]) {
    topicMessageListeners[topicId] = [];
  }

  topicMessageListeners[topicId].push(listener);

  // Return unsubscribe function
  return () => {
    const index = topicMessageListeners[topicId].indexOf(listener);
    if (index > -1) {
      topicMessageListeners[topicId].splice(index, 1);
    }

    // Clean up empty arrays
    if (topicMessageListeners[topicId].length === 0) {
      delete topicMessageListeners[topicId];
    }
  };
};

/**
 * Get all messages for a topic and subscribe to receive new messages via WebSocket
 * This combines initial fetch with real-time updates
 */
export const getMessagesAndSubscribe = async (
  topicId: string,
  opts?: { page?: number; limit?: number }
): Promise<{
  messages: ChatMessage[];
  unsubscribe: () => void;
}> => {
  // First, fetch existing messages via WebSocket
  const initialMessages = await fetchMessagesForTopic(topicId, opts);

  // Then, set up subscription for new messages
  const unsubscribe = subscribeToTopicMessages(topicId, (message) => {
    // The message is already added to local storage via the global listener
    // So we just need to notify about the change
    notifyMessageChange(topicId);
  });

  return {
    messages: initialMessages,
    unsubscribe
  };
};

export const markAsRead = async (topicId: string): Promise<void> => {
  const sdk = getChatSDK();
  const messages = getMessagesByConversationId(topicId);
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
