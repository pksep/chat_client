<template>
  <div class="connection-status">
    <FileIcon is-me-sender background-color="transparent" />
    <span>{{ statusLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import FileIcon from './FileIcon.vue';
import {
  getHasBrowserNetwork,
  getHasWebsocketConnection,
  getIsWebsocketConnecting
} from '../../services/useChat';

const statusLabel = computed(() => {
  if (!getHasBrowserNetwork()) {
    return 'Нет сети';
  }

  if (getIsWebsocketConnecting() || !getHasWebsocketConnection()) {
    return 'Ожидание сети';
  }

  return 'В сети';
});
</script>
