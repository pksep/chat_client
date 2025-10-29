<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';
import { IMSDK } from './services/useOpenIM';

const props = defineProps<IChatContainerProps>();

await IMSDK.login({
  platformID: 1,
  userID: props.user?.id,
  apiAddr: `https://${import.meta.env.VITE_OPENIM_API_DOMAIN}`,
  wsAddr: `wss://${import.meta.env.VITE_OPENIM_API_DOMAIN}`,
  token: import.meta.env.VITE_OPENIM_TOKEN
});
</script>

<style>
@import './assets/chat-container.css';
</style>
