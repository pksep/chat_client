import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { ITopic } from '../components/interfaces/interfaces';
import { Message, TopicType } from '../services/useChatSDK/types';
import { fetchAllGroups } from '../services/useGroup';

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
  console.log('updateLocalLastMessageTopic', topicId, lastMessage);
};

export const togglePinTopic = async (topicId: string) => {
  try {
    const sdk = getChatSDK();
    await sdk.togglePinTopic(topicId);

    fetchAllTopics();
    fetchAllGroups();
  } catch (err) {
    console.error('Failed to pin/unpin topic:', err);
  }
};

export const toggleMuteTopic = async (topicId: string) => {
  try {
    const sdk = getChatSDK();
    await sdk.toggleMuteTopic(topicId);

    fetchAllTopics();
    fetchAllGroups();
  } catch (err) {
    console.error('Failed to pin/unpin topic:', err);
  }
};

export const getTopicList = (): ITopic[] => {
  return topics.value || [];
};
