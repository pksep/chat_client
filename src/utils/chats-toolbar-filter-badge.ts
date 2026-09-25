import type { ChatsToolbarFilter } from '../composables/useChatsToolbarState';
import type { ITopic } from '../components/interfaces/interfaces';
import { getTopicUnreadBadgeCount } from './topicUnreadBadge';
import { getTopicsByChatsToolbarFilter } from './chats-toolbar-filter';

export interface IChatsToolbarFilterBadgeState {
  count: number;
  isMuted: boolean;
}

export type ChatsToolbarFilterBadgeState = Record<
  ChatsToolbarFilter,
  IChatsToolbarFilterBadgeState
>;

export const getTopicsUnreadBadgeState = (
  topics: ITopic[],
  authUserId?: string | null
): IChatsToolbarFilterBadgeState => {
  const unreadTopics = topics
    .map(topic => ({
      topic,
      count: getTopicUnreadBadgeCount(topic, authUserId)
    }))
    .filter(({ count }) => count > 0);

  return {
    count: unreadTopics.reduce((sum, { count }) => sum + count, 0),
    isMuted:
      unreadTopics.length > 0 &&
      unreadTopics.every(
        ({ topic }) => Boolean(topic.info?.isMute) && !topic.taggedMe
      )
  };
};

export const getChatsToolbarFilterBadgeState = (
  topics: ITopic[],
  authUserId?: string | null
): ChatsToolbarFilterBadgeState => ({
  all: getTopicsUnreadBadgeState(
    getTopicsByChatsToolbarFilter(topics, 'all', authUserId),
    authUserId
  ),
  chats: getTopicsUnreadBadgeState(
    getTopicsByChatsToolbarFilter(topics, 'chats', authUserId),
    authUserId
  ),
  groups: getTopicsUnreadBadgeState(
    getTopicsByChatsToolbarFilter(topics, 'groups', authUserId),
    authUserId
  ),
  bots: getTopicsUnreadBadgeState(
    getTopicsByChatsToolbarFilter(topics, 'bots', authUserId),
    authUserId
  )
});

export const getChatsToolbarFilterCounts = (
  badgeState: ChatsToolbarFilterBadgeState
): Record<ChatsToolbarFilter, number> => ({
  all: badgeState.all.count,
  chats: badgeState.chats.count,
  groups: badgeState.groups.count,
  bots: badgeState.bots.count
});

export const getChatsToolbarFilterMutedOnly = (
  badgeState: ChatsToolbarFilterBadgeState
): Record<ChatsToolbarFilter, boolean> => ({
  all: badgeState.all.isMuted,
  chats: badgeState.chats.isMuted,
  groups: badgeState.groups.isMuted,
  bots: badgeState.bots.isMuted
});
