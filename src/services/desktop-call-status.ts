import { ref } from 'vue';
import { open, requestCallPresentation } from './useCallState';

export const desktopCallStatusVisible = ref(false);
export const requestDesktopCallStatus = () => {
  desktopCallStatusVisible.value = true;
  if (open.value) requestCallPresentation();
};
