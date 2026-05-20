import { computed, ref } from 'vue';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { getTopicList } from './useTopics';
import { getAuthUser } from './useAuth';

const isUserInfoOpen = ref(false);
const selectedUser = ref<IUser | null>(null);
const selectedTopic = ref<ITopic | null>(null);

const resolveDirectTopicByUserId = (userId?: string | null): ITopic | null => {
  if (!userId) {
    return null;
  }

  return (
    getTopicList().find(
      topic => topic.type === TopicType.DM && topic.user?.id === userId
    ) || null
  );
};

const resolveUserInfoTopic = (
  user?: IUser | null,
  topic?: ITopic | null
): ITopic | null => {
  if (!user?.id) {
    return null;
  }

  if (topic?.type === TopicType.DM && topic.user?.id === user.id) {
    return topic;
  }

  return resolveDirectTopicByUserId(user.id);
};

export const useUserInfoModal = () => {
  const activeUser = computed(() => selectedUser.value);
  const activeTopic = computed(() =>
    resolveUserInfoTopic(selectedUser.value, selectedTopic.value)
  );
  const canOpenUserInfo = (user?: IUser | null): boolean =>
    !!user?.id && user.id !== getAuthUser()?.id;

  const openUserInfo = (user?: IUser | null, topic?: ITopic | null): void => {
    if (!canOpenUserInfo(user)) {
      return;
    }

    selectedUser.value = user;
    selectedTopic.value = topic || null;
    isUserInfoOpen.value = true;
  };

  const closeUserInfo = (): void => {
    isUserInfoOpen.value = false;
  };

  return {
    isUserInfoOpen,
    activeUser,
    activeTopic,
    openUserInfo,
    closeUserInfo,
    canOpenUserInfo,
    resolveDirectTopicByUserId,
    resolveUserInfoTopic
  };
};
