import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import {
  isUnreadIgnoredMessageForUser,
  isUnreadTrackableMessageForUser
} from './messageTracking';

type TopicMessagesResolver = (topicId: string) => IMessage[];

const hasLocalUnreadUserMessages = (
  topicId: string,
  authUserId: string,
  getTopicMessages: TopicMessagesResolver
): boolean => {
  return getTopicMessages(topicId).some(
    message =>
      isUnreadTrackableMessageForUser(message, authUserId) &&
      message.senderUserId !== authUserId &&
      message.isReadByMe !== true
  );
};

export const getDisplayableTopicUnreadCount = (
  topic: ITopic | undefined,
  authUserId: string | null | undefined,
  getTopicMessages: TopicMessagesResolver
): number => {
  if (!topic || !authUserId) {
    return 0;
  }

  const unreadCount = Math.max(0, topic.unreadMessageCount || 0);

  if (unreadCount <= 0 || topic.lastMessage?.senderUserId === authUserId) {
    return 0;
  }

  if (
    isUnreadIgnoredMessageForUser(topic.lastMessage, authUserId) &&
    !hasLocalUnreadUserMessages(topic.id, authUserId, getTopicMessages)
  ) {
    return 0;
  }

  return unreadCount;
};
