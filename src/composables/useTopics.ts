import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { ITopic } from '../components/interfaces/interfaces';
import { Message, TopicSetting, TopicType } from '../services/useChatSDK/types';
import { updateLocalGroupInfo } from '../services/useGroup';

const topics = shallowRef<ITopic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export const fetchAllTopics = async (
  page = 1,
  limit = 200
): Promise<ITopic[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics(TopicType.DM, {
      page,
      limit
    });

    topics.value = response.data;
    return response.data;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch topics:', error.value);
    return topics.value || [];
  } finally {
    loading.value = false;
  }
};

export const createTopic = async (peerId: string): Promise<ITopic[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    const newTopic = await sdk.createTopic({ peerId });

    topics.value = [newTopic, ...topics.value];
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch topics:', error.value);
    return topics.value || [];
  } finally {
    loading.value = false;
  }
};

export const updateLocalLastMessageTopic = (
  topicId: string,
  lastMessage: Message
): void => {
  const topic = topics.value.find(topic => topic.id === topicId);
  if (topic) {
    topic.lastMessage = lastMessage;
  }

  topics.value = [...topics.value];
};

export const updateLocalTopicInfo = (
  topicId: string,
  info: Partial<TopicSetting>
): void => {
  const topic = topics.value.find(topic => topic.id === topicId);
  if (topic) {
    topic.info = { ...topic.info, ...info };
  }

  topics.value = [...topics.value];
};

export const togglePinTopic = async (topic: ITopic) => {
  try {
    const sdk = getChatSDK();
    await sdk.togglePinTopic(topic.id);

    if (topic.type === TopicType.DM) {
      updateLocalTopicInfo(topic.id, { isPin: !topic.info.isPin });
    } else if (topic.type === TopicType.Group) {
      updateLocalGroupInfo(topic.id, { isPin: !topic.info.isPin });
    }
  } catch (err) {
    console.error('Failed to pin/unpin topic:', err);
  }
};

export const toggleMuteTopic = async (topic: ITopic) => {
  try {
    const sdk = getChatSDK();
    await sdk.toggleMuteTopic(topic.id);
    if (topic.type === TopicType.DM) {
      updateLocalTopicInfo(topic.id, { isMute: !topic.info.isMute });
    } else if (topic.type === TopicType.Group) {
      updateLocalGroupInfo(topic.id, { isMute: !topic.info.isMute });
    }
  } catch (err) {
    console.error('Failed to pin/unpin topic:', err);
  }
};

export const addTopicList = (value: ITopic): void => {
  topics.value = [value, ...topics.value];
};

export const sortTopics = (topics: ITopic[]): ITopic[] => {
  return topics.sort((a, b) => {
    const aPin = a.info?.isPin || false;
    const bPin = b.info?.isPin || false;
    if (aPin !== bPin) {
      return aPin ? -1 : 1;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};

export const getTopicList = (): ITopic[] => {
  return sortTopics(topics.value || []);
};
