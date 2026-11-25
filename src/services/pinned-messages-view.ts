import { ref } from 'vue';

export const pinnedMessagesViewTopicId = ref('');
export const openPinnedMessagesView = (topicId: string): void => {
  pinnedMessagesViewTopicId.value = topicId;
};
export const closePinnedMessagesView = (): void => {
  pinnedMessagesViewTopicId.value = '';
};
