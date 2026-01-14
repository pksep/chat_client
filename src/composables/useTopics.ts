import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { Topic, TopicType } from '../services/useChatSDK/types';
import { IContactProps } from '../components/interfaces/interfaces';

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

    topics.value = response.data.map(item => manipulateTopic(item));

    return topics.value;
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

const manipulateTopic = (topic: Topic): IContactProps => {
  const topicUser = topic?.settings?.[0]?.user;
  const nickname = topicUser?.nickname || topicUser?.initials || '';
  const avatarUrl = topicUser?.avatarUrl || null;
  const initials = topicUser?.initials || nickname;

  return {
    id: topic.id,
    initials,
    nickname,
    avatarUrl,
    lastOnline: topicUser?.lastOnline || null,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    conversationId: topic.id,
    latestMessage: '',
    user: topic.user,
    info: topic.info
  };
};

export const getTopicList = (): IContactProps[] => {
  return topics.value || [];
};
