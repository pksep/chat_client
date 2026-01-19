import { ref } from 'vue';
import { ChatMessage } from './useChatSDK/message';
import { getChatSDK } from './useChat';
import { getUserById } from '../composables/useUsers';
import { Message } from '@pksep/zod-shared-chat';

const messagesStore = ref<Record<string, ChatMessage[]>>({});

export const fetchMessagesForTopic = async (
  topicId: string,
  opts?: { lastMessageId?: string; limit?: number }
): Promise<ChatMessage[]> => {
  try {
    const sdk = getChatSDK();
    const messages = await sdk.getMessages(topicId, {
      limit: opts?.limit || 50,
      lastMessageId: opts?.lastMessageId
    });

    const processedMessages = messages.map(mapMessage);
    saveMessagesToLocal(topicId, processedMessages);

    return processedMessages;
  } catch (error) {
    console.warn('Failed to fetch message history:', error);
    return getMessagesByTopicId(topicId);
  }
};

export const addMessageToLocal = (topicId: string, message: Message): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  messagesStore.value[topicId] = [...existingMessages, mapMessage(message)];
};

const normalizeDate = (value?: Date | string | number): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  return new Date(value);
};

const mapMessage = (message: any): ChatMessage => {
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

export const saveMessagesToLocal = (
  topicId: string,
  messages: ChatMessage[]
): void => {
  messagesStore.value[topicId] = messages;
};

export const getMessagesByTopicId = (topicId: string): ChatMessage[] => {
  return messagesStore.value[topicId] || [];
};
