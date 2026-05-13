import type { ITopic } from '../components/interfaces/interfaces';

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

  return topic.unreadMessageCount || 0;
};

export const hasTopicUnreadBadge = (
  topic?: ITopic,
  authUserId?: string | null
): boolean => getTopicUnreadBadgeCount(topic, authUserId) > 0;
