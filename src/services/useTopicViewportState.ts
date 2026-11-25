import { shallowRef } from 'vue';
import { pinnedMessagesViewTopicId } from './pinned-messages-view';

const topicNearBottomState = new Map<string, boolean>();
const topicMessageVisibilityCheckers = new Map<
  string,
  (messageId: string) => boolean
>();
export const pendingTopicReactionJump = shallowRef<{
  topicId: string;
  messageId: string;
} | null>(null);

export const setTopicNearBottomState = (
  topicId: string,
  isNearBottom: boolean
): void => {
  topicNearBottomState.set(topicId, isNearBottom);
};

export const clearTopicNearBottomState = (topicId: string): void => {
  topicNearBottomState.delete(topicId);
};

export const getIsTopicNearBottom = (topicId: string): boolean =>
  pinnedMessagesViewTopicId.value !== topicId &&
  topicNearBottomState.get(topicId) === true;

export const setTopicMessageVisibilityChecker = (
  topicId: string,
  checker: (messageId: string) => boolean
): void => {
  topicMessageVisibilityCheckers.set(topicId, checker);
};

export const clearTopicMessageVisibilityChecker = (topicId: string): void => {
  topicMessageVisibilityCheckers.delete(topicId);
};

export const getIsTopicMessageVisible = (
  topicId: string,
  messageId: string
): boolean =>
  pinnedMessagesViewTopicId.value !== topicId &&
  topicMessageVisibilityCheckers.get(topicId)?.(messageId) === true;

export const requestTopicReactionJump = (
  topicId: string,
  messageId: string
): void => {
  pendingTopicReactionJump.value = { topicId, messageId };
};

export const clearPendingTopicReactionJump = (
  topicId: string,
  messageId: string
): void => {
  const pendingJump = pendingTopicReactionJump.value;

  if (pendingJump?.topicId === topicId && pendingJump.messageId === messageId) {
    pendingTopicReactionJump.value = null;
  }
};
