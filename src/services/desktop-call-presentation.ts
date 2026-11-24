import { ref } from 'vue';

export const desktopCallWindowReady = ref(false);
export const desktopCallWindowOpening = ref(false);
export const desktopCallPreparationRequested = ref(false);
let preparation: AbortController | null = null;

export function beginDesktopCallPreparation() {
  const controller = new AbortController();
  preparation?.abort();
  preparation = controller;
  desktopCallPreparationRequested.value = true;
  return {
    signal: controller.signal,
    finish() {
      if (preparation !== controller) return;
      preparation = null;
      desktopCallPreparationRequested.value = false;
    }
  };
}

export function cancelDesktopCallPreparation() {
  preparation?.abort();
  desktopCallPreparationRequested.value = false;
}
