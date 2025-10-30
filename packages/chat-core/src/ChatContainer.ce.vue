<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';
import { IMSDK, getOrGeneratePlatformId } from './services/useOpenIM';
import {
  clearAllData,
  saveUserIdToSession,
  hasUserIdInSession
} from './services/useMastra';

const props = defineProps<IChatContainerProps>();

onMounted(async () => {
  if (!hasUserIdInSession(props.user.id)) {
    clearAllData();
    saveUserIdToSession(props.user.id);
  }

  await IMSDK.login({
    platformID: getOrGeneratePlatformId(),
    userID: props.user?.id,
    token: props.token,
    apiAddr: `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`,
    wsAddr: `wss://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
  });
});
</script>

<style>
@import './assets/chat-container.css';
</style>
