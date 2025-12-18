<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type {
  IChatContainerEmits,
  IChatContainerProps
} from './components/interfaces/interfaces';
import { IMSDK, setupOpenIM } from './services/useOpenIM';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import { clearAllData } from './services/useChatDb';
import {
  getAllNotificationCount,
  markSDKReady
} from './services/useConversions';
import { fetchAuthUser, useAuth } from './composables/useAuth';
import { fetchAllUsers } from './composables/useUsers';
import { getConfig } from './services/useConfig';

const emits = defineEmits<IChatContainerEmits>();

const props = defineProps<IChatContainerProps>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');

  try {
    const config = getConfig();

    if (!token) {
      window.location.href =
        config.CHAT_ERP_URL +
        '?redirect=' +
        encodeURIComponent(window.location.href);
    }

    const authData = await useAuth(token);

    if (!hasUserIdInSession(authData.UserID)) {
      clearAllData();
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

    markSDKReady();
  } catch (error) {
    console.error('Failed to initialize chat:', error);
    throw error;
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
