<template>
  <ChatContainer v-bind="props" />
</template>

<script setup lang="ts">
import ChatContainer from './components/ChatContainer.vue';
import type { IChatContainerProps } from './components/interfaces/interfaces';

const props = defineProps<IChatContainerProps>();
</script>

<style>
@import './assets/chat-container.css';
</style>
