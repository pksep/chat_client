import type { ITopic } from '../components/interfaces/interfaces';
import { getFullMessagesByTopicId } from '../services/useMessages';
import { getDisplayableTopicUnreadCount } from './topicUnreadCount';

export const getTopicUnreadBadgeCount = (
  topic?: ITopic,
  authUserId?: string | null
): number =>
  getDisplayableTopicUnreadCount(topic, authUserId, getFullMessagesByTopicId);

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
