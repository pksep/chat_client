<template>
  <button
    type="button"
    class="file-download-progress"
    :class="{ 'file-download-progress--outgoing': isMeSender }"
    :disabled="cancelling"
    :aria-label="`Отменить скачивание файла ${fileName}`"
    @click.stop.prevent="confirmOpen = true"
    @keydown.enter.stop.prevent
    @keydown.space.stop.prevent
    @keyup.enter.stop.prevent="confirmOpen = true"
    @keyup.space.stop.prevent="confirmOpen = true"
  >
    <FileIcon
      :is-loaded="false"
      :percent="percent"
      :is-me-sender="isMeSender"
    />
    <svg
      class="file-download-progress__cross"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M4 4l8 8M12 4l-8 8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  </button>
  <Teleport to="body">
    <ConfirmModal
      v-if="confirmOpen"
      :open="true"
      title="Отменить скачивание?"
      description="Скачивание будет остановлено. Файл можно скачать заново."
      @keydown.esc.stop.prevent="confirmOpen = false"
      @unmount-close="confirmOpen = false"
      @unmount-confirm="confirmCancel"
    />
  </Teleport>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import FileIcon from './FileIcon.vue';
import ConfirmModal from './ConfirmModal.vue';
import { showErrorNotification } from '../../composables/useNotifications';

const props = withDefaults(
  defineProps<{
    percent: number | null;
    fileName: string;
    isMeSender?: boolean;
    cancel: () => Promise<void>;
  }>(),
  { isMeSender: false }
);
const confirmOpen = ref(false);
const cancelling = ref(false);
const confirmCancel = async () => {
  confirmOpen.value = false;
  cancelling.value = true;
  try {
    await props.cancel();
  } catch (error) {
    showErrorNotification(error);
  } finally {
    cancelling.value = false;
  }
};
</script>
<style scoped>
.file-download-progress {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--surface-input-primary, white);
}
.file-download-progress--outgoing {
  color: var(--action-primary-bg);
}
.file-download-progress__cross {
  position: absolute;
  width: 14px;
  height: 14px;
}
.file-download-progress:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
  border-radius: 50%;
}
.file-download-progress:disabled {
  cursor: progress;
  opacity: 0.65;
}
</style>
