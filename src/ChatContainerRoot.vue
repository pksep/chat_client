<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';

import type { IChatContainerProps } from './components/interfaces/interfaces';
import { initializeChat, setCurrentUserId } from './services/useChat';
import { restoreInvitedGroupCallFromUrl } from './services/useCalls';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
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
import {
  fetchMessagesForTopic,
  fetchPinnedMessagesForTopic
} from './services/useMessages';
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
import { hydrateMessagesFromCache } from './services/useMessages';
import { useShareSelection } from './composables/useShareSelection';

const props = defineProps<IChatContainerProps>();

const { fetchAllTopics, getTopicList } = useTopics();
const { state: isMobile } = useResizeState(MAX_W_MD);
const route = useUrlWatcher();
const isChatReady = ref(false);
let removeAppVisibilityListener: (() => void) | null = null;
const { hasPendingShareBatches, isShareSelectionActive, startShareSelection } =
  useShareSelection();

const hydrateCachedMessagesForKnownTopics = async (
  userId?: string
): Promise<void> => {
  const topicIds = Array.from(
    new Set(
      [
        ...getTopicList()
          .map(topic => topic.id)
          .filter(Boolean),
        route.value.id || ''
      ].filter(Boolean)
    )
  );

  if (topicIds.length === 0) {
    return;
  }

  const activeTopicId = route.value.id || '';

  if (activeTopicId) {
    await hydrateMessagesFromCache(activeTopicId, userId);
  }

  const backgroundTopicIds = topicIds.filter(
    topicId => topicId !== activeTopicId
  );

  if (backgroundTopicIds.length === 0) {
    return;
  }

  await Promise.allSettled(
    backgroundTopicIds.map(topicId => hydrateMessagesFromCache(topicId, userId))
  );
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

const runAppInitialization = async () => {
  const url = new URL(window.location.href);
  const tokenUrl = url.searchParams.get('token')?.split('?token')[0];

  const storedChatToken = getStoredChatAccessToken();
  const bootstrapErpToken = tokenUrl || getStoredBootstrapErpAccessToken();
  const directAuthSession = getChatAuthSession();
  const config = getConfig();
  const persistSession = !!tokenUrl || isStoredChatSessionPersistent();
  const shouldUseBootstrapToken = !!bootstrapErpToken;
  const initialUserId =
    directAuthSession?.user?.id || getStoredSessionUserId() || '';

  if (initialUserId) {
    setCurrentUserId(initialUserId);

    await hydrateUsersFromCache(initialUserId);
    applyCachedAuthUser(initialUserId);
    await hydrateTopicsFromCache(initialUserId);
    await hydrateCachedMessagesForKnownTopics(initialUserId);
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
    clearBootstrapErpSession();

    setCurrentUserId(authUserId || undefined);
    if (authData.user) setAuthUser(authData.user);

    await hydrateUsersFromCache(authUserId || undefined);
    applyCachedAuthUser(authUserId);
    await hydrateTopicsFromCache(authUserId || undefined);
    await hydrateCachedMessagesForKnownTopics(authUserId || undefined);

    await initializeChat({
      token: authData.token,
      apiUrl: config.CHAT_API_DOMAIN,
      wsUrl: config.CHAT_WS_DOMAIN,
      userId: authUserId || undefined
    });

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    if (!getAuthUser() && authUserId) {
      applyCachedAuthUser(authUserId);
    }

    await restoreInvitedGroupCallFromUrl();

    await fetchAllTopics();
    void hydrateCachedMessagesForKnownTopics(authUserId || undefined);

    if (route.value.id) {
      await fetchPinnedMessagesForTopic(route.value.id);
      await fetchMessagesForTopic(route.value.id);

      if (route.value.type === RouteTypes.GROUP) {
        getGroupById(route.value.id);
      }
    }

    await initPushNotifications();
    isChatReady.value = true;
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    if (isMobile.value) {
      clearStoredErpToken();
      clearChatAuthSession();
      clearBootstrapErpSession();
      return;
    }
  } finally {
    if (!isMobile.value) {
      isChatReady.value = true;
    }

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
  () => [hasPendingShareBatches.value, isShareSelectionActive.value],
  ([hasPendingShares, isShareActive]) => {
    if (hasPendingShares && !isShareActive) {
      startShareSelection();
    }
  },
  { immediate: true }
);
</script>
