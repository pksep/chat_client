import type { ChatsToolbarFilter } from '../composables/useChatsToolbarState';
import type { ITopic } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { getTopicUnreadBadgeCount } from './topicUnreadBadge';
import { isBotTopic } from './bot';

export interface IChatsToolbarFilterBadgeState {
  count: number;
  isMuted: boolean;
}

export type ChatsToolbarFilterBadgeState = Record<
  ChatsToolbarFilter,
  IChatsToolbarFilterBadgeState
>;

const getTopicsByFilter = (
  topics: ITopic[],
  filter: ChatsToolbarFilter
): ITopic[] => {
  if (filter === 'chats') {
    return topics.filter(
      topic => topic.type === TopicType.DM && !isBotTopic(topic)
    );
  }

  if (filter === 'groups') {
    return topics.filter(topic => topic.type === TopicType.Group);
  }

  if (filter === 'bots') {
    return topics.filter(topic => isBotTopic(topic));
  }

  return topics;
};

const getFilterBadgeState = (
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
  all: getFilterBadgeState(getTopicsByFilter(topics, 'all'), authUserId),
  chats: getFilterBadgeState(getTopicsByFilter(topics, 'chats'), authUserId),
  groups: getFilterBadgeState(getTopicsByFilter(topics, 'groups'), authUserId),
  bots: getFilterBadgeState(getTopicsByFilter(topics, 'bots'), authUserId)
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
