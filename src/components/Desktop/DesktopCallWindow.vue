<template>
  <CallModal v-if="fallback" />
</template>

<script setup lang="ts">
import { getCurrentInstance, onBeforeUnmount, onMounted, ref } from 'vue';
import CallModal from '../CallModal/CallModal.vue';
import { isModalVisible } from '../../services/useCallState';
import { openDesktopCallWindow } from '../../services/desktop-call-window';
import type { DesktopCallActions } from './call-window-context';

const props = defineProps<{
  actions?: Partial<DesktopCallActions>;
  getMicrophoneTrack?: () => MediaStreamTrack | null;
}>();
const owner = getCurrentInstance()!.appContext;
const abort = new AbortController();
const fallback = ref(false);
let host: Awaited<ReturnType<typeof openDesktopCallWindow>> = null;
onMounted(async () => {
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
    if (isModalVisible.value) await host.show();
  } catch (error) {
    if (abort.signal.aborted) return;
    console.warn('Не удалось подготовить отдельное окно звонка:', error);
    fallback.value = true;
  }
});
onBeforeUnmount(() => {
  abort.abort();
  void host?.dispose();
});
</script>
