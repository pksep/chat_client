import { ref, computed, watch } from 'vue';
import { getChatSDK } from '../services/useChat';
import { ITopic, IUser } from '../components/interfaces/interfaces';
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
import { getFullMessagesByTopicId } from '../services/useMessages';
import { useUrlWatcher } from './navigation';
import { authedUser } from './useAuth';
import {
  loadCachedTopics,
  saveCachedTopics
} from '../services/useChatStateCache';
import {
  hasCachedShadowLoadedRanges,
  getCachedShadowReadState,
  hasCachedShadowReadState,
  isShadowTimestampCoveredByCachedRanges,
  loadShadowLoadedRanges,
  loadShadowReadState
} from '../services/useShadowChatSync';
import { getUserById } from './useUsers';
import {
  isUnreadIgnoredSystemMessage,
  isUnreadTrackableMessage
} from '../utils/messageTracking';

const topics = ref<ITopic[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const displayedUnreadCount = ref(0);
const TYPING_STATE_TTL_MS = 4000;
let persistTopicsTimeout: ReturnType<typeof setTimeout> | null = null;
const topicReadPreviewIds = ref<Record<string, string[]>>({});
const serverUnreadCounts = ref<Record<string, number>>({});
const typingStateTimers = new Map<string, ReturnType<typeof setTimeout>>();
let isTopicsVisibilityBound = false;
let topicsApi: ReturnType<typeof createTopicsApi> | null = null;

const route = useUrlWatcher();

const bindTopicsVisibilityListener = (
  handleVisibilityChange: () => void
): void => {
  if (isTopicsVisibilityBound || typeof document === 'undefined') {
    return;
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  isTopicsVisibilityBound = true;
};

const createTopicsApi = () => {
  const applyDisplayedUnreadCount = (count: number) => {
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
  };

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

  const normalizeTypingUserIds = (typingUserIds?: string[]): string[] =>
    Array.from(new Set((typingUserIds || []).filter(Boolean)));

  const updateTopicTypingUserIds = (
    topicId: string,
    typingUserIds: string[]
  ): void => {
    const normalizedTypingUserIds = normalizeTypingUserIds(typingUserIds);
    let hasChanges = false;

    topics.value = topics.value.map(topic => {
      if (topic.id !== topicId) {
        return topic;
      }

      hasChanges = true;
      return {
        ...topic,
        typingUserIds: normalizedTypingUserIds
      };
    });

    if (hasChanges) {
      topics.value = [...topics.value];
    }
  };

  const clearTypingStateTimer = (topicId: string, userId: string): void => {
    const timerKey = `${topicId}:${userId}`;
    const timerId = typingStateTimers.get(timerKey);

    if (timerId) {
      clearTimeout(timerId);
      typingStateTimers.delete(timerKey);
    }
  };

  const resolveLatestMessage = (topic: ITopic) => {
    const localLastMessage = getFullMessagesByTopicId(topic.id).at(-1);
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
    const existingTopic = topics.value.find(item => item.id === topic.id);
    let resolvedUnreadCount = Math.max(
      0,
      normalizedTopic.unreadMessageCount || 0
    );
    const localMessages = getFullMessagesByTopicId(normalizedTopic.id);

    serverUnreadCounts.value = {
      ...serverUnreadCounts.value,
      [normalizedTopic.id]: resolvedUnreadCount
    };
    normalizedTopic.lastMessage = resolveLatestMessage(normalizedTopic);
    const hasLocalUnreadMessages =
      !!authedUser.value?.id &&
      localMessages.some(
        message =>
          isUnreadTrackableMessage(message) &&
          message.senderUserId !== authedUser.value?.id &&
          message.isReadByMe !== true
      );

    if (
      resolvedUnreadCount <= 1 &&
      normalizedTopic.lastMessage &&
      isUnreadIgnoredSystemMessage(normalizedTopic.lastMessage) &&
      !hasLocalUnreadMessages
    ) {
      resolvedUnreadCount = 0;
    }

    normalizedTopic.unreadMessageCount = resolvedUnreadCount;
    normalizedTopic.typingUserIds = normalizeTypingUserIds(
      normalizedTopic.typingUserIds ?? existingTopic?.typingUserIds
    );

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

  const stripEphemeralTopicState = (items: ITopic[]): ITopic[] =>
    items.map(topic => {
      const persistedTopic = { ...topic };
      delete persistedTopic.typingUserIds;

      return persistedTopic;
    });

  const schedulePersistTopics = () => {
    if (persistTopicsTimeout) {
      clearTimeout(persistTopicsTimeout);
    }

    persistTopicsTimeout = setTimeout(() => {
      persistTopicsTimeout = null;
      void saveCachedTopics(stripEphemeralTopicState(topics.value || []));
    }, 150);
  };

  const setTopics = (newTopics: ITopic[]) => {
    topics.value = normalizeTopics(newTopics);
    schedulePersistTopics();
  };

  const warmShadowUnreadStateForTopics = async (
    items: ITopic[],
    userId = authedUser.value?.id
  ): Promise<void> => {
    if (!userId || items.length === 0) {
      return;
    }

    const topicsToWarm = items.filter(
      topic =>
        !!topic?.id &&
        ((serverUnreadCounts.value[topic.id] || 0) > 0 || !!topic.lastMessage)
    );

    if (topicsToWarm.length === 0) {
      return;
    }

    await Promise.allSettled(
      topicsToWarm.flatMap(topic => [
        loadShadowReadState(topic.id, userId),
        loadShadowLoadedRanges(topic.id, userId)
      ])
    );

    topicsToWarm.forEach(topic => {
      syncTopicUnreadState(topic.id);
    });
  };

  const hydrateTopicsFromCache = async (userId?: string): Promise<ITopic[]> => {
    if (topics.value.length > 0) {
      await warmShadowUnreadStateForTopics(topics.value, userId);
      return topics.value;
    }

    const cachedTopics = await loadCachedTopics(userId);

    if (cachedTopics.length > 0) {
      topics.value = normalizeTopics(cachedTopics);
      await warmShadowUnreadStateForTopics(topics.value, userId);
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
      await warmShadowUnreadStateForTopics(topics.value);
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
        const messages = getFullMessagesByTopicId(topicId);
        topic.lastMessage = messages.at(-1);
      }

      if (lastMessage?.senderUserId) {
        clearTypingStateTimer(topicId, lastMessage.senderUserId);
        topic.typingUserIds = (topic.typingUserIds || []).filter(
          userId => userId !== lastMessage.senderUserId
        );
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

    serverUnreadCounts.value = {
      ...serverUnreadCounts.value,
      [topicId]: Math.max(0, (serverUnreadCounts.value[topicId] || 0) + delta)
    };

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const incrementDisplayedUnreadCount = (delta: number = 1): void => {
    if (delta <= 0 || document.visibilityState === 'visible') {
      return;
    }

    displayedUnreadCount.value = Math.max(
      displayedUnreadCount.value,
      totalUnreadCount.value
    );
    displayedUnreadCount.value += delta;
    applyDisplayedUnreadCount(displayedUnreadCount.value);
  };

  const incrementServerUnreadCount = (
    topicId: string,
    delta: number = 1
  ): void => {
    if (!topicId || delta <= 0) {
      return;
    }

    serverUnreadCounts.value = {
      ...serverUnreadCounts.value,
      [topicId]: (serverUnreadCounts.value[topicId] || 0) + delta
    };
  };

  const decrementServerUnreadCount = (
    topicId: string,
    delta: number = 1
  ): void => {
    if (!topicId || delta <= 0) {
      return;
    }

    serverUnreadCounts.value = {
      ...serverUnreadCounts.value,
      [topicId]: Math.max(0, (serverUnreadCounts.value[topicId] || 0) - delta)
    };
  };

  const setTopicTaggedMe = (topicId: string, taggedMe: boolean): void => {
    const topic = topics.value.find(topic => topic.id === topicId);
    if (topic) {
      topic.taggedMe = taggedMe;
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const previewTopicReadMessages = (
    topicId: string,
    messageIds: string[]
  ): void => {
    if (!topicId || messageIds.length === 0) {
      return;
    }

    const existingIds = topicReadPreviewIds.value[topicId] || [];
    topicReadPreviewIds.value = {
      ...topicReadPreviewIds.value,
      [topicId]: Array.from(new Set([...existingIds, ...messageIds]))
    };

    syncTopicUnreadState(topicId);
  };

  const clearTopicReadPreview = (
    topicId: string,
    messageIds?: string[]
  ): void => {
    if (!topicId || !topicReadPreviewIds.value[topicId]?.length) {
      return;
    }

    if (!messageIds || messageIds.length === 0) {
      const next = { ...topicReadPreviewIds.value };
      delete next[topicId];
      topicReadPreviewIds.value = next;
      syncTopicUnreadState(topicId);
      return;
    }

    const nextIds = (topicReadPreviewIds.value[topicId] || []).filter(
      id => !messageIds.includes(id)
    );

    topicReadPreviewIds.value = {
      ...topicReadPreviewIds.value,
      [topicId]: nextIds
    };

    syncTopicUnreadState(topicId);
  };

  const syncTopicUnreadState = (topicId: string): void => {
    const groups = getGroupList();
    const topic = [...topics.value, ...groups].find(
      item => item.id === topicId
    );

    if (!topic || !authedUser.value?.id) {
      return;
    }

    const currentUserId = authedUser.value.id;
    const messages = getFullMessagesByTopicId(topicId);
    const previewReadIds = new Set(topicReadPreviewIds.value[topicId] || []);
    const baseUnreadCount = Math.max(0, serverUnreadCounts.value[topicId] || 0);
    const effectiveServerUnreadCount = Math.max(
      0,
      baseUnreadCount - previewReadIds.size
    );
    const unreadMessages = messages.filter(
      message =>
        isUnreadTrackableMessage(message) &&
        message.senderUserId !== currentUserId &&
        message.isReadByMe !== true &&
        !previewReadIds.has(message.id)
    );
    const shadowReadStateExists = hasCachedShadowReadState(
      topicId,
      currentUserId
    );
    const shadowReadState = getCachedShadowReadState(topicId, currentUserId);
    const shadowLastReadMessage = shadowReadState?.lastReadMessageId
      ? messages.find(
          message => message.id === shadowReadState.lastReadMessageId
        )
      : null;
    const shadowLastReadTimestamp = shadowLastReadMessage
      ? getMessageTimestamp(shadowLastReadMessage)
      : new Date(shadowReadState?.lastReadAt || 0).getTime();
    const computedUnreadMessages = shadowReadStateExists
      ? messages.filter(message => {
          if (
            !isUnreadTrackableMessage(message) ||
            message.senderUserId === currentUserId ||
            previewReadIds.has(message.id)
          ) {
            return false;
          }

          if (
            !shadowReadState?.lastReadMessageId &&
            !shadowReadState?.lastReadAt
          ) {
            return true;
          }

          return getMessageTimestamp(message) > shadowLastReadTimestamp;
        })
      : unreadMessages;
    const latestKnownMessage = resolveLatestMessage(topic);
    const latestKnownMessageTimestamp = getMessageTimestamp(latestKnownMessage);
    const hasLoadedRanges = hasCachedShadowLoadedRanges(topicId, currentUserId);
    const hasLatestRangeCoverage =
      !hasLoadedRanges ||
      !latestKnownMessageTimestamp ||
      isShadowTimestampCoveredByCachedRanges(
        topicId,
        latestKnownMessageTimestamp,
        currentUserId
      );
    const hasLatestMessageInLocalCache =
      !latestKnownMessage?.id ||
      messages.some(message => message.id === latestKnownMessage.id);
    const shouldUseComputedUnread =
      shadowReadStateExists &&
      (effectiveServerUnreadCount === 0 ||
        (hasLatestRangeCoverage && hasLatestMessageInLocalCache));
    const shouldSuppressUnreadForNonTrackableLatestMessage =
      !!latestKnownMessage &&
      isUnreadIgnoredSystemMessage(latestKnownMessage) &&
      effectiveServerUnreadCount <= 1 &&
      unreadMessages.length === 0;

    const computedUnreadCount = computedUnreadMessages.length;
    const nextUnreadCount = shouldSuppressUnreadForNonTrackableLatestMessage
      ? 0
      : shouldUseComputedUnread
        ? Math.min(effectiveServerUnreadCount, computedUnreadCount)
        : effectiveServerUnreadCount;
    const nextTaggedMe =
      nextUnreadCount > 0 &&
      (shouldUseComputedUnread ? computedUnreadMessages : unreadMessages).some(
        message => message.taggedUserIds?.includes(currentUserId)
      );

    if (
      topic.unreadMessageCount === nextUnreadCount &&
      topic.taggedMe === nextTaggedMe
    ) {
      return;
    }

    topic.unreadMessageCount = nextUnreadCount;
    topic.taggedMe = nextTaggedMe;

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

    serverUnreadCounts.value = {
      ...serverUnreadCounts.value,
      [topicId]: 0
    };

    if (topicReadPreviewIds.value[topicId]) {
      const next = { ...topicReadPreviewIds.value };
      delete next[topicId];
      topicReadPreviewIds.value = next;
    }

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

  const updateLocalTopicUser = (
    userId: string,
    changes: Partial<IUser>
  ): void => {
    if (!userId) {
      return;
    }

    let hasChanges = false;

    topics.value = topics.value.map(topic => {
      let topicChanged = false;
      const nextMembers = topic.members?.map(member => {
        if (member.id !== userId) {
          return member;
        }

        topicChanged = true;
        return {
          ...member,
          ...changes
        };
      });

      const nextUser =
        topic.user?.id === userId
          ? {
              ...topic.user,
              ...changes
            }
          : topic.user;

      if (topic.user?.id === userId) {
        topicChanged = true;
      }

      if (!topicChanged) {
        return topic;
      }

      hasChanges = true;

      return {
        ...topic,
        members: nextMembers,
        user: nextUser,
        avatarUrl:
          topic.type === TopicType.DM
            ? nextUser?.avatarUrl || topic.avatarUrl
            : topic.avatarUrl,
        name:
          topic.type === TopicType.DM
            ? nextUser?.initials || topic.name
            : topic.name
      };
    });

    if (!hasChanges) {
      return;
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

  const setTopicTypingState = (
    topicId: string,
    userId: string,
    isTyping: boolean
  ): void => {
    if (!topicId || !userId || userId === authedUser.value?.id) {
      return;
    }

    const topic = getSelectedTopic(topicId);

    if (!topic) {
      return;
    }

    const nextTypingUserIds = new Set<string>(topic.typingUserIds || []);

    if (isTyping) {
      nextTypingUserIds.add(userId);
      clearTypingStateTimer(topicId, userId);
      typingStateTimers.set(
        `${topicId}:${userId}`,
        setTimeout(() => {
          clearTopicTypingState(topicId, userId);
        }, TYPING_STATE_TTL_MS)
      );
    } else {
      nextTypingUserIds.delete(userId);
      clearTypingStateTimer(topicId, userId);
    }

    updateTopicTypingUserIds(topicId, Array.from(nextTypingUserIds));
  };

  const clearTopicTypingState = (topicId: string, userId?: string): void => {
    if (!topicId) {
      return;
    }

    if (userId) {
      const topic = getSelectedTopic(topicId);

      if (!topic) {
        return;
      }

      clearTypingStateTimer(topicId, userId);
      updateTopicTypingUserIds(
        topicId,
        (topic.typingUserIds || []).filter(id => id !== userId)
      );
      return;
    }

    const topic = getSelectedTopic(topicId);

    if (!topic?.typingUserIds?.length) {
      return;
    }

    topic.typingUserIds.forEach(id => clearTypingStateTimer(topicId, id));
    updateTopicTypingUserIds(topicId, []);
  };

  const getTopicTypingUsers = (topicId: string = route.value.id): IUser[] => {
    const topic = getSelectedTopic(topicId);
    const typingUserIds = topic?.typingUserIds || [];

    return typingUserIds
      .map(userId => {
        return (
          getUserById(userId) ||
          topic?.members?.find(member => member.id === userId) ||
          (topic?.user?.id === userId ? topic.user : undefined)
        );
      })
      .filter(Boolean) as IUser[];
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
      if (document.visibilityState === 'visible') {
        displayedUnreadCount.value = count;
      } else {
        displayedUnreadCount.value = Math.max(
          displayedUnreadCount.value,
          count
        );
      }

      applyDisplayedUnreadCount(displayedUnreadCount.value);
    },
    { immediate: true }
  );

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      displayedUnreadCount.value = totalUnreadCount.value;
      applyDisplayedUnreadCount(displayedUnreadCount.value);
    }
  };

  bindTopicsVisibilityListener(handleVisibilityChange);

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
    setTopicTypingState,
    clearTopicTypingState,
    getTopicTypingUsers,
    sortTopics,
    getTopicList,
    getSelectedTopic,
    isTopicMuted,
    deleteTopic,
    deleteTopicFromList,
    setTopicTaggedMe,
    previewTopicReadMessages,
    clearTopicReadPreview,
    syncTopicUnreadState,
    resetTopicUnreadState,
    incrementServerUnreadCount,
    decrementServerUnreadCount,
    incrementDisplayedUnreadCount,
    updateLocalTopicUser
  };
};

export const useTopics = () => {
  if (!topicsApi) {
    topicsApi = createTopicsApi();
  }

  return topicsApi;
};

const {
  setTopics,
  hydrateTopicsFromCache,
  changeUnreadMessageCount,
  toggleMuteTopic,
  togglePinTopic,
  addTopicList,
  setTopicTypingState,
  clearTopicTypingState,
  getTopicTypingUsers,
  sortTopics,
  getTopicList,
  getSelectedTopic,
  fetchAllTopics,
  createTopic,
  updateLocalLastMessageTopic,
  updateLocalTopicReadStatus,
  updateLocalTopicInfo,
  isTopicMuted,
  deleteTopic,
  deleteTopicFromList,
  setTopicTaggedMe,
  previewTopicReadMessages,
  clearTopicReadPreview,
  syncTopicUnreadState,
  resetTopicUnreadState,
  incrementServerUnreadCount,
  decrementServerUnreadCount,
  totalUnreadCount,
  incrementDisplayedUnreadCount,
  updateLocalTopicUser
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
  setTopicTypingState,
  clearTopicTypingState,
  getTopicTypingUsers,
  sortTopics,
  getTopicList,
  getSelectedTopic,
  isTopicMuted,
  deleteTopic,
  deleteTopicFromList,
  setTopicTaggedMe,
  previewTopicReadMessages,
  clearTopicReadPreview,
  syncTopicUnreadState,
  resetTopicUnreadState,
  incrementServerUnreadCount,
  decrementServerUnreadCount,
  totalUnreadCount,
  incrementDisplayedUnreadCount,
  updateLocalTopicUser
};
