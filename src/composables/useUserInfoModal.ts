import { computed, ref } from 'vue';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { getTopicList } from './useTopics';
import { getAuthUser } from './useAuth';
import { useManagerInquiries } from './useManagerInquiries';
import { currentRoute } from './navigation';
import { isDeletedBotUser } from '../utils/bot';

const isUserInfoOpen = ref(false);
const selectedUser = ref<IUser | null>(null);
const selectedTopic = ref<ITopic | null>(null);
const onUserInfoOpenChat = ref<(() => void) | null>(null);

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

  const { inquiries } = useManagerInquiries();
  const inquiry =
    inquiries.value.find(
      item =>
        item.guest_user_id === user.id &&
        item.topic_id === (topic?.id || currentRoute.value?.id)
    ) || inquiries.value.find(item => item.guest_user_id === user.id);
  if (inquiry)
    return getTopicList().find(item => item.id === inquiry.topic_id) || null;

  if (topic?.type === TopicType.DM && topic.user?.id === user.id) {
    return (
      getTopicList().find(item => item.id === topic.id) ||
      resolveDirectTopicByUserId(user.id) ||
      topic
    );
  }

  return resolveDirectTopicByUserId(user.id);
};

export const useUserInfoModal = () => {
  const activeTopic = computed(() =>
    resolveUserInfoTopic(selectedUser.value, selectedTopic.value)
  );
  const activeUser = computed(
    () => activeTopic.value?.user || selectedUser.value
  );
  const canOpenUserInfo = (user?: IUser | null): boolean =>
    !!user?.id && user.id !== getAuthUser()?.id && !isDeletedBotUser(user);

  const openUserInfo = (
    user?: IUser | null,
    topic?: ITopic | null,
    onOpenChat?: (() => void) | null
  ): void => {
    if (!canOpenUserInfo(user)) {
      return;
    }

    selectedUser.value = user;
    selectedTopic.value = topic || null;
    onUserInfoOpenChat.value = onOpenChat || null;
    isUserInfoOpen.value = true;
  };

  const closeUserInfo = (): void => {
    isUserInfoOpen.value = false;
    onUserInfoOpenChat.value = null;
  };

  const handleUserInfoOpenChat = (): void => {
    const callback = onUserInfoOpenChat.value;
    onUserInfoOpenChat.value = null;
    callback?.();
  };

  return {
    isUserInfoOpen,
    activeUser,
    activeTopic,
    openUserInfo,
    closeUserInfo,
    handleUserInfoOpenChat,
    canOpenUserInfo,
    resolveDirectTopicByUserId,
    resolveUserInfoTopic
  };
};
