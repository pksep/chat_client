<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
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
  getChatAuthSession,
  getStoredBootstrapErpAccessToken,
  getStoredChatAccessToken,
  isStoredChatSessionPersistent,
  saveChatAuthSession,
  setAuthUser,
  tryRefreshErpSession,
  useAuth
} from './composables/useAuth';
import { fetchAllUsers, getUserById } from './composables/useUsers';
import { getConfig } from './services/useConfig';
import { useTopics } from './composables/useTopics';
import { getGroupById } from './composables/useGroup';
import { useUrlWatcher } from './composables/navigation';
import {
  fetchMessagesForTopic,
  fetchPinnedMessagesForTopic
} from './services/useMessages';
import { initPushNotifications } from './services/usePushNotifications';
import { useResizeState } from './composables/useResizeState';
import { MAX_W_MD } from './utils/constants';
import { RouteTypes } from './composables/navigation/useUrlRouting';

const props = defineProps<IChatContainerProps>();

const { fetchAllTopics } = useTopics();
const { state: isMobile } = useResizeState(MAX_W_MD);
const route = useUrlWatcher();

const sendFocusStateToSW = (focused: boolean) => {
  if (!navigator.serviceWorker?.controller) return;

  navigator.serviceWorker.controller.postMessage({
    type: 'APP_FOCUS',
    focused
  });
};

const updateFocusState = () => {
  const focused = !document.hidden && document.hasFocus();
  sendFocusStateToSW(focused);
};

const initFocusTracking = () => {
  navigator.serviceWorker?.ready.then(updateFocusState);

  window.addEventListener('focus', updateFocusState);
  window.addEventListener('blur', updateFocusState);
  document.addEventListener('visibilitychange', updateFocusState);
};

const clearStoredErpToken = () => {
  clearErpAuthSession();
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

  try {
    const authData = shouldUseBootstrapToken
      ? await useAuth(bootstrapErpToken).catch(async error => {
          const refreshedAuth = await tryRefreshErpSession();

          if (!refreshedAuth?.token) {
            throw error;
          }

          return refreshedAuth;
        })
      : directAuthSession?.token || storedChatToken
        ? {
            token: directAuthSession?.token || storedChatToken || '',
            user: directAuthSession?.user
          }
        : await tryRefreshErpSession();
    if (!authData?.token) {
      throw new Error('Chat token is missing from auth response');
    }

    const authUserId = authData.user?.id || '';

    if (authUserId && !hasUserIdInSession(authUserId)) {
      saveUserIdToSession(authUserId);
    }

    saveChatAuthSession(
      {
        token: authData.token,
        refreshToken: authData.refreshToken ?? directAuthSession?.refreshToken,
        user: authData.user
      },
      persistSession
    );
    clearBootstrapErpSession();

    await initializeChat({
      token: authData.token,
      apiUrl: config.CHAT_API_DOMAIN,
      wsUrl: config.CHAT_WS_DOMAIN,
      userId: authUserId || undefined
    });

    setCurrentUserId(authUserId || undefined);
    if (authData.user) setAuthUser(authData.user);

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    if (!authData.user && authUserId) {
      const fallbackUser = getUserById(authUserId);
      if (fallbackUser) {
        setAuthUser({
          ...fallbackUser,
          id: fallbackUser.id || '',
          nickname: fallbackUser.nickname || fallbackUser.id || '',
          initials: fallbackUser.initials || '',
          avatarUrl: fallbackUser.avatarUrl || '',
          lastOnline: new Date(),
          createdAt: fallbackUser.createdAt || new Date(),
          updatedAt: fallbackUser.updatedAt || new Date(),
          deletedAt: fallbackUser.deletedAt || null
        });
      }
    }

    await restoreInvitedGroupCallFromUrl();

    await fetchAllTopics();

    if (route.value.id) {
      await fetchPinnedMessagesForTopic(route.value.id);
      await fetchMessagesForTopic(route.value.id);

      if (route.value.type === RouteTypes.GROUP) {
        getGroupById(route.value.id);
      }
    }

    await initPushNotifications();
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    if (isMobile.value) {
      clearStoredErpToken();
      clearChatAuthSession();
      clearBootstrapErpSession();
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
</script>
