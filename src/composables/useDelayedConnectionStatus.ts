import { ref, watch } from 'vue';

const CONNECTION_STATUS_DELAY_MS = 5000;

export const useDelayedConnectionStatus = (isUnavailable: () => boolean) => {
  const isVisible = ref(false);

  watch(
    isUnavailable,
    (unavailable, _, onCleanup) => {
      isVisible.value = false;
      if (!unavailable) return;

      const timeout = setTimeout(() => {
        isVisible.value = isUnavailable();
      }, CONNECTION_STATUS_DELAY_MS);
      onCleanup(() => clearTimeout(timeout));
    },
    { immediate: true, flush: 'sync' }
  );

  return isVisible;
};
