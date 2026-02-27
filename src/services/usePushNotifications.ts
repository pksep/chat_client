import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useChatApi } from './useApi';
import { getCurrentUserId } from './useChat';
import {
  navigateToDialogs,
  navigateToGroup
} from '../composables/navigation/useUrlRouting';

export const initPushNotifications = async () => {
  const api = useChatApi();
  // Android/iOS

  if (Capacitor.isNativePlatform()) {
    let permStatus = await PushNotifications.checkPermissions();
    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }
    if (permStatus.receive !== 'granted')
      return console.error('Permission denied');

    await PushNotifications.register();

    PushNotifications.addListener('registration', async token => {
      await api.post('/notifications/device', {
        token: token.value,
        platform: Capacitor.getPlatform()
      });
    });

    PushNotifications.addListener('pushNotificationReceived', async n => {
      console.log('Native push:', n);
      // Если пришел silent push для очистки уведомлений (например, прочитали на другом устройстве)
      if (n.data && n.data.action === 'CLEAR_CHAT_NOTIFICATIONS') {
        const topicId = n.data.topicId;
        if (topicId) {
          try {
            // В ОС Android/iOS пуши сохраняются с идентификаторами (id) или tag
            // Мы передаем topicId как id/tag, поэтому ищем уведомления
            const delivered =
              await PushNotifications.getDeliveredNotifications();
            const toRemove = delivered.notifications.filter(
              note =>
                note.data?.topicId === topicId ||
                note.tag === topicId ||
                String(note.id) === String(topicId)
            );

            if (toRemove.length > 0) {
              await PushNotifications.removeDeliveredNotifications({
                notifications: toRemove
              });
              console.log('Cleared notifications for topic:', topicId);
            }
          } catch (e) {
            console.error('Error clearing notifications', e);
          }
        }
      }
    });
    PushNotifications.addListener('registrationError', e =>
      console.error('Push error:', e)
    );

    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      console.log('Action performed:', action);
      const data = action.notification.data;
      if (data?.topicId) {
        if (data.topicType === 'GROUP') {
          navigateToGroup(data.topicId);
        } else {
          navigateToDialogs(data.topicId);
        }
      } else if (data?.url) {
        window.location.href = data.url;
      }
    });

    return;
  }

  // Web Push (Browser)
  if (!('serviceWorker' in navigator)) return;

  if (Notification.permission === 'default')
    await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;

  const registration =
    await navigator.serviceWorker.register('/service-worker.js');

  // Get public key from server
  const resp = await api.get<{ publicKey: string }>('/push/public-key');
  const data = await resp.json();
  const publicKey = data?.publicKey;
  if (!publicKey) return console.error('Missing VAPID key');

  const applicationServerKey = urlBase64ToArrayBuffer(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
  }

  const userId = getCurrentUserId();
  if (!userId) return console.warn('No user ID, skipping subscribe');

  await api.post('/push/subscribe', { userId, subscription });
};

export const removePushListeners = async () => {
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.removeAllListeners();
  }
};

const urlBase64ToArrayBuffer = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output.buffer;
};
