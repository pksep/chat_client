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
import {
  IMSDK,
  getOrGeneratePlatformId,
  setupOpenIM
} from './services/useOpenIM';
import { useLogin, useRegister, getAuthToken } from './composables/useLogin';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import { clearAllData } from './services/useChatDb';
import { mockUsers } from './test/mock/users';
import {
  getAllNotificationCount,
  markSDKReady
} from './services/useConversions';

const props = withDefaults(defineProps<IChatContainerProps>(), {
  token: null
});

const emits = defineEmits<IChatContainerEmits>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  try {
    if (!hasUserIdInSession(props.user.id)) {
      clearAllData();
      saveUserIdToSession(props.user.id);
    }

    if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
      await Promise.all(
        mockUsers.map(user => {
          return useRegister({ users: [user] });
        })
      );
    }

    const registerResponse = await useRegister({
      users: [
        {
          userID: props.user.id,
          nickname: props.user.nickname,
          faceURL: props.user.avatarUrl ?? '/avatar.png',
          ex: props.user.ex
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

    const wsAddr = import.meta.env.VITE_OPENIM_WS_DOMAIN
      ? `wss://${import.meta.env.VITE_OPENIM_WS_DOMAIN}`
      : 'ws://localhost:10023';

    await IMSDK.login({
      platformID: getOrGeneratePlatformId(),
      userID: props.user.id,
      token: authToken,
      apiAddr,
      wsAddr
    });

    setupOpenIM();

    markSDKReady();
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
