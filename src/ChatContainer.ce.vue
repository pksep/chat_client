<template>
  <MobileAuth v-if="showMobileAuth" @auth-success="handleMobileAuthSuccess" />

  <ChatContainer v-else-if="openChatContainerShow" v-bind="props" />

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
import MobileAuth from './components/Mobile/MobileAuth.vue';

import type {
  IChatContainerEmits,
  IChatContainerProps
} from './components/interfaces/interfaces';
import { initializeChat, setCurrentUserId } from './services/useChat';
import { saveUserIdToSession, hasUserIdInSession } from './services/useMastra';
import { getAllNotificationCount } from './services/useConversions';
import { fetchAuthUser, setAuthUser, useAuth } from './composables/useAuth';
import { fetchAllUsers, getUserById } from './composables/useUsers';
import { getConfig } from './services/useConfig';
import { useUnreadMessagePolling } from './composables/useUnreadMessagePolling';
import { useTopics } from './composables/useTopics';
import { useGroup } from './composables/useGroup';
import { useUrlWatcher } from './composables/navigation';
import { fetchMessagesForTopic } from './services/useMessages';
import { initPushNotifications } from './services/usePushNotifications';

const emits = defineEmits<IChatContainerEmits>();
const props = defineProps<IChatContainerProps>();

const allNotificationCount = computed(() => getAllNotificationCount());
const openChatContainerShow = ref(true);
const showMobileAuth = ref(false);

const { fetchAllGroups } = useGroup();
const { fetchAllTopics } = useTopics();

const { startPolling } = useUnreadMessagePolling(30000, false);

const route = useUrlWatcher();

const handleMobileAuthSuccess = (token: string) => {
  if (token) {
    localStorage.setItem('erp_token', token);
    showMobileAuth.value = false;
    runAppInitialization();
  }
};

const runAppInitialization = async () => {
  const url = new URL(window.location.href);
  const tokenUrl = url.searchParams.get('token')?.split('?token')[0];
  const REDIRECT_KEY = 'chat_redirect_attempts';
  const MAX_REDIRECTS = 2;

  if (tokenUrl) {
    localStorage.setItem('erp_token', tokenUrl);
  }

  const localToken = localStorage.getItem('erp_token');
  const config = getConfig();

  try {
    const authData = await useAuth(tokenUrl || localToken);
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

    await initializeChat({
      token: authData.token,
      apiUrl: apiAddr,
      wsUrl: wsAddr,
      userId: authUserId || undefined
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
          initials: fallbackUser.initials || '',
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
    if (route.value.id) {
      await fetchMessagesForTopic(route.value.id);
    }

    startPolling();

    // В этот момент у нас точно есть токен, User ID и приложение готово к работе.
    await initPushNotifications();

    openChatContainerShow.value = true;
  } catch (error) {
    console.error('Failed to initialize chat:', error);

    // Если ошибка инициализации произошла на мобилке (например, токен протух)
    // Мы сбрасываем токен и снова показываем QR сканер
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      localStorage.removeItem('erp_token');
      showMobileAuth.value = true;
      openChatContainerShow.value = false;
      return;
    }

    // Логика редиректа для десктопа
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
    if (tokenUrl) {
      url.searchParams.delete('token');
      window.history.replaceState({}, document.title, url.toString());
    }
  }
};

onMounted(async () => {
  const isMobile = window.innerWidth <= 768;
  const hasLocalToken = !!localStorage.getItem('erp_token');
  const hasUrlToken = window.location.href.includes('token=');

  // Если мы на мобилке И у нас нет никакого токена (ни в URL, ни в памяти)
  if (isMobile && !hasLocalToken && !hasUrlToken) {
    showMobileAuth.value = true;
    openChatContainerShow.value = false;
  } else {
    await runAppInitialization();
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
