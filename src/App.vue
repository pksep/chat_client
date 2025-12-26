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
import { computed, onMounted, ref, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type {
  IChatContainerEmits,
  IChatContainerProps
} from './components/interfaces/interfaces';
import { IMSDK, setupOpenIM } from './services/useOpenIM';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import {
  getAllNotificationCount,
  markSDKReady,
  fetchConversationList
} from './services/useConversions';
import { fetchAuthUser, useAuth } from './composables/useAuth';
import { fetchAllUsers } from './composables/useUsers';
import { IChatContainerConfig } from './components/interfaces/interfaces';
import { setConfig, getConfig } from './services/useConfig';
import { useUnreadMessagePolling } from './composables/useUnreadMessagePolling';

const emits = defineEmits<IChatContainerEmits>();

const props = withDefaults(defineProps<IChatContainerProps>(), {
  config: () => ({
    CHAT_AUTH_API: import.meta.env.VITE_AUTH_API,
    CHAT_MASTRA_URL: import.meta.env.VITE_MASTRA_URL,
    CHAT_OPENIM_API_DOMAIN: import.meta.env.VITE_OPENIM_API_DOMAIN,
    CHAT_OPENIM_WS_DOMAIN: import.meta.env.VITE_OPENIM_WS_DOMAIN,
    CHAT_ERP_URL: import.meta.env.VITE_ERP_URL
  })
});

const allNotificationCount = computed(() => getAllNotificationCount());

const openChatContainerShow = ref(true);

// Set config on component initialization
setConfig(props.config);

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token')?.split('?token')[0];
  const REDIRECT_KEY = 'chat_redirect_attempts';
  const MAX_REDIRECTS = 2;

  if (token) {
    localStorage.setItem('erp_token', token);
  }

  const localToken = localStorage.getItem('erp_token');
  const config = getConfig();

  try {
    const authData = await useAuth(token || localToken);

    if (!hasUserIdInSession(authData.UserID)) {
      saveUserIdToSession(authData.UserID);
    }

    const apiAddr = config.CHAT_OPENIM_API_DOMAIN;
    const wsAddr = config.CHAT_OPENIM_WS_DOMAIN;

    await IMSDK.login({
      platformID: authData.PlatformID,
      userID: authData.UserID,
      token: authData.token,
      apiAddr,
      wsAddr
    });

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    setupOpenIM();

    await fetchConversationList();

    markSDKReady();

    useUnreadMessagePolling(30000); // Возвращаем исходный интервал опроса 30 секунд
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    const attempts = Number(localStorage.getItem(REDIRECT_KEY) || 0) + 1;
    localStorage.setItem(REDIRECT_KEY, String(attempts));

    if (attempts >= MAX_REDIRECTS) {
      localStorage.removeItem(REDIRECT_KEY);
      console.error('Redirect blocked: too many attempts');
      openChatContainerShow.value = false;
      return;
    }

    window.location.href =
      config.CHAT_ERP_URL +
      '?redirect=' +
      encodeURIComponent(window.location.href);
  } finally {
    url.searchParams.delete('token');
    window.history.replaceState({}, document.title, url.toString());
  }
});

watch(
  () => allNotificationCount.value,
  () => {
    emits('unmount-notification-count', allNotificationCount.value);
  }
);
</script>

<style>
@import './assets/chat-container.css';
</style>
