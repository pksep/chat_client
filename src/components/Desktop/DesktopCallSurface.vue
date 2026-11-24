<template>
  <DesktopTitleBar />
  <CallModal v-if="callOpen" />
  <div
    v-else
    class="desktop-call-preparing"
    role="status"
    aria-live="polite"
    data-testid="DesktopCallPreparing"
  >
    <span class="desktop-call-preparing__spinner" aria-hidden="true" />
    <p>Подключение к звонку…</p>
    <span>Подождите немного</span>
  </div>
  <DesktopCallContextMenu />
</template>

<script setup lang="ts">
import { provide } from 'vue';
import CallModal from '../CallModal/CallModal.vue';
import DesktopTitleBar from './DesktopTitleBar.vue';
import DesktopCallContextMenu from './DesktopCallContextMenu.vue';
import { open as callOpen } from '../../services/useCallState';
import {
  desktopCallWindowContextKey,
  type DesktopCallWindowContext
} from './call-window-context';

const props = defineProps<{ context: DesktopCallWindowContext }>();
provide(desktopCallWindowContextKey, props.context);
</script>

<style scoped>
.desktop-call-preparing {
  position: fixed;
  inset: var(--desktop-content-top, 0px) 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--text-primary);
  background: var(--surface-main-modal);
}
.desktop-call-preparing p {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.desktop-call-preparing > span:last-child {
  color: var(--text-secondary);
  font-size: 13px;
}
.desktop-call-preparing__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-table);
  border-top-color: var(--text-link);
  border-radius: 50%;
  animation: call-preparing 0.75s linear infinite;
}
@keyframes call-preparing {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .desktop-call-preparing__spinner {
    animation: none;
  }
}
</style>
