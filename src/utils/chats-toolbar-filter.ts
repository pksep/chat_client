import type { ITopic } from '../components/interfaces/interfaces';
import type { ChatsToolbarFilter } from '../composables/useChatsToolbarState';
import { TopicType } from '../services/useChatSDK/types';
import { isBotTopic } from './bot';
import { isFavoriteTopic } from './favorite-topic';

export const getTopicsByChatsToolbarFilter = (
  topics: ITopic[],
  filter: ChatsToolbarFilter,
  authUserId?: string | null
): ITopic[] => {
  if (filter === 'chats') {
    return topics.filter(
      topic =>
        topic.type === TopicType.DM &&
        !isBotTopic(topic) &&
        !isFavoriteTopic(topic, authUserId)
    );
  }

  if (filter === 'groups') {
    return topics.filter(
      topic =>
        topic.type === TopicType.Group && !isFavoriteTopic(topic, authUserId)
    );
  }

  if (filter === 'bots') {
    return topics.filter(topic => isBotTopic(topic));
  }

  return topics;
};
