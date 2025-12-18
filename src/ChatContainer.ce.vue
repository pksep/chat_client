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
import { getConfig, setConfig } from './services/useConfig';

const emits = defineEmits<IChatContainerEmits>();

const props = defineProps<IChatContainerProps>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  setConfig(props.config);

  try {
    if (!props.token) {
      throw new Error('No auth token found');
    }

    const authData = await useAuth(props.token);

    if (!hasUserIdInSession(authData.UserID)) {
      clearAllData();
      saveUserIdToSession(authData.UserID);
    }

    const config = getConfig();

    const apiAddr = config.CHAT_OPENIM_API_DOMAIN;
    const wsAddr = config.CHAT_OPENIM_WS_DOMAIN;

    await IMSDK.login({
      platformID: authData.PlatformID,
      userID: authData.UserID,
      token: authData.token,
      apiAddr,
      wsAddr
    });

    sessionStorage.setItem(
      'openim_user',
      JSON.stringify({
        platformID: authData.PlatformID,
        userID: authData.UserID,
        token: authData.token,
        apiAddr,
        wsAddr
      })
    );

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    setupOpenIM();

    markSDKReady();
  } catch (error) {
    console.error('Failed to initialize chat:', error);
    throw error;
  }
});

onUnmounted(async () => {
  window.location.reload(); // НЕ УДАЛИТЬ!!! это для отключении сокета в опеним
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
