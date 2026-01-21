import { ref } from 'vue';
import { getChatSDK } from './useChat';
import { IMessage } from '../components/interfaces/interfaces';

const messagesStore = ref<Record<string, IMessage[]>>({});

export const fetchMessagesForTopic = async (
  topicId: string,
  opts?: { lastMessageId?: string; limit?: number }
): Promise<IMessage[]> => {
  try {
    const sdk = getChatSDK();
    const messages = await sdk.getMessages(topicId, {
      limit: opts?.limit || 50,
      lastMessageId: opts?.lastMessageId
    });

    if (opts?.lastMessageId) {
      const existingMessages = getMessagesByTopicId(topicId);
      const combinedMessages = [...messages, ...existingMessages];
      saveMessagesToLocal(topicId, combinedMessages);
      return combinedMessages;
    }
    saveMessagesToLocal(topicId, messages);

    return messages;
  } catch (error) {
    console.warn('Failed to fetch message history:', error);
    return getMessagesByTopicId(topicId);
  }
};

export const addMessageToLocal = (topicId: string, message: IMessage): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  messagesStore.value[topicId] = [...existingMessages, message];
};

export const saveMessagesToLocal = (
  topicId: string,
  messages: IMessage[]
): void => {
  messagesStore.value[topicId] = messages;
};

export const getMessagesByTopicId = (topicId: string): IMessage[] => {
  return messagesStore.value[topicId] || [];
};
