<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';
import { IMSDK, getOrGeneratePlatformId, setupOpenIM } from './services/useOpenIM';
import { useLogin, useRegister, getAuthToken } from './composables/useLogin';
import {
  clearAllData,
  saveUserIdToSession,
  hasUserIdInSession
} from './services/useMastra';
import { mockUsers } from './test/mock/users';

const props = defineProps<IChatContainerProps>();

onMounted(async () => {
  try {
    if (!hasUserIdInSession(props.user.id)) {
      clearAllData();
      saveUserIdToSession(props.user.id);
    }

    if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
      await useRegister({ users: mockUsers });
    }

    const registerResponse = await useRegister({
      users: [
        {
          userID: props.user.id,
          nickname: props.user.nickname,
          faceURL: props.user.avatarUrl ?? 'https://example.org/avatar.png'
        }
      ]
    });

    if (registerResponse.errMsg === 'RegisteredAlreadyError') {
      const platformID = getOrGeneratePlatformId();
      const loginResponse = await useLogin({
        platformID,
        userID: props.user.id
      });

      if (!loginResponse?.data?.token) {
        throw new Error('Failed to obtain login token');
      }
    }

    const authToken = getAuthToken();
    if (!authToken) {
      throw new Error('No auth token found');
    }

    const apiAddr = import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'http://localhost:10002';

    const wsAddr = import.meta.env.VITE_OPENIM_API_DOMAIN
      ? `wss://${import.meta.env.VITE_OPENIM_API_DOMAIN}`
      : 'ws://localhost:10023';

    await IMSDK.login({
      platformID: getOrGeneratePlatformId(),
      userID: props.user.id,
      token: authToken,
      apiAddr,
      wsAddr
    });

    setupOpenIM();
  } catch (error) {
    console.error('Failed to initialize chat:', error);
    throw error;
  }
});
</script>

<style>
@import './assets/chat-container.css';
</style>
