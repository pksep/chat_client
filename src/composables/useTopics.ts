import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { Message, Topic, TopicSetting, User } from '@pksep/zod-shared-chat';
import { IContactProps } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';

const topics = shallowRef<IContactProps[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export const fetchAllTopics = async (
  page = 1,
  limit = 200
): Promise<IContactProps[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics(TopicType.DM, {
      page,
      limit
    });

    // Сохраняем полученные данные в реактивное состояние
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

export const createTopic = async (peerId: string): Promise<IContactProps[]> => {
  loading.value = true;
  error.value = null;

  try {
    const sdk = getChatSDK();
    await sdk.createTopic({ peerId });

    return topics.value;
  } catch (err) {
    error.value = (err as Error).message;
    console.error('Failed to fetch topics:', error.value);
    return topics.value || [];
  } finally {
    loading.value = false;
  }
};


export const getTopicList = (): IContactProps[] => {
  return topics.value || [];
};
