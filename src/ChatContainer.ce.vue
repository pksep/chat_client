<template>
  <ChatContainer v-if="openChatContainerShow" v-bind="props" />
  <img
    v-else
    style="position: fixed; width: 100dvw; height: 100dvh; object-fit: contain"
    src="/images/deploy-bg.svg"
    alt="deploy-bg"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type {
  IChatContainerEmits,
  IChatContainerProps
} from './components/interfaces/interfaces';
import { initializeChat, setCurrentUserId } from './services/useChat';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import {
  getAllNotificationCount,
  markSDKReady
} from './services/useConversions';
import { fetchAuthUser, setAuthUser, useAuth } from './composables/useAuth';
import { fetchAllUsers, getUserById } from './composables/useUsers';
import { getConfig } from './services/useConfig';
import { useUnreadMessagePolling } from './composables/useUnreadMessagePolling';
import { fetchAllTopics } from './composables/useTopics';
import { fetchAllGroups } from './services/useGroup';

const emits = defineEmits<IChatContainerEmits>();

const props = defineProps<IChatContainerProps>();

const allNotificationCount = computed(() => getAllNotificationCount());

const openChatContainerShow = ref(true);

// Initialize polling composable synchronously in setup to properly register lifecycle hooks.
// Polling will be started manually after chat initialization is complete.
const { startPolling } = useUnreadMessagePolling(30000, false);

onMounted(async () => {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token')?.split('?token')[0];
  const REDIRECT_KEY = 'chat_redirect_attempts';
  const MAX_REDIRECTS = 2;

  if (token) {
    localStorage.setItem('erp_token', token);
  }

  const localToken = localStorage.getItem('erp_token');
  const config = getConfig();

  try {
    const authData = await useAuth(token || localToken);

    const authUserId = authData.user?.id || '';
    if (authUserId && !hasUserIdInSession(authUserId)) {
      saveUserIdToSession(authUserId);
    }

    if (!authData.token) {
      throw new Error('Chat token is missing from auth response');
    }

    const apiAddr = config.CHAT_API_DOMAIN;
    const wsAddr = config.CHAT_WS_DOMAIN;

    if (!apiAddr || !wsAddr) {
      throw new Error('Chat API/WS URLs are not configured');
    }

    const s3Config = config.CHAT_S3_BUCKET_NAME
      ? {
          bucketName: config.CHAT_S3_BUCKET_NAME,
          region: config.CHAT_S3_REGION || '',
          accessKeyId: config.CHAT_S3_ACCESS_KEY_ID || '',
          secretAccessKey: config.CHAT_S3_SECRET_ACCESS_KEY || '',
          endpoint: config.CHAT_S3_ENDPOINT
        }
      : undefined;

    await initializeChat({
      token: authData.token,
      apiUrl: apiAddr,
      wsUrl: wsAddr,
      userId: authUserId || undefined,
      s3Config
    });

    setCurrentUserId(authUserId || undefined);
    if (authData.user) {
      setAuthUser(authData.user);
    }

    await Promise.all([fetchAuthUser(), fetchAllUsers()]);

    if (!authData.user && authUserId) {
      const fallbackUser = getUserById(authUserId);
      if (fallbackUser) {
        setAuthUser({
          ...fallbackUser,
          id: fallbackUser.id || '',
          initials: fallbackUser.initials || fallbackUser.initial || '',
          nickname: fallbackUser.nickname || fallbackUser.id || '',
          avatarUrl: fallbackUser.avatarUrl || '',
          lastOnline: new Date(),
          createdAt: fallbackUser.createdAt || new Date(),
          updatedAt: fallbackUser.updatedAt || new Date(),
          deletedAt: fallbackUser.deletedAt || null
        });
      }
    }

    await fetchAllTopics();
    await fetchAllGroups();

    markSDKReady();

    // Start polling after initialization is complete
    startPolling();
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    const attempts = Number(localStorage.getItem(REDIRECT_KEY) || 0) + 1;
    localStorage.setItem(REDIRECT_KEY, String(attempts));

    if (attempts >= MAX_REDIRECTS) {
      localStorage.removeItem(REDIRECT_KEY);
      console.error('Redirect blocked: too many attempts');
      openChatContainerShow.value = false;
      return;
    }

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
