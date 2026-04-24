import { computed, ref } from 'vue';
import type { IMessage } from '../components/interfaces/interfaces';

const selectedTopicId = ref<string | null>(null);
const selectedMessagesMap = ref<Record<string, IMessage>>({});

const getSelectedMessageIds = () => Object.keys(selectedMessagesMap.value);

export const clearSelectedMessages = (): void => {
  selectedTopicId.value = null;
  selectedMessagesMap.value = {};
};

export const isMessageSelectionModeForTopic = (
  topicId?: string | null
): boolean => {
  return Boolean(
    topicId &&
      selectedTopicId.value === topicId &&
      getSelectedMessageIds().length > 0
  );
};

export const isMessageSelected = (messageId?: string | null): boolean => {
  if (!messageId) {
    return false;
  }

  return Boolean(selectedMessagesMap.value[messageId]);
};

export const enterMessageSelection = (
  topicId: string,
  message: IMessage
): void => {
  if (!topicId || !message?.id) {
    return;
  }

  if (selectedTopicId.value !== topicId) {
    selectedMessagesMap.value = {};
  }

  selectedTopicId.value = topicId;
  selectedMessagesMap.value = {
    ...selectedMessagesMap.value,
    [message.id]: message
  };
};

export const toggleSelectedMessage = (
  topicId: string,
  message: IMessage
): void => {
  if (!topicId || !message?.id) {
    return;
  }

  if (!isMessageSelectionModeForTopic(topicId)) {
    enterMessageSelection(topicId, message);
    return;
  }

  const nextSelectedMessages = { ...selectedMessagesMap.value };

  if (nextSelectedMessages[message.id]) {
    delete nextSelectedMessages[message.id];
  } else {
    nextSelectedMessages[message.id] = message;
  }

  selectedMessagesMap.value = nextSelectedMessages;

  if (Object.keys(nextSelectedMessages).length === 0) {
    clearSelectedMessages();
  }
};

export const useSelectedMessages = () => {
  const selectedMessages = computed(() =>
    Object.values(selectedMessagesMap.value)
  );
  const selectedMessageCount = computed(() => selectedMessages.value.length);

  const getSelectedMessagesForTopic = (topicId?: string | null): IMessage[] => {
    if (!topicId || selectedTopicId.value !== topicId) {
      return [];
    }

    return Object.values(selectedMessagesMap.value);
  };

  return {
    selectedTopicId,
    selectedMessages,
    selectedMessageCount,
    getSelectedMessagesForTopic,
    clearSelectedMessages,
    enterMessageSelection,
    toggleSelectedMessage,
    isMessageSelected,
    isMessageSelectionModeForTopic
  };
};
