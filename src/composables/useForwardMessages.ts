import { computed, ref } from 'vue';
import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import {
  navigateToDialogs,
  navigateToGroup
} from './navigation/useUrlRouting';

const pendingForwardTopicId = ref<string | null>(null);
const pendingForwardMessages = ref<IMessage[]>([]);

const cloneMessages = (messages: IMessage[]): IMessage[] => [...messages];

export const clearPendingForwardMessages = (): void => {
  pendingForwardTopicId.value = null;
  pendingForwardMessages.value = [];
};

export const openForwardDraft = (
  topic: ITopic,
  messages: IMessage[] | IMessage | null | undefined
): void => {
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter(Boolean)
    : messages
      ? [messages]
      : [];

  if (!topic?.id || normalizedMessages.length === 0) {
    clearPendingForwardMessages();
    return;
  }

  pendingForwardTopicId.value = topic.id;
  pendingForwardMessages.value = cloneMessages(normalizedMessages);

  if (topic.type === TopicType.DM) {
    navigateToDialogs(topic.id);
    return;
  }

  navigateToGroup(topic.id);
};

export const consumePendingForwardMessages = (
  topicId?: string | null
): IMessage[] => {
  if (!topicId || pendingForwardTopicId.value !== topicId) {
    return [];
  }

  const messages = cloneMessages(pendingForwardMessages.value);
  clearPendingForwardMessages();
  return messages;
};

export const usePendingForwardMessages = () => {
  const hasPendingForwardMessages = computed(
    () => pendingForwardMessages.value.length > 0
  );

  return {
    pendingForwardTopicId,
    pendingForwardMessages,
    hasPendingForwardMessages,
    openForwardDraft,
    clearPendingForwardMessages,
    consumePendingForwardMessages
  };
};
