<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';
import {
  clearAllData,
  saveUserIdToSession,
  hasUserIdInSession
} from './services/useMastra';

const props = defineProps<IChatContainerProps>();

onMounted(() => {
  if (!hasUserIdInSession(props.user.id)) {
    clearAllData();
    saveUserIdToSession(props.user.id);
  }
});
</script>

<style>
@import './assets/chat-container.css';
</style>
