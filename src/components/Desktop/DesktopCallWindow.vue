<template>
  <CallModal v-if="fallback" />
</template>

<script setup lang="ts">
import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';
import CallModal from '../CallModal/CallModal.vue';
import { isModalVisible } from '../../services/useCallState';
import { openDesktopCallWindow } from '../../services/desktop-call-window';
import type { DesktopCallActions } from './call-window-context';
import {
  desktopCallWindowOpening,
  desktopCallWindowReady,
  desktopCallPreparationRequested
} from '../../services/desktop-call-presentation';

const props = defineProps<{
  actions?: Partial<DesktopCallActions>;
  getMicrophoneTrack?: () => MediaStreamTrack | null;
}>();
const owner = getCurrentInstance()!.appContext;
const abort = new AbortController();
const fallback = ref(false);
let host: Awaited<ReturnType<typeof openDesktopCallWindow>> = null;
onMounted(async () => {
  desktopCallWindowOpening.value = true;
  desktopCallWindowReady.value = false;
  try {
    const opened = await openDesktopCallWindow({
      appContext: owner,
      signal: abort.signal,
      actions: props.actions,
      getMicrophoneTrack: props.getMicrophoneTrack
    });
    if (abort.signal.aborted) {
      await opened?.dispose();
      return;
    }
    host = opened;
    if (!host) {
      fallback.value = true;
      return;
    }
    if (isModalVisible.value || desktopCallPreparationRequested.value)
      await host.show();
  } catch (error) {
    if (abort.signal.aborted) return;
    console.warn('Не удалось подготовить отдельное окно звонка:', error);
    fallback.value = true;
  } finally {
    desktopCallWindowOpening.value = false;
    if (fallback.value && !abort.signal.aborted)
      desktopCallWindowReady.value = true;
  }
});
onBeforeUnmount(() => {
  desktopCallWindowReady.value = false;
  desktopCallWindowOpening.value = false;
  abort.abort();
  void host?.dispose();
});
</script>
