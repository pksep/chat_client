import { ref, shallowRef } from 'vue';
import { getChatSDK } from '../services/useChat';
import { Topic } from '@pksep/zod-shared-chat';
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
  // For DM topics, we need to get user information differently
  // Since Topic doesn't have settings, user, or info, we'll use placeholder values
  // In a real implementation, you'd fetch user details separately
  const nickname = 'User'; // Placeholder - would fetch actual user info
  const avatarUrl = null; // Placeholder - would fetch actual avatar
  const initials = 'U'; // Placeholder - would fetch actual initials

  return {
    id: topic.id,
    initials,
    nickname,
    avatarUrl,
    lastOnline: null, // Placeholder - would fetch actual lastOnline
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    deletedAt: topic.deletedAt || null,
    conversationId: topic.id,
    latestMessage: '',
    user: undefined, // Placeholder - would fetch actual user
    info: undefined // Placeholder - would fetch actual info
  };
};

export const getTopicList = (): IContactProps[] => {
  return topics.value || [];
};
