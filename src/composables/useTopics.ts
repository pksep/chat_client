import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { Topic, TopicType } from '../services/useChatSDK/types';

const topics = shallowRef<Topic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export const fetchAllTopics = async (
  page = 1,
  limit = 200
): Promise<Topic[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics(TopicType.DM, {
      page,
      limit
    });

    topics.value = response.data;

    return topics.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch topics:', error.value);
    return topics.value || [];
  } finally {
    loading.value = false;
  }
};

export const getTopicList = (): Topic[] => {
  return topics.value || [];
};
