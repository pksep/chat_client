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
import {
  clearAllData,
  saveUserIdToSession,
  hasUserIdInSession
} from './services/useMastra';
import { getAllNotificationCount } from './services/useConversions';
import { fetchAuthUser, useAuth } from './composables/useAuth';
import { fetchAllUsers } from './composables/useUsers';

const props = defineProps<IChatContainerProps>();
const emits = defineEmits<IChatContainerEmits>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  try {
    if (!props.token) {
      throw new Error('No auth token found');
    }

    const authData = await useAuth(props.token);

    if (!hasUserIdInSession(authData.UserID)) {
      clearAllData();
      saveUserIdToSession(authData.UserID);
    }

    const apiAddr = import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'http://localhost:10002';

    const wsAddr = import.meta.env.VITE_OPENIM_WS_DOMAIN
      ? `wss://${import.meta.env.VITE_OPENIM_WS_DOMAIN}`
      : 'ws://localhost:10023';

    await IMSDK.login({
      platformID: authData.PlatformID,
      userID: authData.UserID,
      token: authData.token,
      apiAddr,
      wsAddr
    });

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    setupOpenIM();
  } catch (error) {
    console.error('Failed to initialize chat:', error);
    throw error;
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
