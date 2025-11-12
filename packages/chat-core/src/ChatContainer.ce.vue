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
import { mockUsers } from './test/mock/users';

const props = defineProps<IChatContainerProps>();

onMounted(async () => {
  if (!hasUserIdInSession(props.user.id)) {
    clearAllData();
    saveUserIdToSession(props.user.id);
  }

  const account = await useRegister({
    users: [
      {
        userID: props.user.id,
        nickname: props.user.nickname,
        faceURL: props.user.avatarUrl ?? 'https://example.org/avatar.png'
      }
    ]
  });

  if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
    await useRegister({ users: mockUsers });
  }

  await IMSDK.login({
    platformID: getOrGeneratePlatformId(),
    userID: account.userID,
    token: account.chatToken,
    apiAddr: import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'http://localhost:10002',
    wsAddr: import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `wss://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'ws://localhost:10023'
  });
});
</script>

<style>
@import './assets/chat-container.css';
</style>
