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
const outgoingMessageQueue = shallowRef<Record<string, ChatMessage[]>>({});

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
    appendMessageToLocal(msg.topicId, msg);
  });

  chatSDK.subscribeToEvent(WebSocketEventType.MESSAGE_UPDATED, event => {
    const msg = mapMessage(event.payload);
    appendMessageToLocal(msg.topicId, msg);
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

export const fetchMessagesForTopic = async (
  topicId: string,
  opts?: { page?: number; limit?: number; since?: Date; append?: boolean }
): Promise<ChatMessage[]> => {
  const sdk = getChatSDK();
  const response = await sdk.getMessages(topicId, opts);
  const messages = response.data.map(mapMessage);

  if (opts?.append) {
    const existing = getMessagesByConversationId(topicId);
    const existingIds = new Set(existing.map(item => item.id));
    const merged = [
      ...messages.filter(item => !existingIds.has(item.id)),
      ...existing
    ];
    saveMessagesToLocal(topicId, merged);
  } else {
    saveMessagesToLocal(topicId, messages);
  }

  notifyMessageChange(topicId);
  return messages;
};

export const getMessagesByConversationId = (topicId: string): ChatMessage[] => {
  return messagesStore.value[topicId] || [];
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

const addToOutgoingMessageQueue = (
  topicId: string,
  message: ChatMessage
): void => {
  const queue = outgoingMessageQueue.value[topicId] || [];
  outgoingMessageQueue.value[topicId] = [...queue, message];
};

const removeFromOutgoingMessageQueue = (
  topicId: string,
  messageId: string
): void => {
  const queue = outgoingMessageQueue.value[topicId] || [];
  outgoingMessageQueue.value[topicId] = queue.filter(
    message => message.id !== messageId
  );
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

  const queuedMessages = outgoingMessageQueue.value[topicId] || [];
  return [...messagesWithStatus, ...queuedMessages];
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

  return {
    id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    loading: true
  };
};

export const sendMessageChat = async (params: {
  topicId: string;
  text?: string;
  file?: File;
  onlyMedia?: boolean;
}): Promise<void> => {
  const sdk = getChatSDK();
  const tempMedia = params.file
    ? ([
        {
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
        }
      ] as Media[])
    : undefined;
  const tempMessage = buildTempMessage({
    topicId: params.topicId,
    text: params.text,
    media: tempMedia
  });

  addToOutgoingMessageQueue(params.topicId, tempMessage);
  appendMessageToLocal(params.topicId, tempMessage);

  try {
    let media: Media[] | undefined;
    if (params.file) {
      const uploaded = await sdk.uploadMedia(params.file, params.topicId);
      media = [uploaded];
    }

    const sentMessage = await sdk.sendMessage(params.topicId, {
      content: params.text,
      attachments: media
    });

    removeFromOutgoingMessageQueue(params.topicId, tempMessage.id);
    appendMessageToLocal(params.topicId, mapMessage(sentMessage));
  } catch (error) {
    console.error('[ChatSDK] Failed to send message:', error);
    removeFromOutgoingMessageQueue(params.topicId, tempMessage.id);
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
