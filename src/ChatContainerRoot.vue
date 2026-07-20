<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';

import type { IChatContainerProps } from './components/interfaces/interfaces';
import { initializeChat, setCurrentUserId } from './services/useChat';
import {
  saveUserIdToSession,
  hasUserIdInSession
} from './services/useSessionUser';
import {
  clearBootstrapErpSession,
  clearChatAuthSession,
  clearErpAuthSession,
  fetchAuthUser,
  getAuthUser,
  getChatAuthSession,
  getStoredBootstrapErpAccessToken,
  getStoredChatAccessToken,
  isStoredChatSessionPersistent,
  isAuthError,
  saveChatAuthSession,
  setAuthUser,
  tryRefreshErpSession,
  useAuth
} from './composables/useAuth';
import { setAuthToken } from './composables/useLogin';
import {
  fetchAllUsers,
  getUserById,
  hydrateUsersFromCache
} from './composables/useUsers';
import { getConfig } from './services/useConfig';
import { hydrateTopicsFromCache, useTopics } from './composables/useTopics';
import { getGroupById } from './composables/useGroup';
import { useUrlWatcher } from './composables/navigation';
import { fetchPinnedMessagesForTopic } from './services/useMessages';
import { initPushNotifications } from './services/usePushNotifications';
import {
  clearTopicNotifications,
  syncNotificationContext
} from './services/useNotificationNavigation';
import {
  getIsAppActivelyVisible,
  subscribeToAppVisibilityChanges
} from './services/useAppVisibility';
import { useResizeState } from './composables/useResizeState';
import { MAX_W_MD } from './utils/constants';
import { RouteTypes } from './composables/navigation/useUrlRouting';
import {
  clearVisibleMessagesForTopic,
  hydrateMessagesFromCache
} from './services/useMessages';
import { useShareSelection } from './composables/useShareSelection';
import { isGroupCallInviteUrl } from './utils/groupCallInviteUrl';
import { installNotoEmojiFontFaces } from './composables/useEmojiStyle';
import { importAnyChatBackgroundSnapshot } from './services/useChatBackgroundSync';

const props = defineProps<IChatContainerProps>();

installNotoEmojiFontFaces();

const { fetchAllTopics, getTopicList, setTopics } = useTopics();
const { state: isMobile } = useResizeState(MAX_W_MD);
const route = useUrlWatcher();
let removeAppVisibilityListener: (() => void) | null = null;
const { hasPendingShareBatches, isShareSelectionActive, startShareSelection } =
  useShareSelection();
let hydratedCacheUserId: string | undefined;
const MOBILE_CACHED_ACTIVE_TOPIC_LIMIT = 180;
const ONLINE_STARTUP_BACKGROUND_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const hasStartupNetwork = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine;

type CriticalCacheHydrationOptions = {
  allowTopicCache?: boolean;
  allowActiveMessageCache?: boolean;
};

const getStartupSnapshotMaxAge = (): number | undefined =>
  hasStartupNetwork()
    ? ONLINE_STARTUP_BACKGROUND_SNAPSHOT_MAX_AGE_MS
    : undefined;

const getStartupSnapshotMessageImportOptions = () => {
  const activeTopicId = route.value.id || '';
  const shouldImportActiveMessages = !hasStartupNetwork() && !!activeTopicId;

  return {
    prioritizeMessageTopicIds: activeTopicId ? [activeTopicId] : undefined,
    maxMessageTopicImports: shouldImportActiveMessages ? 1 : 0,
    maxMessagesPerTopic: isMobile.value
      ? MOBILE_CACHED_ACTIVE_TOPIC_LIMIT
      : undefined
  };
};

const importStartupBackgroundSnapshot = (
  userId: string | undefined,
  source: string
): Promise<boolean> =>
  importAnyChatBackgroundSnapshot(userId, {
    source,
    maxAgeMs: getStartupSnapshotMaxAge(),
    requireNewerThanLocalPts: hasStartupNetwork(),
    ...getStartupSnapshotMessageImportOptions(),
    requireRenderableContent: true,
    skipMessageTopicIds:
      hasStartupNetwork() && route.value.id ? [route.value.id] : undefined
  });

const shouldAllowStartupTopicCache = (
  hasFreshBackgroundSnapshot = false
): boolean =>
  isMobile.value || !hasStartupNetwork() || hasFreshBackgroundSnapshot;

const shouldAllowStartupActiveMessageCache = (): boolean =>
  isMobile.value || !hasStartupNetwork();

const waitForStartupIdle = (): Promise<void> =>
  new Promise(resolve => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 1500 });
      return;
    }

    setTimeout(resolve, 0);
  });

const runDeferredStartupTask = (
  label: string,
  task: () => Promise<void>
): void => {
  void waitForStartupIdle()
    .then(task)
    .catch(error => {
      console.warn(
        `Не удалось выполнить отложенную задачу старта "${label}":`,
        error
      );
    });
};

const shouldHydrateCacheBeforeStartupSnapshot = (): boolean =>
  shouldAllowStartupTopicCache(false) || shouldAllowStartupActiveMessageCache();

const scheduleStartupBackgroundSnapshotImport = (
  userId: string | undefined,
  source: string
): void => {
  if (!userId) {
    return;
  }

  runDeferredStartupTask(source, async () => {
    await importStartupBackgroundSnapshot(userId, source);
  });
};

const getKnownTopicIds = (): string[] =>
  Array.from(
    new Set(
      [
        ...getTopicList()
          .map(topic => topic.id)
          .filter(Boolean),
        route.value.id || ''
      ].filter(Boolean)
    )
  );

const hydrateActiveCachedMessages = async (userId?: string): Promise<void> => {
  const activeTopicId = route.value.id || '';

  if (!activeTopicId) {
    return;
  }

  await hydrateMessagesFromCache(activeTopicId, userId, {
    visibleLimit: isMobile.value ? MOBILE_CACHED_ACTIVE_TOPIC_LIMIT : undefined
  });
};

const scheduleBackgroundCachedMessageHydration = (userId?: string): void => {
  const activeTopicId = route.value.id || '';
  const topicIds = getKnownTopicIds().filter(
    topicId => topicId !== activeTopicId
  );

  if (topicIds.length === 0) {
    return;
  }

  runDeferredStartupTask('cached messages hydration', async () => {
    for (const topicId of topicIds) {
      await hydrateMessagesFromCache(topicId, userId);
      await waitForStartupIdle();
    }
  });
};

const hydrateCriticalCache = async (
  userId?: string,
  opts?: CriticalCacheHydrationOptions
): Promise<void> => {
  const allowTopicCache = !!opts?.allowTopicCache;
  const allowActiveMessageCache = !!opts?.allowActiveMessageCache;
  const usersHydration = hydrateUsersFromCache(userId);
  const topicsHydration = allowTopicCache
    ? hydrateTopicsFromCache(userId)
    : Promise.resolve([]);

  await usersHydration;

  if (userId) {
    applyCachedAuthUser(userId);
  }

  if (!allowTopicCache) {
    setTopics([]);
  } else {
    await topicsHydration;
  }

  if (allowActiveMessageCache) {
    await hydrateActiveCachedMessages(userId);
  } else if (route.value.id && hasStartupNetwork()) {
    clearVisibleMessagesForTopic(route.value.id);
  }

  if (allowTopicCache || allowActiveMessageCache) {
    scheduleBackgroundCachedMessageHydration(userId);
    hydratedCacheUserId = userId;
    return;
  }

  hydratedCacheUserId = undefined;
};

const hydrateFreshChatContent = async (userId?: string): Promise<boolean> => {
  if (!hasStartupNetwork()) {
    return false;
  }

  await Promise.allSettled([fetchAuthUser(), fetchAllUsers()]);

  if (!getAuthUser() && userId) {
    applyCachedAuthUser(userId);
  }

  await fetchAllTopics();

  hydratedCacheUserId = userId;
  return true;
};

const getActiveChatTopicId = (): string | null => {
  if (
    route.value.id &&
    (route.value.type === RouteTypes.DIALOGS ||
      route.value.type === RouteTypes.GROUP)
  ) {
    return route.value.id;
  }

  return null;
};

const updateNotificationContext = () => {
  const focused = getIsAppActivelyVisible();
  const topicId = getActiveChatTopicId();

  void syncNotificationContext({ focused, topicId });

  if (focused && topicId) {
    void clearTopicNotifications(topicId);
  }
};

const initFocusTracking = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(updateNotificationContext);
  }

  window.addEventListener('focus', updateNotificationContext);
  window.addEventListener('blur', updateNotificationContext);
  document.addEventListener('visibilitychange', updateNotificationContext);
  removeAppVisibilityListener = subscribeToAppVisibilityChanges(
    updateNotificationContext
  );
};

onUnmounted(() => {
  window.removeEventListener('focus', updateNotificationContext);
  window.removeEventListener('blur', updateNotificationContext);
  document.removeEventListener('visibilitychange', updateNotificationContext);
  removeAppVisibilityListener?.();
  removeAppVisibilityListener = null;
});

const clearStoredErpToken = () => {
  clearErpAuthSession();
};

const getStoredSessionUserId = (): string => {
  return sessionStorage.getItem('userId') || '';
};

const applyCachedAuthUser = (userId: string): void => {
  if (!userId || getAuthUser()) {
    return;
  }

  const cachedAuthUser = getUserById(userId);

  if (!cachedAuthUser) {
    return;
  }

  setAuthUser({
    ...cachedAuthUser,
    id: cachedAuthUser.id || '',
    nickname: cachedAuthUser.nickname || cachedAuthUser.id || '',
    initials: cachedAuthUser.initials || '',
    avatarUrl: cachedAuthUser.avatarUrl || '',
    status: cachedAuthUser.status || null,
    lastOnline: cachedAuthUser.lastOnline || new Date(),
    createdAt: cachedAuthUser.createdAt || new Date(),
    updatedAt: cachedAuthUser.updatedAt || new Date(),
    deletedAt: cachedAuthUser.deletedAt || null
  });
};

const restoreInvitedGroupCallDeferred = async (): Promise<void> => {
  if (
    typeof window === 'undefined' ||
    !isGroupCallInviteUrl(window.location.href)
  ) {
    return;
  }

  const { restoreInvitedGroupCallFromUrl } = await import(
    './services/useCalls'
  );

  await restoreInvitedGroupCallFromUrl();
};

const runDeferredOnlineStartup = (
  authUserId?: string,
  opts?: { skipFreshData?: boolean }
): void => {
  if (!opts?.skipFreshData) {
    runDeferredStartupTask('online refresh', async () => {
      await Promise.all([fetchAuthUser(), fetchAllUsers()]);

      if (!getAuthUser() && authUserId) {
        applyCachedAuthUser(authUserId);
      }

      await fetchAllTopics();

      if (route.value.id) {
        void fetchPinnedMessagesForTopic(route.value.id);

        if (route.value.type === RouteTypes.GROUP) {
          getGroupById(route.value.id);
        }
      }
    });
  }

  runDeferredStartupTask('group call restore', restoreInvitedGroupCallDeferred);

  runDeferredStartupTask('push notifications', async () => {
    try {
      await initPushNotifications();
    } catch (error) {
      console.warn('Не удалось инициализировать push-уведомления:', error);
    }
  });
};

const runAppInitialization = async () => {
  const url = new URL(window.location.href);
  const tokenUrl = url.searchParams.get('token')?.split('?token')[0];

  const storedChatToken = getStoredChatAccessToken();
  const bootstrapErpToken = tokenUrl || getStoredBootstrapErpAccessToken();
  const directAuthSession = getChatAuthSession();
  const config = getConfig();
  const persistSession = !!tokenUrl || isStoredChatSessionPersistent();
  const hasStoredChatSession = !!(directAuthSession?.token || storedChatToken);
  const shouldUseBootstrapToken =
    !!bootstrapErpToken && (hasStartupNetwork() || !hasStoredChatSession);
  const initialUserId =
    directAuthSession?.user?.id || getStoredSessionUserId() || '';
  let startupBackgroundSnapshotImported = false;
  let deferredStartupBackgroundSnapshotUserId: string | undefined;
  const deferStartupBackgroundSnapshot = (
    userId: string | undefined,
    source: string
  ): void => {
    if (!userId || deferredStartupBackgroundSnapshotUserId === userId) {
      return;
    }

    deferredStartupBackgroundSnapshotUserId = userId;
    scheduleStartupBackgroundSnapshotImport(userId, source);
  };

  if (initialUserId) {
    setCurrentUserId(initialUserId);
    if (shouldHydrateCacheBeforeStartupSnapshot()) {
      await hydrateCriticalCache(initialUserId, {
        allowTopicCache: shouldAllowStartupTopicCache(false),
        allowActiveMessageCache: shouldAllowStartupActiveMessageCache()
      });
      deferStartupBackgroundSnapshot(
        initialUserId,
        'startup-after-cache-hydration'
      );
    } else {
      startupBackgroundSnapshotImported = await importStartupBackgroundSnapshot(
        initialUserId,
        'startup-before-hydration'
      );
      await hydrateCriticalCache(initialUserId, {
        allowTopicCache: shouldAllowStartupTopicCache(
          startupBackgroundSnapshotImported
        ),
        allowActiveMessageCache: shouldAllowStartupActiveMessageCache()
      });
    }
  }

  try {
    const authData = shouldUseBootstrapToken
      ? await useAuth(bootstrapErpToken)
      : directAuthSession?.token || storedChatToken
        ? {
            token: directAuthSession?.token || storedChatToken || '',
            user: directAuthSession?.user
          }
        : await tryRefreshErpSession();
    if (!authData?.token) {
      throw new Error('Chat token is missing from auth response');
    }

    setAuthToken(authData.token);

    const authUserId =
      authData.user?.id ||
      directAuthSession?.user?.id ||
      getStoredSessionUserId();

    if (authUserId && !hasUserIdInSession(authUserId)) {
      saveUserIdToSession(authUserId);
    }

    saveChatAuthSession(
      {
        token: authData.token,
        user: authData.user
      },
      persistSession
    );
    if (shouldUseBootstrapToken) {
      clearBootstrapErpSession();
    }

    setCurrentUserId(authUserId || undefined);
    if (authData.user) setAuthUser(authData.user);

    const allowActiveMessageCache = shouldAllowStartupActiveMessageCache();
    const hasCurrentUserStartupSnapshot =
      startupBackgroundSnapshotImported && authUserId === initialUserId;

    if (authUserId !== hydratedCacheUserId) {
      if (shouldHydrateCacheBeforeStartupSnapshot()) {
        await hydrateCriticalCache(authUserId || undefined, {
          allowTopicCache: shouldAllowStartupTopicCache(
            hasCurrentUserStartupSnapshot
          ),
          allowActiveMessageCache
        });
        deferStartupBackgroundSnapshot(
          authUserId || undefined,
          'post-auth-after-cache-hydration'
        );
      } else {
        const postAuthBackgroundSnapshotImported =
          await importStartupBackgroundSnapshot(
            authUserId || undefined,
            'post-auth-before-hydration'
        );
        await hydrateCriticalCache(authUserId || undefined, {
          allowTopicCache: shouldAllowStartupTopicCache(
            hasCurrentUserStartupSnapshot ||
              postAuthBackgroundSnapshotImported
          ),
          allowActiveMessageCache
        });
      }
    } else {
      if (
        shouldAllowStartupTopicCache(hasCurrentUserStartupSnapshot) ||
        allowActiveMessageCache
      ) {
        scheduleBackgroundCachedMessageHydration(authUserId || undefined);
      }
      deferStartupBackgroundSnapshot(
        authUserId || undefined,
        'post-auth-after-cache-hydration'
      );
    }

    await initializeChat({
      token: authData.token,
      apiUrl: config.CHAT_API_DOMAIN,
      wsUrl: config.CHAT_WS_DOMAIN,
      userId: authUserId || undefined
    });

    const freshStartupCompleted = await hydrateFreshChatContent(
      authUserId || undefined
    );

    runDeferredOnlineStartup(authUserId || undefined, {
      skipFreshData: freshStartupCompleted
    });
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    if (isMobile.value) {
      if (isAuthError(error)) {
        clearStoredErpToken();
        clearChatAuthSession();
        clearBootstrapErpSession();
      }

      if (initialUserId && hydratedCacheUserId !== initialUserId) {
        await hydrateCriticalCache(initialUserId, {
          allowTopicCache: true,
          allowActiveMessageCache: true
        });
      }

      return;
    }
  } finally {
    if (tokenUrl) {
      url.searchParams.delete('token');
      url.searchParams.delete('organization');
      window.history.replaceState({}, document.title, url.toString());
    }
  }
};

onMounted(async () => {
  initFocusTracking();

  await runAppInitialization();
});

watch(
  () => [route.value.type, route.value.id],
  () => {
    updateNotificationContext();
  },
  { immediate: true }
);

watch(
  hasPendingShareBatches,
  hasPendingShares => {
    if (hasPendingShares && !isShareSelectionActive.value) {
      startShareSelection();
    }
  },
  { immediate: true }
);
</script>
