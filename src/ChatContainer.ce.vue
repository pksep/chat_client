<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
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
import { getConfig } from './services/useConfig';
import { useUnreadMessagePolling } from './composables/useUnreadMessagePolling';

const emits = defineEmits<IChatContainerEmits>();

const props = defineProps<IChatContainerProps>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');

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

    // Start polling for unread messages to ensure updates even if WebSocket events fail
    useUnreadMessagePolling(30000); // Poll every 30 seconds
  } catch (error) {
    console.error('Failed to initialize chat:', error);

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
