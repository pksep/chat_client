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
import { mockUsers } from './test/mock/users';
import { getAllNotificationCount } from './services/useConversions';
import { fetchAuthUser, getAuthUser, useAuth } from './composables/useAuth';
import { useRegister } from './composables/useLogin';

const props = defineProps<IChatContainerProps>();
const emits = defineEmits<IChatContainerEmits>();

const allNotificationCount = computed(() => getAllNotificationCount());

onMounted(async () => {
  try {
    if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
      await Promise.all(
        mockUsers.map(user => {
          return useRegister({ users: [user] });
        })
      );
    }

    // const registerResponse = await useRegister({
    //   users: [
    //     {
    //       userID: props.user.id,
    //       nickname: props.user.nickname,
    //       faceURL: props.user.avatarUrl ?? '/avatar.png',
    //       ex: props.user.ex
    //     }
    //   ]
    // });

    // if (registerResponse.errMsg === 'RegisteredAlreadyError') {
    //   const platformID = getOrGeneratePlatformId();
    //   const loginResponse = await useLogin({
    //     platformID,
    //     userID: props.user.id
    //   });

    //   if (!loginResponse?.data?.token) {
    //     throw new Error('Failed to obtain login token');
    //   }
    // }

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

    await fetchAuthUser();

    console.log(getAuthUser());

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
