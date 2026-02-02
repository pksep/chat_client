import { ref } from 'vue';
import { getChatSDK } from './useChat';
import { IMessage } from '../components/interfaces/interfaces';
import { MessageStatus } from './useChatSDK/types';
import {
  changeUnreadMessageCount,
  updateLocalTopicReadStatus
} from '../composables/useTopics';
import { isTopicMuted } from '../composables/useTopics';
import { useUrlWatcher } from '../composables/navigation';
import { authedUser } from '../composables/useAuth';

const messagesStore = ref<Record<string, IMessage[]>>({});

const route = useUrlWatcher();

export const fetchMessagesForTopic = async (
  topicId: string = route.value.id,
  opts?: { lastMessageId?: string; limit?: number }
): Promise<IMessage[]> => {
  try {
    if (!topicId) return;
    const sdk = getChatSDK();
    if (!sdk) return;
    const messages = await sdk.getMessages(topicId, {
      limit: opts?.limit || 50,
      lastMessageId: opts?.lastMessageId
    });

    if (opts?.lastMessageId) {
      const existingMessages = getMessagesByTopicId(topicId);
      const combinedMessages = [...messages, ...existingMessages];
      saveMessagesToLocal(topicId, combinedMessages);
      return messages;
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

export const deleteMessageFromLocal = (
  topicId: string,
  messageId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const deletedMessage = existingMessages.find(
    message => message.id === messageId
  );
  messagesStore.value[topicId] = existingMessages.filter(
    message => message.id !== messageId
  );

  if (
    deletedMessage.senderUser?.id !== authedUser.value?.id &&
    deletedMessage.status !== 'READ'
  ) {
    changeUnreadMessageCount(-1, topicId);
  }
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

export const changeLocalReadStatus = (
  topicId: string,
  messageIds: string[]
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const updatedMessages = existingMessages.map(message => {
    if (messageIds.includes(message.id)) {
      return {
        ...message,
        status: MessageStatus.Read
      };
    }
    return message;
  });
  updateLocalTopicReadStatus(topicId, messageIds);
  changeUnreadMessageCount(-messageIds.length, topicId);
  messagesStore.value[topicId] = updatedMessages;
};

export const changeFileLoadingStatus = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const message = existingMessages.find(message => message.id === messageId);
  const media = message.media?.find(media => media.id === fileId);
  media.isLoading = false;
};

export const playNotificationSound = (topicId?: string): void => {
  if ((topicId && isTopicMuted(topicId)) || route.value.id === topicId) {
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
