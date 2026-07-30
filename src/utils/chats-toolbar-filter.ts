import type { ITopic } from '../components/interfaces/interfaces';
import type { ChatsToolbarFilter } from '../composables/useChatsToolbarState';
import { TopicType } from '../services/useChatSDK/types';
import { isBotTopic } from './bot';
import { isCallTopic } from './call-topic';
import { isFavoriteTopic } from './favorite-topic';

export const getTopicsByChatsToolbarFilter = (
  topics: ITopic[],
  filter: ChatsToolbarFilter,
  authUserId?: string | null
): ITopic[] => {
  const visibleTopics = topics.filter(topic => !isCallTopic(topic));

  if (filter === 'chats') {
    return visibleTopics.filter(
      topic =>
        topic.type === TopicType.DM &&
        !isBotTopic(topic) &&
        !isFavoriteTopic(topic, authUserId)
    );
  }

  if (filter === 'groups') {
    return visibleTopics.filter(
      topic =>
        topic.type === TopicType.Group && !isFavoriteTopic(topic, authUserId)
    );
  }

  if (filter === 'bots') {
    return visibleTopics.filter(topic => isBotTopic(topic));
  }

  return visibleTopics;
};
