<template>
  <ChatContainer
    v-bind="props"
    @rendered-topic-change="handleRenderedTopicChange"
  />
</template>

<script setup lang="ts">
import { nextTick, onBeforeMount, onUnmounted, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';

import type {
  IChatContainerProps,
  IMessageRenderedTopicState
} from './components/interfaces/interfaces';
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
import { initTelemetryLocation } from './services/useTelemetryLocation';
import {
  clearTopicNotifications,
  notificationTopicRefreshRequest,
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
  getMessagesByTopicId,
  prefetchNotificationHistory,
  deferMessagePersistsUntil,
  hydrateMessagePreviewFromCache,
  hydrateNotificationMessagePreview,
  hydratePendingMessagesFromCache,
  hydrateMessagesFromCache
} from './services/useMessages';
import { useShareSelection } from './composables/useShareSelection';
import { isGroupCallInviteUrl } from './utils/groupCallInviteUrl';
import { installNotoEmojiFontFaces } from './composables/useEmojiStyle';
import {
  importAnyChatBackgroundSnapshot,
  loadNativeNotificationPreview
} from './services/useChatBackgroundSync';

const props = defineProps<IChatContainerProps>();
const emit = defineEmits<{
  (e: 'ready'): void;
}>();

installNotoEmojiFontFaces();

const { fetchAllTopics } = useTopics();
const { state: isMobile } = useResizeState(MAX_W_MD);
const route = useUrlWatcher();
let removeAppVisibilityListener: (() => void) | null = null;
const { hasPendingShareBatches, isShareSelectionActive, startShareSelection } =
  useShareSelection();
let hydratedCacheUserId: string | undefined;
const MOBILE_CACHED_ACTIVE_TOPIC_LIMIT = 48;
const ONLINE_STARTUP_BACKGROUND_SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const mountAttachModalEmojiPickerOverlay = (trigger: HTMLElement): void => {
  const attachModal = trigger.closest<HTMLDialogElement>(
    'dialog.attach-modal-container'
  );

  if (!attachModal) {
    return;
  }

  window.requestAnimationFrame(() => {
    const emojiPicker =
      trigger.querySelector<HTMLElement>('.emoji-picker') ||
      attachModal.querySelector<HTMLElement>(
        '.attach-modal__emoji-picker-overlay'
      );

    if (!emojiPicker || !emojiPicker.offsetParent) {
      return;
    }

    emojiPicker.classList.add('attach-modal__emoji-picker-overlay');

    if (emojiPicker.parentElement !== attachModal) {
      attachModal.appendChild(emojiPicker);
    }
  });
};

const handleAttachModalEmojiPickerClick = (event: MouseEvent): void => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const smileButton = target.closest<HTMLElement>(
    'dialog.attach-modal-container .smile-button'
  );

  if (smileButton) {
    mountAttachModalEmojiPickerOverlay(smileButton);
  }
};

const hasStartupNetwork = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine;

const getStartupSnapshotMaxAge = (): number | undefined =>
  hasStartupNetwork()
    ? ONLINE_STARTUP_BACKGROUND_SNAPSHOT_MAX_AGE_MS
    : undefined;

const getStartupSnapshotMessageImportOptions = () => {
  const activeTopicId = route.value.id || '';

  return {
    prioritizeMessageTopicIds: activeTopicId ? [activeTopicId] : undefined,
    maxMessageTopicImports: activeTopicId ? 1 : 0,
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
    requireRenderableContent: true
  });

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
  void waitForStartupPaint()
    .then(waitForStartupIdle)
    .then(task)
    .catch(error => {
      console.warn(
        `Не удалось выполнить отложенную задачу старта "${label}":`,
        error
      );
    });
};

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

const hydrateActiveCachedMessages = async (userId?: string): Promise<void> => {
  const activeTopicId = route.value.id || '';

  if (!activeTopicId) {
    return;
  }

  if (isMobile.value && hasStartupNetwork()) {
    await hydratePendingMessagesFromCache(
      activeTopicId,
      userId,
      MOBILE_CACHED_ACTIVE_TOPIC_LIMIT
    );
    return;
  }

  if (isMobile.value) {
    const preview = await hydrateMessagePreviewFromCache(
      activeTopicId,
      userId,
      MOBILE_CACHED_ACTIVE_TOPIC_LIMIT
    );
    if (preview.length) {
      runDeferredStartupTask('active topic history', async () => {
        if (getAuthUser()?.id !== userId || route.value.id !== activeTopicId)
          return;
        await hydrateMessagesFromCache(activeTopicId, userId, {
          visibleLimit: MOBILE_CACHED_ACTIVE_TOPIC_LIMIT
        });
      });
      return;
    }
  }

  await hydrateMessagesFromCache(activeTopicId, userId, {
    visibleLimit: isMobile.value ? MOBILE_CACHED_ACTIVE_TOPIC_LIMIT : undefined
  });
};

const hydrateCriticalCache = async (userId?: string): Promise<void> => {
  performance.mark('chat-startup:cache-start');
  const session = getChatAuthSession();
  const canDeferUsers =
    !!userId && !!session?.token && session.user?.id === userId;
  if (canDeferUsers && !getAuthUser()) setAuthUser(session.user!);
  const notification = notificationTopicRefreshRequest.value;
  if (
    !hasStartupNetwork() &&
    userId &&
    notification?.messageId &&
    notification.topicId === route.value.id
  ) {
    void loadNativeNotificationPreview(
      notification.topicId,
      notification.messageId,
      userId,
      getConfig().CHAT_API_DOMAIN
    )
      .then(messages =>
        hydrateNotificationMessagePreview(
          notification.topicId,
          notification.messageId!,
          messages,
          userId
        )
      )
      .catch(error =>
        console.warn('Не удалось восстановить сообщение уведомления:', error)
      );
  }
  const usersHydration = canDeferUsers ? null : hydrateUsersFromCache(userId);
  const topicsHydration = hydrateTopicsFromCache(userId).then(() => {
    performance.mark('chat-startup:topic-cache-ready');
  });
  const activeMessagesHydration = hydrateActiveCachedMessages(userId).then(
    () => {
      performance.mark('chat-startup:pending-cache-ready');
    }
  );

  await usersHydration;

  if (userId) {
    applyCachedAuthUser(userId);
  }

  await Promise.all([topicsHydration, activeMessagesHydration]);
  hydratedCacheUserId = userId;
  performance.mark('chat-startup:cache-ready');

  if (canDeferUsers) {
    runDeferredStartupTask('cached users', async () => {
      if (getAuthUser()?.id !== userId) return;
      await hydrateUsersFromCache(userId);
      performance.mark('chat-startup:users-cache-ready');
    });
  }
};

interface FreshChatContentState {
  usersRefreshed: boolean;
  topicsRefreshed: boolean;
}

const hydrateFreshChatContent = async (
  userId?: string,
  cacheReady?: Promise<void>
): Promise<FreshChatContentState> => {
  if (!hasStartupNetwork()) {
    return {
      usersRefreshed: false,
      topicsRefreshed: false
    };
  }

  if (hasPriorityMessageTopicRoute()) {
    return {
      usersRefreshed: false,
      topicsRefreshed: false
    };
  }

  const usersRefreshed = !getAuthUser();
  if (usersRefreshed) {
    await Promise.allSettled([fetchAuthUser(), fetchAllUsers()]);
    if (!getAuthUser() && userId) {
      applyCachedAuthUser(userId);
    }
  }

  const shouldDeferTopicsRefresh = !!getActiveChatTopicId();
  let topicsRefreshed = false;

  if (!shouldDeferTopicsRefresh) {
    await fetchAllTopics({
      cacheReady,
      deferMaintenanceUntil: waitForStartupPaint(),
      onNetworkApplied: () => {
        topicsRefreshed = true;
      }
    });
    performance.mark('chat-startup:topics-resolved', {
      detail: { isFresh: topicsRefreshed }
    });
  }

  hydratedCacheUserId = userId;
  return {
    usersRefreshed,
    topicsRefreshed
  };
};

const getActiveChatTopicId = (): string | null => {
  if (
    route.value.id &&
    (route.value.type === RouteTypes.DIALOGS ||
      route.value.type === RouteTypes.GROUP ||
      route.value.type === RouteTypes.CALL ||
      route.value.type === RouteTypes.FAVORITES)
  ) {
    return route.value.id;
  }

  return null;
};

const hasPriorityMessageTopicRoute = (): boolean =>
  Boolean(
    route.value.id &&
      (route.value.type === RouteTypes.DIALOGS ||
        route.value.type === RouteTypes.GROUP)
  );

let isAppInitializationComplete = false;
let isActiveTopicRenderReady = false;
let isStartupReadyScheduled = false;
let resolveStartupReady: (() => void) | null = null;
const startupReadyPromise = new Promise<void>(resolve => {
  resolveStartupReady = resolve;
});
let startupPaintPromise: Promise<void> | undefined;
const waitForStartupPaint = (): Promise<void> =>
  (startupPaintPromise ??= startupReadyPromise.then(
    () =>
      new Promise(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  ));

const releaseMessagePersistence = deferMessagePersistsUntil(
  waitForStartupPaint()
);
onUnmounted(releaseMessagePersistence);

const scheduleStartupReady = (): void => {
  const activeTopicId = getActiveChatTopicId();

  if (
    isStartupReadyScheduled ||
    !isAppInitializationComplete ||
    (activeTopicId && !isActiveTopicRenderReady)
  ) {
    return;
  }

  isStartupReadyScheduled = true;
  performance.mark('chat-startup:content-ready');
  void nextTick(() => {
    emit('ready');
    resolveStartupReady?.();
    resolveStartupReady = null;
  });
};

const handleRenderedTopicChange = (
  payload: IMessageRenderedTopicState
): void => {
  const activeTopicId = getActiveChatTopicId();

  isActiveTopicRenderReady =
    !activeTopicId ||
    (payload.routeTopicId === activeTopicId &&
      payload.isCurrent &&
      payload.isReady === true);

  scheduleStartupReady();
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
  document.removeEventListener(
    'click',
    handleAttachModalEmojiPickerClick,
    true
  );
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
  freshContentState: FreshChatContentState = {
    usersRefreshed: false,
    topicsRefreshed: false
  }
): void => {
  if (!freshContentState.usersRefreshed || !freshContentState.topicsRefreshed) {
    runDeferredStartupTask('online refresh', async () => {
      if (!freshContentState.usersRefreshed) {
        await Promise.allSettled([fetchAuthUser(), fetchAllUsers()]);

        if (!getAuthUser() && authUserId) {
          applyCachedAuthUser(authUserId);
        }
      }

      if (!freshContentState.topicsRefreshed) {
        await fetchAllTopics();
      }

      if (route.value.id) {
        void fetchPinnedMessagesForTopic(route.value.id, { maxAgeMs: 15_000 });

        if (route.value.type === RouteTypes.GROUP) {
          getGroupById(route.value.id);
        }
      }
    });
  }

  runDeferredStartupTask('group call restore', restoreInvitedGroupCallDeferred);
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
  let deferredStartupBackgroundSnapshotUserId: string | undefined;
  const prepareStartupBackgroundSnapshot = async (
    userId: string | undefined,
    source: string
  ): Promise<void> => {
    if (!userId || deferredStartupBackgroundSnapshotUserId === userId) {
      return;
    }

    deferredStartupBackgroundSnapshotUserId = userId;

    if (
      !hasStartupNetwork() &&
      route.value.id &&
      getMessagesByTopicId(route.value.id).length === 0
    ) {
      await importStartupBackgroundSnapshot(userId, `${source}-eager`);
      return;
    }

    scheduleStartupBackgroundSnapshotImport(userId, source);
  };

  let initialCacheHydration = Promise.resolve();
  if (initialUserId) {
    setCurrentUserId(initialUserId);
    initialCacheHydration = hydrateCriticalCache(initialUserId);
  }

  try {
    const storedAuthData = hasStoredChatSession
      ? {
          token: directAuthSession?.token || storedChatToken || '',
          user: directAuthSession?.user
        }
      : null;
    let usedBootstrapToken = false;
    const authData = shouldUseBootstrapToken
      ? await useAuth(bootstrapErpToken)
          .then(data => {
            usedBootstrapToken = true;
            return data;
          })
          .catch(error => {
            if (!tokenUrl && storedAuthData && !isAuthError(error)) {
              console.warn(
                'Сервер авторизации недоступен, открываем сохранённую сессию:',
                error
              );
              return storedAuthData;
            }
            throw error;
          })
      : storedAuthData || (await tryRefreshErpSession());
    if (!authData?.token) {
      throw new Error('Chat token is missing from auth response');
    }

    setAuthToken(authData.token);
    // Навигация из push уже подключена в main.ts. Регистрация токена и
    // запрос разрешения не должны занимать мост перед свежей историей.
    void waitForStartupPaint()
      .then(initTelemetryLocation)
      .then(initPushNotifications)
      .catch(error => {
        console.warn('Не удалось инициализировать push-уведомления:', error);
      });

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
    if (usedBootstrapToken) {
      clearBootstrapErpSession();
    }

    setCurrentUserId(authUserId || undefined);
    if (authData.user) setAuthUser(authData.user);

    const cacheReady = (async () => {
      await initialCacheHydration;
      if (authUserId !== hydratedCacheUserId) {
        await hydrateCriticalCache(authUserId || undefined);
      }
      await prepareStartupBackgroundSnapshot(
        authUserId || undefined,
        'post-auth-after-cache-hydration'
      );
    })();

    const chatInitialization = initializeChat({
      token: authData.token,
      apiUrl: config.CHAT_API_DOMAIN,
      wsUrl: config.CHAT_WS_DOMAIN,
      userId: authUserId || undefined,
      cacheReady
    });
    const notification = notificationTopicRefreshRequest.value;
    if (isMobile.value && notification?.topicId && notification.messageId) {
      prefetchNotificationHistory(notification.topicId, notification.messageId);
    }
    const freshContent = hydrateFreshChatContent(
      authUserId || undefined,
      cacheReady
    );
    await chatInitialization;
    const freshContentState = await freshContent;

    runDeferredOnlineStartup(authUserId || undefined, freshContentState);
  } catch (error) {
    await initialCacheHydration;
    console.error('Failed to initialize chat:', error);

    if (isMobile.value) {
      if (isAuthError(error)) {
        clearStoredErpToken();
        clearChatAuthSession();
        clearBootstrapErpSession();
      }

      if (initialUserId && hydratedCacheUserId !== initialUserId) {
        await hydrateCriticalCache(initialUserId);
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

// Быстрый кеш заполняется синхронно до первого рендера дочернего списка.
onBeforeMount(async () => {
  document.addEventListener('click', handleAttachModalEmojiPickerClick, true);
  initFocusTracking();

  try {
    await runAppInitialization();
  } finally {
    isAppInitializationComplete = true;
    scheduleStartupReady();
  }
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
