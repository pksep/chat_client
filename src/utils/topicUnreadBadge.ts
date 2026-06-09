import type { ITopic } from '../components/interfaces/interfaces';
import { getFullMessagesByTopicId } from '../services/useMessages';
import {
  isUnreadIgnoredMessageForUser,
  isUnreadTrackableMessageForUser
} from './messageTracking';

const hasLocalUnreadUserMessages = (
  topicId?: string,
  authUserId?: string | null
): boolean => {
  if (!topicId || !authUserId) {
    return false;
  }

  return getFullMessagesByTopicId(topicId).some(
    message =>
      isUnreadTrackableMessageForUser(message, authUserId) &&
      message.senderUserId !== authUserId &&
      message.isReadByMe !== true
  );
};

export const getTopicUnreadBadgeCount = (
  topic?: ITopic,
  authUserId?: string | null
): number => {
  if (!topic || !authUserId) {
    return 0;
  }

  if (
    (topic.unreadMessageCount || 0) <= 0 ||
    topic.lastMessage?.senderUserId === authUserId
  ) {
    return 0;
  }

  if (
    isUnreadIgnoredMessageForUser(topic.lastMessage, authUserId) &&
    !hasLocalUnreadUserMessages(topic.id, authUserId)
  ) {
    return 0;
  }

  return topic.unreadMessageCount || 0;
};

export const hasTopicUnreadBadge = (
  topic?: ITopic,
  authUserId?: string | null
): boolean => getTopicUnreadBadgeCount(topic, authUserId) > 0;

export const hasTopicManualUnreadMark = (topic?: ITopic): boolean =>
  Boolean(topic?.info?.isMarkedUnread);

export const hasTopicUnreadIndicator = (
  topic?: ITopic,
  authUserId?: string | null
): boolean =>
  hasTopicUnreadBadge(topic, authUserId) || hasTopicManualUnreadMark(topic);
