<template>
  <div class="connection-status">
    <FileIcon is-me-sender background-color="transparent" />
    <span>{{ statusLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import FileIcon from './FileIcon.vue';
import {
  getHasBrowserNetwork,
  getHasWebsocketConnection,
  getIsWebsocketConnecting
} from '../../services/useChat';

type ConnectionStatus = 'offline' | 'waiting' | 'online';

const WAITING_STATUS_DELAY = 1500;
const statusLabels: Record<ConnectionStatus, string> = {
  offline: 'Нет сети',
  waiting: 'Ожидание сети',
  online: 'В сети'
};

const connectionStatus = computed<ConnectionStatus>(() => {
  if (!getHasBrowserNetwork()) {
    return 'offline';
  }

  if (getIsWebsocketConnecting() || !getHasWebsocketConnection()) {
    return 'waiting';
  }

  return 'online';
});

const displayedStatus = ref<ConnectionStatus>(connectionStatus.value);
const statusLabel = computed(() => statusLabels[displayedStatus.value]);
let waitingStatusTimer: ReturnType<typeof setTimeout> | null = null;

const clearWaitingStatusTimer = () => {
  if (!waitingStatusTimer) {
    return;
  }

  clearTimeout(waitingStatusTimer);
  waitingStatusTimer = null;
};

watch(connectionStatus, nextStatus => {
  clearWaitingStatusTimer();

  if (displayedStatus.value !== 'offline' || nextStatus !== 'waiting') {
    displayedStatus.value = nextStatus;
    return;
  }

  waitingStatusTimer = setTimeout(() => {
    displayedStatus.value = nextStatus;
    waitingStatusTimer = null;
  }, WAITING_STATUS_DELAY);
});

onBeforeUnmount(clearWaitingStatusTimer);
</script>
