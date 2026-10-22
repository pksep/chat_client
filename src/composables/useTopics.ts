import { ref, computed, watch } from 'vue';
import {
  getChatSDK,
  getHasWebsocketConnection,
  waitForChatSDK
} from '../services/useChat';
import { WebSocketEventType } from '../services/useChatSDK/websocketEvents';
import { ITopic, ITopicInfo, IUser } from '../components/interfaces/interfaces';
import {
  Message,
  TopicType,
  MessageStatus
} from '../services/useChatSDK/types';
import { groups, updateLocalGroupInfo } from '../composables/useGroup';
import {
  deleteMessageFromLocal,
  getFullMessagesByTopicId,
  hasKnownTopicMessagesState
} from '../services/useMessages';
import { useUrlWatcher } from './navigation';
import { authedUser } from './useAuth';
import {
  loadCachedTopics,
  loadFastCachedTopics,
  loadCachedUnreadTopicSummaries,
  saveCachedUnreadTopicSummaries,
  loadCachedTopicSyncSnapshot,
  saveCachedTopicSyncSnapshot,
  saveCachedTopics
} from '../services/useChatStateCache';
import {
  getIsAppActivelyVisible,
  subscribeToAppVisibilityChanges
} from '../services/useAppVisibility';
import {
  hasCachedShadowLoadedRanges,
  getCachedShadowReadState,
  hasCachedShadowReadState,
  isShadowTimestampCoveredByCachedRanges,
  loadShadowLoadedRanges,
  loadShadowReadState
} from '../services/useShadowChatSync';
import { syncTauriTrayBadge } from '../services/useTauriTrayBadge';
import { getUserById } from './useUsers';
import {
  isUnreadIgnoredMessageForUser,
  isUnreadTrackableMessageForUser
} from '../utils/messageTracking';
import { getDisplayableTopicUnreadCount } from '../utils/topicUnreadCount';
import {
  getDeletedAccountDisplayName,
  isBotTopic,
  isBotUser,
  isDeletedBotUser,
  isLocalBotTopic
} from '../utils/bot';
import {
  FAVORITE_TOPIC_DESCRIPTION,
  FAVORITE_TOPIC_NAME,
  dedupeFavoriteTopics,
  isFavoriteTopic,
  normalizeFavoriteTopic
} from '../utils/favorite-topic';
import {
  resolveLastMessageAfterLocalSync,
  resolveTopicLastMessage
} from '../utils/topic-last-message';
import { compactPersonName } from '../utils/personName';
import { recordTopicStateTelemetry } from '../services/topic-state-telemetry';
import { hasInquiryTopicMarker } from '../utils/inquiry-message-visibility';
import {
  applyTopicPinSetting,
  sortTopicsByPinOrder
} from '../utils/topic-order';
import { hasNextTopicPage, TOPICS_PAGE_SIZE } from '../utils/topic-pagination';
import { isCallTopic } from '../utils/call-topic';
import type { PaginatedResponse } from '../services/useChatSDK/types';
import { isTopicSyncState, type TopicSyncState } from '../utils/topic-sync';
import { isPtsReplayStale } from '../utils/pts-replay';
import { rememberNativeTopicSync } from '../services/native-startup-reads';

const topics = ref<ITopic[]>([]);
const topicsById = computed(
  () => new Map(topics.value.map(topic => [topic.id, topic] as const))
);
const loading = ref(false);
const error = ref<string | null>(null);
const topicsRefreshFailed = ref(false);
const hasMoreTopics = ref(false);
const loadingMoreTopics = ref(false);
const loadingClientTopics = ref(false);
const unreadTopicSummaries = ref<ITopic[]>([]);
export const getTopicsRefreshFailed = (): boolean => topicsRefreshFailed.value;
const displayedUnreadCount = ref(0);
const TYPING_STATE_TTL_MS = 4000;
let persistTopicsTimeout: ReturnType<typeof setTimeout> | null = null;
const topicReadPreviewIds = ref<Record<string, string[]>>({});
const serverUnreadCounts = ref<Record<string, number>>({});
const typingStateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const unreadReactionIdsByTopic = new Map<string, Set<string>>();
const unreadReactionTargetsByTopic = new Map<string, Map<string, string>>();
let isTopicsVisibilityBound = false;
let isDesktopVisibilityBound = false;
let topicsApi: ReturnType<typeof createTopicsApi> | null = null;
let lastAppliedAppBadgeCount: number | null = null;
let favoriteTopicCreationPromise: Promise<ITopic | null> | null = null;
const favoriteSystemCleanupIds = new WeakMap<object, Set<string>>();

const route = useUrlWatcher();

const waitForTopicIdle = (): Promise<void> =>
  new Promise(resolve => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 1500 });
      return;
    }

    setTimeout(resolve, 0);
  });

const resolveDmTopicName = (topic: ITopic, user?: IUser): string => {
  const sourceName = user?.initials || topic.name || user?.nickname || '';

  if (isDeletedBotUser(user)) {
    return getDeletedAccountDisplayName(sourceName);
  }

  return isBotTopic(topic) || isBotUser(user)
    ? sourceName
    : compactPersonName(sourceName);
};

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
    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const baseTitle = 'SEP:Chat';
    const nextTitle = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;

    if (document.title !== nextTitle) {
      document.title = nextTitle;
    }

    if (lastAppliedAppBadgeCount === count) {
      return;
    }

    lastAppliedAppBadgeCount = count;

    if (count > 0) {
      if ('setAppBadge' in navigator) {
        (navigator as any).setAppBadge(count);
      }
    } else {
      if ('clearAppBadge' in navigator) {
        (navigator as any).clearAppBadge();
      }
    }
  };

  const getTopicDisplayableUnreadCount = (
    topic: ITopic,
    authUserId = authedUser.value?.id
  ): number =>
    getDisplayableTopicUnreadCount(topic, authUserId, getFullMessagesByTopicId);

  const hasAnyActiveUnreadTopic = (): boolean =>
    getUnreadTopicList().some(
      topic =>
        getTopicDisplayableUnreadCount(topic) > 0 &&
        (!topic.info?.isMute || topic.taggedMe)
    );

  const getActualUnreadCount = (): number =>
    getUnreadTopicList().reduce(
      (acc, topic) => acc + getTopicDisplayableUnreadCount(topic),
      0
    );

  const syncDisplayedUnreadCount = (force = false): void => {
    const actualUnreadCount = getActualUnreadCount();

    if (getIsAppActivelyVisible() || actualUnreadCount === 0) {
      displayedUnreadCount.value = actualUnreadCount;
    } else {
      displayedUnreadCount.value = Math.max(
        displayedUnreadCount.value,
        actualUnreadCount
      );
    }

    applyDisplayedUnreadCount(displayedUnreadCount.value);
    syncDesktopUnreadBadge(force);
  };

  const syncDesktopUnreadBadge = (force = false) => {
    void syncTauriTrayBadge({
      count: displayedUnreadCount.value,
      force,
      mutedOnly: displayedUnreadCount.value > 0 && !hasAnyActiveUnreadTopic()
    });
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

  const getLatestMessage = (
    messages: Array<Message | undefined>
  ): Message | undefined => {
    return messages
      .filter(Boolean)
      .reduce<Message | undefined>((latestMessage, message) => {
        return resolveTopicLastMessage(latestMessage, message);
      }, undefined);
  };

  const resolveLatestMessage = (
    topic: ITopic,
    lastMessage?: Message
  ): Message | undefined => {
    const hideSystemMessages =
      isFavoriteTopic(topic, authedUser.value?.id) ||
      hasInquiryTopicMarker(topic);
    const localMessages = getFullMessagesByTopicId(topic.id);
    const localLastMessage = hideSystemMessages
      ? [...localMessages].reverse().find(message => !message.isSystem)
      : localMessages.at(-1);
    const candidates = [topic.lastMessage, localLastMessage, lastMessage];

    return getLatestMessage(
      hideSystemMessages
        ? candidates.filter(message => !message?.isSystem)
        : candidates
    );
  };

  const getLocalLastMessage = (topic: ITopic): Message | undefined => {
    const localMessages = getFullMessagesByTopicId(topic.id);

    return isFavoriteTopic(topic, authedUser.value?.id) ||
      hasInquiryTopicMarker(topic)
      ? [...localMessages].reverse().find(message => !message.isSystem)
      : localMessages.at(-1);
  };

  const normalizeTopic = (
    topic: ITopic,
    authUserId = authedUser.value?.id
  ): ITopic => {
    const normalizedTopic = { ...topic };
    const existingTopic = topics.value.find(item => item.id === topic.id);
    const trackedUnreadReactionTargets = unreadReactionTargetsByTopic.get(
      topic.id
    );
    const trackedUnreadReactionMessageId = [
      ...(trackedUnreadReactionTargets?.values() || [])
    ].at(-1);
    const resolvedUnreadReactionMessageId =
      trackedUnreadReactionMessageId ||
      normalizedTopic.unreadReactionMessageId ||
      undefined;
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
    if (
      normalizedTopic.lastMessage &&
      existingTopic?.lastMessage?.id === normalizedTopic.lastMessage.id
    ) {
      normalizedTopic.lastMessage = resolveTopicLastMessage(
        existingTopic.lastMessage,
        normalizedTopic.lastMessage
      );
    }
    if (
      existingTopic &&
      ((topic.lastMessage?.id === normalizedTopic.lastMessage?.id &&
        topic.lastMessage?.status !== normalizedTopic.lastMessage?.status) ||
        (topic.unreadMessageCount || 0) !==
          (existingTopic.unreadMessageCount || 0))
    ) {
      recordTopicStateTelemetry(
        'topic_snapshot_merge',
        normalizedTopic,
        localMessages.find(
          message => message.id === normalizedTopic.lastMessage?.id
        ),
        authUserId,
        {
          incomingLastMessageId: topic.lastMessage?.id,
          incomingStatus: topic.lastMessage?.status,
          incomingUnreadCount: topic.unreadMessageCount,
          previousUnreadCount: existingTopic.unreadMessageCount,
          localMessageCount: localMessages.length,
          statusReconciled:
            topic.lastMessage?.id === normalizedTopic.lastMessage?.id &&
            topic.lastMessage?.status !== normalizedTopic.lastMessage?.status
        },
        topic.lastMessage?.id === normalizedTopic.lastMessage?.id &&
          topic.lastMessage?.status !== normalizedTopic.lastMessage?.status
      );
    }
    const hasLocalUnreadMessages =
      !!authedUser.value?.id &&
      localMessages.some(
        message =>
          isUnreadTrackableMessageForUser(message, authedUser.value?.id) &&
          message.senderUserId !== authedUser.value?.id &&
          message.isReadByMe !== true
      );

    if (
      resolvedUnreadCount <= 1 &&
      normalizedTopic.lastMessage &&
      isUnreadIgnoredMessageForUser(
        normalizedTopic.lastMessage,
        authedUser.value?.id
      ) &&
      !hasLocalUnreadMessages
    ) {
      resolvedUnreadCount = 0;
    }

    normalizedTopic.unreadMessageCount = resolvedUnreadCount;
    normalizedTopic.typingUserIds = normalizeTypingUserIds(
      normalizedTopic.typingUserIds ?? existingTopic?.typingUserIds
    );
    normalizedTopic.hasUnreadReaction = Boolean(
      resolvedUnreadReactionMessageId
    );
    normalizedTopic.unreadReactionMessageId = resolvedUnreadReactionMessageId;

    if (normalizedTopic.type === TopicType.DM) {
      const peerMember = normalizedTopic.members?.find(
        user => user.id !== authedUser.value?.id
      );
      normalizedTopic.user = peerMember || normalizedTopic.user;
      normalizedTopic.avatarUrl =
        isBotTopic(normalizedTopic) || isBotUser(normalizedTopic.user)
          ? normalizedTopic.user?.avatarUrl || ''
          : normalizedTopic.avatarUrl || normalizedTopic.user?.avatarUrl;
      normalizedTopic.name = resolveDmTopicName(
        normalizedTopic,
        normalizedTopic.user
      );
    }

    if (
      normalizedTopic.type === TopicType.DM &&
      isDeletedBotUser(existingTopic?.user) &&
      !isDeletedBotUser(normalizedTopic.user)
    ) {
      const deletedUser = existingTopic.user;

      normalizedTopic.user = deletedUser;
      normalizedTopic.members =
        normalizedTopic.members?.map(member =>
          member.id === deletedUser.id ? deletedUser : member
        ) ||
        existingTopic.members ||
        normalizedTopic.members;
      normalizedTopic.avatarUrl = '';
      normalizedTopic.name = existingTopic.name || deletedUser.initials;
    }

    return normalizeFavoriteTopic(normalizedTopic, authUserId);
  };

  const normalizeTopics = (
    items: ITopic[],
    authUserId = authedUser.value?.id
  ): ITopic[] =>
    dedupeFavoriteTopics(
      items.map(topic => normalizeTopic(topic, authUserId)),
      authUserId
    );

  const mergeLocalBotTopics = (items: ITopic[]): ITopic[] => {
    const localBotTopics = topics.value.filter(topic => isLocalBotTopic(topic));
    const incomingIds = new Set(items.map(topic => topic.id));

    return [
      ...items,
      ...localBotTopics.filter(topic => !incomingIds.has(topic.id))
    ];
  };

  const stripEphemeralTopicState = (items: ITopic[]): ITopic[] =>
    items.map(topic => {
      const persistedTopic = { ...topic };
      delete persistedTopic.typingUserIds;
      delete persistedTopic.activeCall;

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
    topics.value = normalizeTopics(mergeLocalBotTopics(newTopics));
    schedulePersistTopics();
  };

  const cleanupFavoriteTopicSystemMessages = (
    topic: ITopic | null | undefined,
    messages: readonly Message[]
  ): void => {
    const sdk = getChatSDK();
    if (!sdk || !topic || !isFavoriteTopic(topic, authedUser.value?.id)) return;

    // Используем уже загруженную историю: отдельный запрос при старте не нужен.
    const cleanupIds = favoriteSystemCleanupIds.get(sdk) || new Set<string>();
    favoriteSystemCleanupIds.set(sdk, cleanupIds);
    const systemMessages = messages.filter(
      message =>
        message.isSystem &&
        message.id &&
        message.topicId === topic.id &&
        !cleanupIds.has(message.id)
    );
    if (!systemMessages.length) return;
    systemMessages.forEach(message => cleanupIds.add(message.id));

    void (async () => {
      const queuedIds = new Set<string>();
      try {
        for (
          let attempt = 0;
          attempt < 40 && getChatSDK() === sdk && !sdk.isConnected();
          attempt += 1
        ) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        if (getChatSDK() !== sdk || !sdk.isConnected()) {
          return;
        }

        for (const message of systemMessages) {
          const queued = sdk.sendWebSocketEvent(
            WebSocketEventType.DELETE_MESSAGE,
            {
              messageId: message.id,
              topicId: topic.id
            }
          );

          if (queued) {
            queuedIds.add(message.id);
            deleteMessageFromLocal(topic.id, message.id);
          }
        }
      } catch (cleanupError) {
        console.warn(
          'Не удалось удалить системные сообщения из Избранного:',
          cleanupError
        );
      } finally {
        for (const message of systemMessages) {
          if (!queuedIds.has(message.id)) cleanupIds.delete(message.id);
        }
      }
    })();
  };

  const ensureFavoriteTopic = async (
    userId = authedUser.value?.id
  ): Promise<ITopic | null> => {
    if (!userId) {
      return null;
    }

    const existingFavoriteTopic = topics.value.find(topic =>
      isFavoriteTopic(topic, userId)
    );

    if (existingFavoriteTopic) {
      return existingFavoriteTopic;
    }

    if (favoriteTopicCreationPromise) {
      return favoriteTopicCreationPromise;
    }

    favoriteTopicCreationPromise = (async () => {
      try {
        const sdk = getChatSDK();
        const favoriteStore = await sdk.createGroup({
          title: FAVORITE_TOPIC_NAME,
          description: FAVORITE_TOPIC_DESCRIPTION,
          avatarUrl: '',
          memberIds: [],
          admins: [userId]
        });

        if (!favoriteStore?.topicId) {
          throw new Error('Сервер не вернул topicId для Избранного');
        }

        try {
          await sdk.togglePinTopic(favoriteStore.topicId);
        } catch (pinError) {
          console.warn(
            'Не удалось закрепить Избранное после создания:',
            pinError
          );
        }

        const favoriteTopic = await sdk.getTopicById(favoriteStore.topicId);
        if (getChatSDK() !== sdk || authedUser.value?.id !== userId)
          return null;
        addTopicList(favoriteTopic as unknown as ITopic);

        const createdFavoriteTopic =
          topics.value.find(topic => isFavoriteTopic(topic, userId)) || null;

        return createdFavoriteTopic;
      } catch (creationError) {
        console.error('Не удалось создать Избранное:', creationError);
        return null;
      } finally {
        favoriteTopicCreationPromise = null;
      }
    })();

    return favoriteTopicCreationPromise;
  };

  const applyNativeTopicSnapshot = (
    nativeTopics: ITopic[],
    userId?: string,
    snapshotUpdatedAt?: string
  ): ITopic[] => {
    if (
      !Array.isArray(nativeTopics) ||
      nativeTopics.length === 0 ||
      (userId && authedUser.value?.id && authedUser.value.id !== userId)
    ) {
      return topics.value;
    }
    // Отложенный фоновый снимок не должен отменять уже применённый ответ сети.
    const updatedAt = Date.parse(snapshotUpdatedAt || '');
    if (
      lastNetworkTopicsAppliedAt > 0 &&
      (!Number.isFinite(updatedAt) || updatedAt <= lastNetworkTopicsAppliedAt)
    )
      return topics.value;

    const previousTopics = topicsById.value;
    const previousServerUnreadCounts = serverUnreadCounts.value;
    const preserveOfflineUnread = !getHasWebsocketConnection();
    const normalizedTopics = normalizeTopics(
      mergeLocalBotTopics(nativeTopics),
      userId
    );

    if (preserveOfflineUnread) {
      const nextServerUnreadCounts = { ...serverUnreadCounts.value };
      for (const topic of normalizedTopics) {
        const previous = previousTopics.get(topic.id);
        if (
          !previous ||
          getMessageTimestamp(topic.lastMessage) >
            getMessageTimestamp(previous.lastMessage)
        ) {
          continue;
        }

        // Старый фоновый снимок не должен отменять локальное прочтение офлайн.
        topic.unreadMessageCount = previous.unreadMessageCount;
        topic.taggedMe = previous.taggedMe;
        topic.info = {
          ...topic.info,
          isMarkedUnread: previous.info?.isMarkedUnread
        };
        nextServerUnreadCounts[topic.id] =
          previousServerUnreadCounts[topic.id] ??
          previous.unreadMessageCount ??
          0;
      }
      serverUnreadCounts.value = nextServerUnreadCounts;
    }

    topics.value = normalizedTopics;
    void saveCachedTopics(stripEphemeralTopicState(topics.value || []), userId);
    void warmShadowUnreadStateForTopics(topics.value, userId);

    return topics.value;
  };

  const warmShadowUnreadStateForTopic = async (
    topic: ITopic,
    userId: string
  ): Promise<void> => {
    if (!topic?.id) {
      return;
    }

    await Promise.allSettled([
      loadShadowReadState(topic.id, userId),
      loadShadowLoadedRanges(topic.id, userId)
    ]);
    syncTopicUnreadState(topic.id);
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

    const activeTopicId = route.value?.id || '';
    const activeTopic = topicsToWarm.find(topic => topic.id === activeTopicId);
    const backgroundTopics = topicsToWarm.filter(
      topic => topic.id !== activeTopicId
    );

    if (activeTopic) {
      await warmShadowUnreadStateForTopic(activeTopic, userId);
    }

    if (backgroundTopics.length === 0) {
      return;
    }

    void (async () => {
      for (const topic of backgroundTopics) {
        await waitForTopicIdle();
        await warmShadowUnreadStateForTopic(topic, userId);
      }
    })().catch(error => {
      console.warn('Failed to warm cached topic read state:', error);
    });
  };

  const hydrateTopicsFromCache = async (userId?: string): Promise<ITopic[]> => {
    unreadTopicSummaries.value = loadCachedUnreadTopicSummaries(userId);
    if (topics.value.length > 0) {
      await warmShadowUnreadStateForTopics(topics.value, userId);
      return topics.value;
    }

    const fastTopics = loadFastCachedTopics(userId);
    const cachedTopics = stripEphemeralTopicState(
      fastTopics?.length ? fastTopics : await loadCachedTopics(userId)
    );
    if (!cachedTopics.length) {
      const confirmed = await loadCachedTopicSyncSnapshot(userId);
      if (confirmed)
        cachedTopics.push(...stripEphemeralTopicState(confirmed.topics));
    }
    if (authedUser.value?.id && authedUser.value.id !== userId)
      return topics.value;

    if (cachedTopics.length > 0) {
      topics.value = normalizeTopics(cachedTopics, userId);
      await warmShadowUnreadStateForTopics(topics.value, userId);
    }

    return topics.value;
  };

  const isMainListTopic = (topic: ITopic): boolean =>
    !isCallTopic(topic) &&
    topic.group?.description !== 'sep-chat:external-inquiry:v1';

  let paginationSession:
    | {
        sdk: ReturnType<typeof getChatSDK>;
        userId: string | undefined;
        page: number;
        ids: Set<string>;
        sync?: TopicSyncState;
      }
    | undefined;
  let lastNetworkTopicsAppliedAt = 0;
  let refreshPromise: Promise<ITopic[]> | undefined;
  let morePromise: Promise<ITopic[]> | undefined;
  let clientsPromise: Promise<void> | undefined;
  let clientsSdk: ReturnType<typeof getChatSDK> = null;

  watch(
    () => authedUser.value?.id,
    () => {
      paginationSession = undefined;
      lastNetworkTopicsAppliedAt = 0;
      refreshPromise = undefined;
      morePromise = undefined;
      clientsPromise = undefined;
      clientsSdk = null;
      loading.value = false;
      loadingMoreTopics.value = false;
      loadingClientTopics.value = false;
      unreadTopicSummaries.value = loadCachedUnreadTopicSummaries(
        authedUser.value?.id
      );
      hasMoreTopics.value = false;
    },
    { flush: 'sync' }
  );

  const getUnreadTopicList = (): ITopic[] => {
    const summaries = new Map(
      unreadTopicSummaries.value.map(topic => [topic.id, topic])
    );
    topics.value.forEach(topic => {
      const summary = summaries.get(topic.id);
      summaries.set(
        topic.id,
        summary &&
          getMessageTimestamp(summary.lastMessage) >
            getMessageTimestamp(topic.lastMessage)
          ? {
              ...topic,
              lastMessage: summary.lastMessage,
              unreadMessageCount:
                serverUnreadCounts.value[topic.id] ?? topic.unreadMessageCount
            }
          : topic
      );
    });
    return [...summaries.values()].filter(topic => !isCallTopic(topic));
  };

  const applyTopicPage = (
    response: PaginatedResponse<ITopic>,
    session: NonNullable<typeof paginationSession>,
    page: number,
    pruneMissing = false
  ): void => {
    response.data.forEach(topic => session.ids.add(topic.id));
    session.page = page;
    if (page === 1 && isTopicSyncState(response.sync))
      session.sync = response.sync;
    hasMoreTopics.value = hasNextTopicPage(response, page, TOPICS_PAGE_SIZE);
    if (response.unreadTopics) {
      unreadTopicSummaries.value = response.unreadTopics;
      saveCachedUnreadTopicSummaries(response.unreadTopics, session.userId);
    }
    const unreadById = response.unreadTopics
      ? new Map(response.unreadTopics.map(topic => [topic.id, topic]))
      : null;
    const received = new Map(
      response.data
        .filter(topic => isMainListTopic(topic) || topic.id === route.value.id)
        .map(topic => [topic.id, topic])
    );
    const retained = topics.value.filter(
      topic =>
        (!isCallTopic(topic) || topic.id === route.value.id) &&
        (hasMoreTopics.value ||
          !isMainListTopic(topic) ||
          session.ids.has(topic.id) ||
          (!pruneMissing && topic.id === route.value.id))
    );
    retained.forEach(topic => {
      if (!received.has(topic.id)) {
        const summary = unreadById?.get(topic.id);
        received.set(
          topic.id,
          unreadById
            ? {
                ...topic,
                unreadMessageCount: summary?.unreadMessageCount ?? 0,
                taggedMe: summary?.taggedMe ?? false,
                info: {
                  ...topic.info,
                  isMute: summary?.info?.isMute ?? topic.info?.isMute
                }
              }
            : topic
        );
      }
    });
    setTopics([...received.values()]);
    lastNetworkTopicsAppliedAt = Date.now();
    topicsRefreshFailed.value = false;
  };

  const persistTopicSyncSession = async (
    session: NonNullable<typeof paginationSession>
  ) => {
    const sync = !hasMoreTopics.value && session.sync ? session.sync : null;
    await saveCachedTopicSyncSnapshot(
      stripEphemeralTopicState(topics.value),
      sync,
      session.userId
    );
    if (sync) rememberNativeTopicSync(sync);
  };

  const finishTopicMaintenance = async (): Promise<void> => {
    if (!hasMoreTopics.value) {
      await ensureFavoriteTopic();
      const serverActiveCalls = topics.value
        .filter(
          topic =>
            !!topic.activeCall?.roomId &&
            typeof topic.activeCall?.callType === 'string'
        )
        .map(topic => ({
          roomId: topic.activeCall!.roomId,
          topicId: topic.id,
          callType: topic.activeCall!.callType || 'livekit',
          startTime: topic.activeCall?.startTime ?? null,
          participantCount: topic.activeCall?.participantCount,
          groupMode: topic.activeCall?.groupMode,
          elapsedDurationMs: topic.activeCall?.elapsedDurationMs
        }));
      const { syncServerActiveCalls } = await import('../services/useCalls');
      await syncServerActiveCalls(serverActiveCalls);
    }
    await warmShadowUnreadStateForTopics(topics.value);
  };

  const fetchAllTopics = (options?: {
    forceFull?: boolean;
    deferMaintenanceUntil?: Promise<void>;
    cacheReady?: Promise<void>;
    onNetworkApplied?: (sync?: TopicSyncState) => void;
  }): Promise<ITopic[]> => {
    if (
      refreshPromise &&
      !options?.forceFull &&
      (!paginationSession ||
        (paginationSession.sdk === getChatSDK() &&
          paginationSession.userId === authedUser.value?.id))
    )
      return refreshPromise.then(items => {
        if (
          !topicsRefreshFailed.value &&
          paginationSession?.sdk === getChatSDK()
        )
          options?.onNetworkApplied?.(paginationSession?.sync);
        return items;
      });
    morePromise = undefined;
    loadingMoreTopics.value = false;
    loading.value = true;
    error.value = null;
    const task = (async () => {
      const sdk = getChatSDK() || (await waitForChatSDK());
      if (!sdk) throw new Error('Чат ещё не подключён');
      const userId = authedUser.value?.id;
      const session: NonNullable<typeof paginationSession> = {
        sdk,
        userId,
        page: 0,
        ids: new Set<string>()
      };
      paginationSession = session;
      const isCurrent = () =>
        paginationSession === session &&
        getChatSDK() === sdk &&
        authedUser.value?.id === userId;
      await options?.cacheReady;
      if (!isCurrent()) return topics.value;
      // Новый session отменит применение запоздалой дельты, не ожидая её ответа.
      const confirmed = options?.forceFull
        ? null
        : await loadCachedTopicSyncSnapshot(userId);
      if (!isCurrent()) return topics.value;
      let response: PaginatedResponse<ITopic> | undefined;
      let isDelta = false;
      if (
        confirmed &&
        !options?.forceFull &&
        !isPtsReplayStale(confirmed.sync.syncedAt)
      ) {
        try {
          const delta = await sdk.syncTopics(confirmed.sync);
          if (!isCurrent()) return topics.value;
          if (delta.reset === false && isTopicSyncState(delta.sync)) {
            const calls = new Map(
              delta.activeCalls.map(call => [call.topicId, call])
            );
            const merged = new Map(
              confirmed.topics.map(topic => [topic.id, topic])
            );
            delta.data.forEach(topic => merged.set(topic.id, topic));
            if (delta.topicIds.every(id => merged.has(id))) {
              isDelta = true;
              response = {
                data: delta.topicIds.map(id => ({
                  ...merged.get(id)!,
                  activeCall: calls.get(id) || null
                })),
                unreadTopics: delta.unreadTopics,
                sync: delta.sync,
                meta: {
                  totalItems: delta.topicIds.length,
                  totalPages: 1,
                  currentPage: 1
                }
              } as PaginatedResponse<ITopic>;
            }
          }
        } catch (syncError) {
          if (!isCurrent()) return topics.value;
          console.warn(
            'Не удалось обновить список по PTS, проверяем первую страницу:',
            syncError
          );
        }
      }
      response ??= await sdk.getTopics({
        scope: 'chats',
        includeUnread: true,
        includeSync: true
      });
      if (!isCurrent()) return topics.value;
      applyTopicPage(response, session, 1, isDelta);
      // Старый сервер игнорирует scope: первые страницы могут состоять только
      // из служебных звонков. Доходим до обычных чатов без пустого первого экрана.
      if (
        !isDelta &&
        !isTopicSyncState(response.sync) &&
        response.data.some(topic => !isMainListTopic(topic))
      ) {
        let visibleCount = response.data.filter(isMainListTopic).length;
        while (hasMoreTopics.value && visibleCount < TOPICS_PAGE_SIZE) {
          const totalPages = response.meta?.totalPages ?? response.totalPages;
          const batchSize = Number.isInteger(totalPages)
            ? Math.max(1, Math.min(3, totalPages! - session.page))
            : 1;
          const firstPage = session.page + 1;
          const batch = await Promise.allSettled(
            Array.from({ length: batchSize }, (_, index) =>
              sdk.getTopics({ page: firstPage + index, scope: 'chats' })
            )
          );
          if (!isCurrent()) return topics.value;
          for (const [index, result] of batch.entries()) {
            if (result.status === 'rejected') throw result.reason;
            const next = result.value;
            const page = firstPage + index;
            if (
              hasNextTopicPage(next, page, TOPICS_PAGE_SIZE) &&
              next.data.every(topic => session.ids.has(topic.id))
            )
              throw new Error(
                'Сервер вернул повторную или пустую страницу чатов'
              );
            visibleCount += next.data.filter(isMainListTopic).length;
            applyTopicPage(next, session, page);
          }
        }
      }
      // Старый API без курсора и без прежнего снимка нечего подтверждать
      // или сбрасывать. Запись пустого снимка задерживала первый экран.
      if (session.sync || confirmed) await persistTopicSyncSession(session);
      if (!isCurrent()) return topics.value;
      options?.onNetworkApplied?.(session.sync);
      const maintenance = async () => {
        if (isCurrent()) await finishTopicMaintenance();
      };
      if (options?.deferMaintenanceUntil) {
        void options.deferMaintenanceUntil.then(maintenance).catch(error => {
          console.warn(
            'Не удалось завершить фоновую подготовку списка:',
            error
          );
        });
      } else await maintenance();
      return topics.value;
    })()
      .catch(err => {
        if (refreshPromise === task) {
          topicsRefreshFailed.value = true;
          error.value = (err as Error).message;
          console.error('Не удалось загрузить чаты:', error.value);
        }
        return topics.value;
      })
      .finally(() => {
        if (refreshPromise === task) {
          loading.value = false;
          refreshPromise = undefined;
        }
      });
    refreshPromise = task;
    return task;
  };

  const loadMoreTopics = (): Promise<ITopic[]> => {
    if (morePromise) return morePromise;
    if (refreshPromise) return refreshPromise.then(loadMoreTopics);
    const session = paginationSession;
    if (!session || !hasMoreTopics.value) return Promise.resolve(topics.value);
    loadingMoreTopics.value = true;
    const task = (async () => {
      const page = session.page + 1;
      const response = await session.sdk.getTopics({ page, scope: 'chats' });
      if (
        paginationSession !== session ||
        getChatSDK() !== session.sdk ||
        authedUser.value?.id !== session.userId
      )
        return topics.value;
      if (
        hasNextTopicPage(response, page, TOPICS_PAGE_SIZE) &&
        response.data.every(topic => session.ids.has(topic.id))
      ) {
        throw new Error('Сервер вернул повторную или пустую страницу чатов');
      }
      applyTopicPage(response, session, page);
      if (session.sync) await persistTopicSyncSession(session);
      if (!hasMoreTopics.value) await finishTopicMaintenance();
      return topics.value;
    })()
      .catch(err => {
        if (paginationSession === session) {
          topicsRefreshFailed.value = true;
          error.value = (err as Error).message;
        }
        return topics.value;
      })
      .finally(() => {
        if (morePromise === task) {
          loadingMoreTopics.value = false;
          morePromise = undefined;
        }
      });
    morePromise = task;
    return task;
  };

  const loadRemainingTopics = async (): Promise<void> => {
    if (refreshPromise) await refreshPromise;
    while (hasMoreTopics.value) {
      const previousPage = paginationSession?.page;
      await loadMoreTopics();
      if (paginationSession?.page === previousPage) return;
    }
  };

  const loadClientTopics = (options?: {
    isAllowed?: () => boolean;
  }): Promise<void> => {
    const requestedSdk = getChatSDK();
    const userId = authedUser.value?.id;
    if (!userId || options?.isAllowed?.() === false) return Promise.resolve();
    if (clientsPromise && clientsSdk === requestedSdk) return clientsPromise;
    clientsSdk = requestedSdk;
    loadingClientTopics.value = true;
    const task = (async () => {
      const sdk = await (requestedSdk || waitForChatSDK());
      if (
        !sdk ||
        clientsPromise !== task ||
        authedUser.value?.id !== userId ||
        options?.isAllowed?.() === false
      )
        return;
      clientsSdk = sdk;
      const clients = await sdk.getAllTopics({
        scope: 'clients',
        isCurrent: () => getChatSDK() === sdk && authedUser.value?.id === userId
      });
      if (
        clientsPromise !== task ||
        getChatSDK() !== sdk ||
        authedUser.value?.id !== userId ||
        options?.isAllowed?.() === false
      )
        return;
      setTopics([
        ...topics.value.filter(
          topic => isMainListTopic(topic) || topic.id === route.value.id
        ),
        ...clients
      ]);
    })()
      .catch(error => {
        if (clientsPromise === task && authedUser.value?.id === userId)
          topicsRefreshFailed.value = true;
        console.warn('Не удалось загрузить чаты клиентов:', error);
      })
      .finally(() => {
        if (clientsPromise === task) {
          clientsPromise = undefined;
          clientsSdk = null;
          loadingClientTopics.value = false;
        }
      });
    clientsPromise = task;
    return task;
  };

  const createTopic = async (peerId: string): Promise<ITopic | null> => {
    loading.value = true;
    error.value = null;

    try {
      const sdk = getChatSDK();
      const newTopic = await sdk.createTopic({ peerId });

      const normalized = normalizeTopic(newTopic as ITopic);
      topics.value = normalizeTopics([
        normalized,
        ...topics.value.filter(topic => topic.id !== normalized.id)
      ]);
      schedulePersistTopics();
      return normalized;
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to create topic:', error.value);
      return null;
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
      const incomingMessage = lastMessage || getLocalLastMessage(topic);
      if (lastMessage) {
        topic.lastMessage = resolveLatestMessage(topic, lastMessage);
      } else {
        topic.lastMessage = resolveLastMessageAfterLocalSync(
          topic.lastMessage,
          incomingMessage,
          hasKnownTopicMessagesState(topicId)
        );
      }

      if (
        incomingMessage?.id === topic.lastMessage?.id &&
        incomingMessage?.status !== topic.lastMessage?.status
      ) {
        recordTopicStateTelemetry(
          'local_snapshot_merge',
          topic,
          incomingMessage,
          authedUser.value?.id,
          {
            incomingStatus: incomingMessage?.status,
            statusReconciled: true
          },
          true
        );
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
    const topic = topicsById.value.get(topicId);
    if (topic) {
      // Сначала заменяем временный ID серверным, даже если часы клиента спешат.
      const lastMessage = resolveLatestMessage(topic);
      topic.lastMessage = lastMessage;
      if (lastMessage && messageIds.includes(lastMessage.id)) {
        lastMessage.status = MessageStatus.Read;
      }
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const changeUnreadMessageCount = (delta: number, topicId: string) => {
    const topic = topicsById.value.get(topicId);
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
    if (delta <= 0 || getIsAppActivelyVisible()) {
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
  ): boolean => {
    if (!topicId || !topicReadPreviewIds.value[topicId]?.length) {
      return false;
    }

    if (!messageIds || messageIds.length === 0) {
      const next = { ...topicReadPreviewIds.value };
      delete next[topicId];
      topicReadPreviewIds.value = next;
      syncTopicUnreadState(topicId);
      return true;
    }

    const nextIds = (topicReadPreviewIds.value[topicId] || []).filter(
      id => !messageIds.includes(id)
    );

    topicReadPreviewIds.value = {
      ...topicReadPreviewIds.value,
      [topicId]: nextIds
    };

    syncTopicUnreadState(topicId);
    return true;
  };

  const syncTopicUnreadState = (topicId: string): void => {
    const topic = topicsById.value.get(topicId);

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
    // Локальный расчёт ограничен серверным счётчиком: при нуле история не нужна.
    if (effectiveServerUnreadCount === 0) {
      if (topic.unreadMessageCount !== 0 || topic.taggedMe !== false) {
        topic.unreadMessageCount = 0;
        topic.taggedMe = false;
        topics.value = [...topics.value];
        schedulePersistTopics();
        syncDisplayedUnreadCount();
      }
      return;
    }
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
    let unreadMessageCount = 0;
    let computedUnreadMessageCount = 0;
    let unreadHasTaggedMessage = false;
    let computedUnreadHasTaggedMessage = false;
    let hasLatestMessageInLocalCache = !latestKnownMessage?.id;
    const hasShadowReadBoundary = Boolean(
      shadowReadState?.lastReadMessageId || shadowReadState?.lastReadAt
    );

    for (const message of messages) {
      if (message.id === latestKnownMessage?.id) {
        hasLatestMessageInLocalCache = true;
      }

      if (
        !isUnreadTrackableMessageForUser(message, currentUserId) ||
        message.senderUserId === currentUserId ||
        previewReadIds.has(message.id)
      ) {
        continue;
      }

      const isTagged = Boolean(message.taggedUserIds?.includes(currentUserId));
      if (message.isReadByMe !== true) {
        unreadMessageCount += 1;
        unreadHasTaggedMessage ||= isTagged;
      }

      if (
        message.isReadByMe !== true &&
        shadowReadStateExists &&
        (!hasShadowReadBoundary ||
          getMessageTimestamp(message) > shadowLastReadTimestamp)
      ) {
        computedUnreadMessageCount += 1;
        computedUnreadHasTaggedMessage ||= isTagged;
      }
    }
    const hasReadThroughLatestMessage =
      hasShadowReadBoundary &&
      latestKnownMessageTimestamp > 0 &&
      shadowLastReadTimestamp >= latestKnownMessageTimestamp;
    const hasAllUnreadMessagesInCache =
      unreadMessageCount >= effectiveServerUnreadCount;
    const shouldUseComputedUnread =
      shadowReadStateExists &&
      hasLatestRangeCoverage &&
      hasLatestMessageInLocalCache &&
      (hasAllUnreadMessagesInCache || hasReadThroughLatestMessage);
    const shouldSuppressUnreadForNonTrackableLatestMessage =
      !!latestKnownMessage &&
      isUnreadIgnoredMessageForUser(latestKnownMessage, currentUserId) &&
      effectiveServerUnreadCount <= 1 &&
      unreadMessageCount === 0;

    const nextUnreadCount = shouldSuppressUnreadForNonTrackableLatestMessage
      ? 0
      : shouldUseComputedUnread
        ? Math.min(effectiveServerUnreadCount, computedUnreadMessageCount)
        : effectiveServerUnreadCount;
    const knownUnreadHasTaggedMessage = shouldUseComputedUnread
      ? computedUnreadHasTaggedMessage
      : unreadHasTaggedMessage;
    // Отсутствие упоминания в части истории не отменяет серверный значок @.
    const nextTaggedMe =
      nextUnreadCount > 0 &&
      (knownUnreadHasTaggedMessage ||
        (Boolean(topic.taggedMe) &&
          !hasAllUnreadMessagesInCache &&
          !hasReadThroughLatestMessage));

    if (
      baseUnreadCount !== nextUnreadCount ||
      topic.unreadMessageCount !== nextUnreadCount
    ) {
      recordTopicStateTelemetry(
        'unread_reconciled',
        topic,
        messages.find(message => message.id === topic.lastMessage?.id),
        currentUserId,
        {
          serverUnreadCount: baseUnreadCount,
          effectiveServerUnreadCount,
          previewReadCount: previewReadIds.size,
          localMessageCount: messages.length,
          localUnreadCount: unreadMessageCount,
          computedUnreadMessageCount,
          shouldUseComputedUnread,
          hasLatestRangeCoverage,
          hasLatestMessageInLocalCache,
          hasShadowReadBoundary,
          shadowLastReadMessageId: shadowReadState?.lastReadMessageId,
          shadowLastReadAt: shadowReadState?.lastReadAt,
          nextUnreadCount
        }
      );
    }

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
    syncDisplayedUnreadCount();
  };

  const resetTopicUnreadState = (topicId: string): void => {
    const topic = topicsById.value.get(topicId);

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
    syncDisplayedUnreadCount();
  };

  const updateTopicUnreadReaction = (
    topicId: string,
    action: 'added' | 'updated' | 'removed',
    reactionId?: string,
    messageId?: string
  ): void => {
    const topic = topics.value.find(topic => topic.id === topicId);

    if (!topic) {
      return;
    }

    const reactionIds =
      unreadReactionIdsByTopic.get(topicId) || new Set<string>();
    const reactionTargets =
      unreadReactionTargetsByTopic.get(topicId) || new Map<string, string>();
    const reactionKey = reactionId || (messageId ? `message:${messageId}` : '');

    if (action === 'removed') {
      if (!reactionId || !reactionIds.has(reactionId)) {
        if (topic.unreadReactionMessageId !== messageId) {
          return;
        }

        topic.hasUnreadReaction = false;
        topic.unreadReactionMessageId = undefined;
        topics.value = [...topics.value];
        schedulePersistTopics();
        return;
      }

      reactionIds.delete(reactionId);
      reactionTargets.delete(reactionId);
      topic.hasUnreadReaction = reactionIds.size > 0;
      topic.unreadReactionMessageId =
        [...reactionTargets.values()].at(-1) || undefined;
    } else {
      if (reactionKey) {
        reactionIds.add(reactionKey);
        unreadReactionIdsByTopic.set(topicId, reactionIds);

        if (messageId) {
          reactionTargets.delete(reactionKey);
          reactionTargets.set(reactionKey, messageId);
          unreadReactionTargetsByTopic.set(topicId, reactionTargets);
        }
      }

      topic.hasUnreadReaction = true;
      topic.unreadReactionMessageId = messageId;
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const getTopicUnreadReactionMessageId = (topicId: string): string | null => {
    const reactionTargets = unreadReactionTargetsByTopic.get(topicId);
    const topic = topics.value.find(topic => topic.id === topicId);
    const trackedMessageId = [...(reactionTargets?.values() || [])].at(-1);

    if (trackedMessageId || topic?.unreadReactionMessageId) {
      return trackedMessageId || topic?.unreadReactionMessageId || null;
    }

    return null;
  };

  const clearTopicUnreadReaction = (topicId: string): void => {
    const topic = topics.value.find(topic => topic.id === topicId);

    unreadReactionIdsByTopic.delete(topicId);
    unreadReactionTargetsByTopic.delete(topicId);

    if (!topic?.hasUnreadReaction) {
      return;
    }

    topic.hasUnreadReaction = false;
    topic.unreadReactionMessageId = undefined;
    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const updateLocalTopicInfo = (topicId: string, info: ITopicInfo): void => {
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

      const isBotDmTopic =
        topic.type === TopicType.DM &&
        (isBotTopic(topic) || isBotUser(nextUser));

      return {
        ...topic,
        members: nextMembers,
        user: nextUser,
        avatarUrl:
          topic.type === TopicType.DM
            ? isBotDmTopic
              ? nextUser?.avatarUrl || ''
              : nextUser?.avatarUrl || topic.avatarUrl
            : topic.avatarUrl,
        name:
          topic.type === TopicType.DM
            ? resolveDmTopicName(topic, nextUser)
            : topic.name
      };
    });

    if (!hasChanges) {
      return;
    }

    topics.value = [...topics.value];
    schedulePersistTopics();
  };

  const updateLocalTopicDetails = (
    topicId: string,
    changes: Partial<ITopic>
  ): void => {
    if (!topicId || !changes) {
      return;
    }

    let hasChanges = false;

    topics.value = topics.value.map(topic => {
      if (topic.id !== topicId) {
        return topic;
      }

      hasChanges = true;
      const nextTopic = { ...topic };

      if ('name' in changes) {
        nextTopic.name = changes.name;
      }

      if ('avatarUrl' in changes) {
        nextTopic.avatarUrl = changes.avatarUrl;
      }

      if (changes.user) {
        nextTopic.user = changes.user;

        if (nextTopic.type === TopicType.DM) {
          nextTopic.name = resolveDmTopicName(nextTopic, changes.user);
          nextTopic.avatarUrl = changes.user.avatarUrl || '';
        }
      }

      if (changes.members) {
        nextTopic.members = changes.members;
      }

      if (changes.info) {
        nextTopic.info = {
          ...nextTopic.info,
          ...changes.info
        };
      }

      if (changes.group && nextTopic.group) {
        nextTopic.group = {
          ...nextTopic.group,
          ...changes.group
        };
      }

      if (nextTopic.group) {
        if ('name' in changes) {
          nextTopic.group.title = changes.name || nextTopic.group.title;
        }

        if ('avatarUrl' in changes) {
          nextTopic.group.avatarUrl = changes.avatarUrl || '';
        }
      }

      return nextTopic;
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
      const setting = await sdk.togglePinTopic(topic.id);

      updateLocalTopicInfo(topic.id, applyTopicPinSetting(topic.info, setting));
    } catch (err) {
      console.error('Failed to pin/unpin topic:', err);
    }
  };

  const toggleMuteTopic = async (topic: ITopic) => {
    try {
      const sdk = getChatSDK();
      await sdk.toggleMuteTopic(topic.id);
      if (isFavoriteTopic(topic, authedUser.value?.id)) {
        updateLocalTopicInfo(topic.id, { isMute: !topic.info.isMute });
      } else if (topic.type === TopicType.DM) {
        updateLocalTopicInfo(topic.id, { isMute: !topic.info.isMute });
      } else if (topic.type === TopicType.Group) {
        updateLocalGroupInfo(topic.id, { isMute: !topic.info.isMute });
      }
    } catch (err) {
      console.error('Failed to mute/unmute topic:', err);
    }
  };

  const setTopicMarkedUnread = async (
    topic: ITopic,
    isMarkedUnread: boolean
  ) => {
    const previousMarkedUnread = Boolean(topic.info?.isMarkedUnread);
    const applyMarkedUnread = (value: boolean) => {
      if (isFavoriteTopic(topic, authedUser.value?.id)) {
        updateLocalTopicInfo(topic.id, { isMarkedUnread: value });
      } else if (topic.type === TopicType.DM) {
        updateLocalTopicInfo(topic.id, { isMarkedUnread: value });
      } else if (topic.type === TopicType.Group) {
        updateLocalGroupInfo(topic.id, { isMarkedUnread: value });
      }
    };

    applyMarkedUnread(isMarkedUnread);

    try {
      const sdk = getChatSDK();
      await sdk.setTopicMarkedUnread(topic.id, isMarkedUnread);
    } catch (err) {
      applyMarkedUnread(previousMarkedUnread);
      console.error('Failed to set topic marked unread:', err);
    }
  };

  const addTopicList = (value: ITopic): void => {
    const normalized = normalizeTopic(value);
    topics.value = normalizeTopics([
      normalized,
      ...topics.value.filter(topic => topic.id !== normalized.id)
    ]);
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
    unreadTopicSummaries.value = unreadTopicSummaries.value.filter(
      topic => topic.id !== topicId
    );
    saveCachedUnreadTopicSummaries(
      unreadTopicSummaries.value,
      authedUser.value?.id
    );
    topics.value = [...topics.value.filter(t => t.id !== topicId)];
    groups.value = [...groups.value.filter(t => t.id !== topicId)];
    schedulePersistTopics();
  };

  const sortTopics = (topics: ITopic[]): ITopic[] => {
    return sortTopicsByPinOrder(topics);
  };

  const getTopicList = (): ITopic[] => {
    return sortTopics(topics.value || []);
  };

  const getSelectedTopic = (
    topicId: string = route.value.id
  ): ITopic | undefined => topicsById.value.get(topicId);

  const isTopicMuted = (topicId: string): boolean => {
    const topic = getSelectedTopic(topicId);
    return topic?.info?.isMute || false;
  };

  const totalUnreadCount = computed(() => {
    return getUnreadTopicList().reduce(
      (acc, topic) => acc + getTopicDisplayableUnreadCount(topic),
      0
    );
  });

  watch(totalUnreadCount, () => syncDisplayedUnreadCount(), {
    immediate: true
  });

  watch(
    () =>
      topics.value.map(topic => ({
        id: topic.id,
        unreadMessageCount: topic.unreadMessageCount || 0,
        isMute: !!topic.info?.isMute
      })),
    () => {
      syncDesktopUnreadBadge();
    },
    { deep: true }
  );

  const handleVisibilityChange = () => {
    if (getIsAppActivelyVisible()) {
      syncDisplayedUnreadCount(true);
    }
  };

  bindTopicsVisibilityListener(handleVisibilityChange);

  if (!isDesktopVisibilityBound) {
    subscribeToAppVisibilityChanges(() => {
      if (getIsAppActivelyVisible()) {
        syncDisplayedUnreadCount(true);
        return;
      }

      syncDesktopUnreadBadge(true);
    });
    isDesktopVisibilityBound = true;
  }

  return {
    topics,
    loading,
    error,
    totalUnreadCount,
    setTopics,
    applyNativeTopicSnapshot,
    hydrateTopicsFromCache,
    fetchAllTopics,
    hasMoreTopics,
    loadingMoreTopics,
    loadingClientTopics,
    loadMoreTopics,
    loadRemainingTopics,
    loadClientTopics,
    getUnreadTopicList,
    createTopic,
    updateLocalLastMessageTopic,
    updateLocalTopicReadStatus,
    changeUnreadMessageCount,
    updateLocalTopicInfo,
    togglePinTopic,
    toggleMuteTopic,
    setTopicMarkedUnread,
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
    updateTopicUnreadReaction,
    getTopicUnreadReactionMessageId,
    clearTopicUnreadReaction,
    incrementServerUnreadCount,
    decrementServerUnreadCount,
    incrementDisplayedUnreadCount,
    updateLocalTopicUser,
    updateLocalTopicDetails,
    cleanupFavoriteTopicSystemMessages
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
  applyNativeTopicSnapshot,
  hydrateTopicsFromCache,
  changeUnreadMessageCount,
  toggleMuteTopic,
  togglePinTopic,
  setTopicMarkedUnread,
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
  updateTopicUnreadReaction,
  getTopicUnreadReactionMessageId,
  clearTopicUnreadReaction,
  incrementServerUnreadCount,
  decrementServerUnreadCount,
  totalUnreadCount,
  incrementDisplayedUnreadCount,
  updateLocalTopicUser,
  updateLocalTopicDetails,
  cleanupFavoriteTopicSystemMessages
} = useTopics();

export {
  topics,
  setTopics,
  applyNativeTopicSnapshot,
  hydrateTopicsFromCache,
  fetchAllTopics,
  createTopic,
  updateLocalLastMessageTopic,
  updateLocalTopicReadStatus,
  changeUnreadMessageCount,
  updateLocalTopicInfo,
  togglePinTopic,
  toggleMuteTopic,
  setTopicMarkedUnread,
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
  updateTopicUnreadReaction,
  getTopicUnreadReactionMessageId,
  clearTopicUnreadReaction,
  incrementServerUnreadCount,
  decrementServerUnreadCount,
  totalUnreadCount,
  incrementDisplayedUnreadCount,
  updateLocalTopicUser,
  updateLocalTopicDetails,
  cleanupFavoriteTopicSystemMessages
};
