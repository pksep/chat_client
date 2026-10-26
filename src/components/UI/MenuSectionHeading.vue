<template>
  <component
    :is="props.as"
    :class="{
      'menu-section-heading': props.shared,
      'menu-section-heading--centered': props.centered,
      'menu-section-heading--waiting': showNetworkStatus
    }"
  >
    <slot />
    <ConnectionStatus
      v-if="showNetworkStatus"
      class="menu-section-heading__network"
      :refresh-failed="props.refreshFailed"
    />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ConnectionStatus from './ConnectionStatus.vue';
import { useResizeState } from '../../composables/useResizeState';
import { useDelayedConnectionStatus } from '../../composables/useDelayedConnectionStatus';
import {
  getHasBrowserNetwork,
  getHasWebsocketConnection
} from '../../services/useChat';
import { MAX_W_MD } from '../../utils/constants';

const props = withDefaults(
  defineProps<{
    as?: 'header' | 'div' | 'h4';
    shared?: boolean;
    centered?: boolean;
    networkStatus?: boolean;
    refreshFailed?: boolean;
  }>(),
  { as: 'header', shared: true, centered: false }
);
const { state: isMobile } = useResizeState(MAX_W_MD);
const waiting = useDelayedConnectionStatus(
  () =>
    !!props.networkStatus &&
    (!getHasBrowserNetwork() ||
      props.refreshFailed ||
      !getHasWebsocketConnection())
);
const showNetworkStatus = computed(() => isMobile.value && waiting.value);
</script>
