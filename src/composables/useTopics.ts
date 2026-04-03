import { ref, computed, watch } from 'vue';
import { getChatSDK } from '../services/useChat';
import { ITopic } from '../components/interfaces/interfaces';
import {
  Message,
  TopicSetting,
  TopicType,
  MessageStatus
} from '../services/useChatSDK/types';
import {
  getGroupList,
  groups,
  updateLocalGroupInfo
} from '../composables/useGroup';
import { getMessagesByTopicId } from '../services/useMessages';
import { useUrlWatcher } from './navigation';
import { authedUser } from './useAuth';
import {
  loadCachedTopics,
  saveCachedTopics
} from '../services/useChatStateCache';

const topics = ref<ITopic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let persistTopicsTimeout: ReturnType<typeof setTimeout> | null = null;

const route = useUrlWatcher();

export const useTopics = () => {
  const getMessageTimestamp = (
    message?: Pick<Message, 'createdAt' | 'updatedAt'> | null
  ): number => {
    if (!message) {
      return 0;
    }

    const value = message.updatedAt || message.createdAt;

    if (!value) {
      return 0;
    }

    return new Date(value).getTime();
  };

  const resolveLatestMessage = (topic: ITopic) => {
    const localLastMessage = getMessagesByTopicId(topic.id).at(-1);
    const serverLastMessage = topic.lastMessage;

    if (!localLastMessage) {
      return serverLastMessage;
    }

    if (!serverLastMessage) {
      return localLastMessage;
    }

    return getMessageTimestamp(localLastMessage) >=
      getMessageTimestamp(serverLastMessage)
      ? localLastMessage
      : serverLastMessage;
  };

  const normalizeTopic = (topic: ITopic): ITopic => {
    const normalizedTopic = { ...topic };
    normalizedTopic.lastMessage = resolveLatestMessage(normalizedTopic);

    if (normalizedTopic.type === TopicType.DM && normalizedTopic.members) {
      normalizedTopic.user = normalizedTopic.members.find(
        user => user.id !== authedUser.value?.id
      );
      normalizedTopic.avatarUrl =
        normalizedTopic.avatarUrl || normalizedTopic.user?.avatarUrl;
      normalizedTopic.name =
        normalizedTopic.name || normalizedTopic.user?.initials;
    }

    return normalizedTopic;
  };

  const normalizeTopics = (items: ITopic[]): ITopic[] =>
    items.map(topic => normalizeTopic(topic));

  const schedulePersistTopics = () => {
    if (persistTopicsTimeout) {
      clearTimeout(persistTopicsTimeout);
    }

    persistTopicsTimeout = setTimeout(() => {
      persistTopicsTimeout = null;
      void saveCachedTopics(topics.value || []);
    }, 150);
  };

  const setTopics = (newTopics: ITopic[]) => {
    topics.value = normalizeTopics(newTopics);
    schedulePersistTopics();
  };

  const hydrateTopicsFromCache = async (userId?: string): Promise<ITopic[]> => {
    if (topics.value.length > 0) {
      return topics.value;
    }

    const cachedTopics = await loadCachedTopics(userId);

    if (cachedTopics.length > 0) {
      topics.value = normalizeTopics(cachedTopics);
    }

    return topics.value;
  };

  const fetchAllTopics = async (): Promise<ITopic[]> => {
    loading.value = true;
    error.value = null;

    try {
      const sdk = getChatSDK();
      const response = await sdk.getTopics();

      setTopics(response.data);
      return response.data;
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to fetch topics:', error.value);
      return topics.value || [];
    } finally {
      loading.value = false;
    }
  };

  const createTopic = async (peerId: string): Promise<ITopic[]> => {
    loading.value = true;
    error.value = null;

    try {
      const sdk = getChatSDK();
      const newTopic = await sdk.createTopic({ peerId });

      topics.value = [normalizeTopic(newTopic as ITopic), ...topics.value];
      schedulePersistTopics();
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to fetch topics:', error.value);
      return topics.value || [];
    } finally {
      loading.value = false;
    }
  };

  const deleteTopic = async (topicId: string): Promise<void> => {
    try {
      const sdk = getChatSDK();
      await sdk.deleteTopic(topicId);
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to delete topic:', error.value);
    }
  };

  const updateLocalLastMessageTopic = (
    topicId: string,
    lastMessage?: Message
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      if (lastMessage) {
        topic.lastMessage = lastMessage;
      } else {
        const messages = getMessagesByTopicId(topicId);
        topic.lastMessage = messages.at(-1);
      }
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const updateLocalTopicReadStatus = (
    topicId: string,
    messageIds: string[]
  ): void => {
    const groups = getGroupList();
    const topic = [...topics.value, ...groups].find(
      topic => topic.id === topicId
    );
    if (topic) {
      const lastMessage = topic.lastMessage;
      if (lastMessage && messageIds.includes(lastMessage.id)) {
        lastMessage.status = MessageStatus.Read;
      }
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const changeUnreadMessageCount = (delta: number, topicId: string) => {
    const groups = getGroupList();
    const topic = [...topics.value, ...groups].find(
      topic => topic.id === topicId
    );
    if (topic) {
      if (!topic.unreadMessageCount) {
        topic.unreadMessageCount = 0;
      }

      topic.unreadMessageCount += delta;

      topic.unreadMessageCount = Math.max(0, topic.unreadMessageCount);
    }
    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const setTopicTaggedMe = (topicId: string, taggedMe: boolean): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.taggedMe = taggedMe;
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const resetTopicUnreadState = (topicId: string): void => {
    const groups = getGroupList();
    const topic = [...topics.value, ...groups].find(
      topic => topic.id === topicId
    );

    if (!topic) {
      return;
    }

    topic.unreadMessageCount = 0;
    topic.taggedMe = false;

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const updateLocalTopicInfo = (
    topicId: string,
    info: Partial<TopicSetting>
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.info = { ...topic.info, ...info };
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const togglePinTopic = async (topic: ITopic) => {
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

  const toggleMuteTopic = async (topic: ITopic) => {
    try {
      const sdk = getChatSDK();
      await sdk.toggleMuteTopic(topic.id);
      if (topic.type === TopicType.DM) {
        updateLocalTopicInfo(topic.id, { isMute: !topic.info.isMute });
      } else if (topic.type === TopicType.Group) {
        updateLocalGroupInfo(topic.id, { isMute: !topic.info.isMute });
      }
    } catch (err) {
      console.error('Failed to mute/unmute topic:', err);
    }
  };

  const addTopicList = (value: ITopic): void => {
    topics.value = [normalizeTopic(value), ...topics.value];
    schedulePersistTopics();
  };

  const deleteTopicFromList = (topicId: string): void => {
    topics.value = [...topics.value.filter(t => t.id !== topicId)];
    groups.value = [...groups.value.filter(t => t.id !== topicId)];
    schedulePersistTopics();
  };

  const sortTopics = (topics: ITopic[]): ITopic[] => {
    return [...topics].sort((a, b) => {
      const aPin = a.info?.isPin || false;
      const bPin = b.info?.isPin || false;
      if (aPin !== bPin) {
        return aPin ? -1 : 1;
      }

      const aTime = new Date(a.lastMessage?.createdAt ?? a.createdAt).getTime();
      const bTime = new Date(b.lastMessage?.createdAt ?? b.createdAt).getTime();

      return bTime - aTime;
    });
  };

  const getTopicList = (): ITopic[] => {
    return sortTopics(topics.value || []);
  };

  const getSelectedTopic = (
    topicId: string = route.value.id
  ): ITopic | undefined => {
    const groups = getGroupList();

    return [...topics.value, ...groups].find(topic => topic.id === topicId);
  };

  const isTopicMuted = (topicId: string): boolean => {
    const topic = getSelectedTopic(topicId);
    return topic?.info?.isMute || false;
  };

  const totalUnreadCount = computed(() => {
    return topics.value.reduce(
      (acc, topic) => acc + (topic.unreadMessageCount || 0),
      0
    );
  });

  watch(
    totalUnreadCount,
    count => {
      const baseTitle = 'SEP:Chat';
      if (count > 0) {
        document.title = `(${count}) ${baseTitle}`;
        if ('setAppBadge' in navigator) {
          (navigator as any).setAppBadge(count);
        }
      } else {
        document.title = baseTitle;
        if ('clearAppBadge' in navigator) {
          (navigator as any).clearAppBadge();
        }
      }
    },
    { immediate: true }
  );

  return {
    topics,
    loading,
    error,
    totalUnreadCount,
    setTopics,
    hydrateTopicsFromCache,
    fetchAllTopics,
    createTopic,
    updateLocalLastMessageTopic,
    updateLocalTopicReadStatus,
    changeUnreadMessageCount,
    updateLocalTopicInfo,
    togglePinTopic,
    toggleMuteTopic,
    addTopicList,
    sortTopics,
    getTopicList,
    getSelectedTopic,
    isTopicMuted,
    deleteTopic,
    deleteTopicFromList,
    setTopicTaggedMe,
    resetTopicUnreadState
  };
};

const {
  setTopics,
  hydrateTopicsFromCache,
  changeUnreadMessageCount,
  toggleMuteTopic,
  togglePinTopic,
  addTopicList,
  sortTopics,
  getTopicList,
  fetchAllTopics,
  createTopic,
  updateLocalLastMessageTopic,
  updateLocalTopicReadStatus,
  updateLocalTopicInfo,
  isTopicMuted,
  deleteTopic,
  deleteTopicFromList,
  setTopicTaggedMe,
  resetTopicUnreadState,
  totalUnreadCount
} = useTopics();

export {
  topics,
  setTopics,
  hydrateTopicsFromCache,
  fetchAllTopics,
  createTopic,
  updateLocalLastMessageTopic,
  updateLocalTopicReadStatus,
  changeUnreadMessageCount,
  updateLocalTopicInfo,
  togglePinTopic,
  toggleMuteTopic,
  addTopicList,
  sortTopics,
  getTopicList,
  isTopicMuted,
  deleteTopic,
  deleteTopicFromList,
  setTopicTaggedMe,
  resetTopicUnreadState,
  totalUnreadCount
};
