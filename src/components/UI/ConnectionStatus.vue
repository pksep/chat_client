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

const props = defineProps<{ refreshFailed?: boolean }>();
type ConnectionStatus = 'offline' | 'waiting' | 'online' | 'error';

const statusLabels: Record<ConnectionStatus, string> = {
  offline: 'Нет сети',
  waiting: 'Ожидание сети',
  online: 'В сети',
  error: 'Не удалось обновить'
};

const connectionStatus = computed<ConnectionStatus>(() => {
  if (!getHasBrowserNetwork()) {
    return 'offline';
  }
  if (props.refreshFailed) return 'error';

  if (getIsWebsocketConnecting() || !getHasWebsocketConnection()) {
    return 'waiting';
  }

  return 'online';
});

const statusLabel = computed(() => statusLabels[connectionStatus.value]);
</script>
