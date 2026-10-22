import { ref } from 'vue';
import { isIosStandalonePwa, isIosWeb } from '../utils/ios-pwa-viewport';

type WebPushStatus =
  | 'idle'
  | 'install'
  | 'unsupported'
  | 'prompt'
  | 'denied'
  | 'registering'
  | 'subscribed'
  | 'error';

export const webPushStatus = ref<WebPushStatus>('idle');

export const refreshWebPushAvailability = (): boolean => {
  if (isIosWeb() && !isIosStandalonePwa()) {
    webPushStatus.value = 'install';
    return false;
  }
  if (
    !window.isSecureContext ||
    !('Notification' in window) ||
    !('PushManager' in window) ||
    !('serviceWorker' in navigator)
  ) {
    webPushStatus.value = 'unsupported';
    return false;
  }
  if (Notification.permission !== 'granted') {
    webPushStatus.value =
      Notification.permission === 'denied' ? 'denied' : 'prompt';
  }
  return true;
};
