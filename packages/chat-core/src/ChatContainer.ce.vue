<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';
import { IMSDK, getOrGeneratePlatformId } from './services/useOpenIM';
import { useRegister } from './composables/useLogin';
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

  const account = await useRegister({
    user: {
      userID: props.user.id,
      nickname: props.user.nickname,
      faceURL: props.user.avatarUrl ?? 'https://example.org/avatar.png'
    }
  });

  await IMSDK.login({
    platformID: getOrGeneratePlatformId(),
    userID: account.userID,
    token: account.chatToken,
    apiAddr: `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`,
    wsAddr: `wss://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
  });
});
</script>

<style>
@import './assets/chat-container.css';
</style>
