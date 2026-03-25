<template>
  <ChatContainer v-if="openChatContainerShow" v-bind="props" />

  <img
    v-else
    style="position: fixed; width: 100dvw; height: 100dvh; object-fit: contain"
    src="/images/deploy-bg.svg"
    alt="deploy-bg"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ChatContainer from './components/ChatContainer.vue';

import type { IChatContainerProps } from './components/interfaces/interfaces';
import { initializeChat, setCurrentUserId } from './services/useChat';
import { restoreInvitedGroupCallFromUrl } from './services/useCalls';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import {
  fetchAuthUser,
  setAuthUser,
  useAuth,
  getChatAuthSession,
  clearChatAuthSession
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

const openChatContainerShow = ref(true);

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

const getStoredErpToken = () =>
  localStorage.getItem('erp_token') || sessionStorage.getItem('erp_token');

const clearStoredErpToken = () => {
  localStorage.removeItem('erp_token');
  sessionStorage.removeItem('erp_token');
};

const runAppInitialization = async () => {
  const url = new URL(window.location.href);
  const tokenUrl = url.searchParams.get('token')?.split('?token')[0];

  if (tokenUrl) {
    localStorage.setItem('erp_token', tokenUrl);
  }

  const localToken = getStoredErpToken();
  const directAuthSession = getChatAuthSession();
  const config = getConfig();

  try {
    const authData =
      tokenUrl || localToken
        ? await useAuth(tokenUrl || localToken)
        : directAuthSession;
    const authUserId = authData.user?.id || '';

    if (authUserId && !hasUserIdInSession(authUserId)) {
      saveUserIdToSession(authUserId);
    }

    if (!authData.token) {
      throw new Error('Chat token is missing from auth response');
    }

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

    openChatContainerShow.value = true;
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    if (isMobile.value) {
      clearStoredErpToken();
      clearChatAuthSession();
      openChatContainerShow.value = false;
      return;
    }
    openChatContainerShow.value = false;
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

<style>
@import './assets/chat-container.css';
</style>
