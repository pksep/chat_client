import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useChatApi } from './useApi';
import { getCurrentUserId } from './useChat';
import { getUserById } from '../composables/useUsers';
import { receiveCall } from './useJitsi';
import { showIncomingCallKit } from './useCallKit';

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

    PushNotifications.addListener('pushNotificationReceived', n => {
      console.log('Native push received:', n);
      handleCallPush(n);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', n => {
      console.log('Native push action:', n);
      handleCallPush(n.notification);
    });

    PushNotifications.addListener('registrationError', e =>
      console.error('Push error:', e)
    );

    // Handle the case where the app was launched by a notification
    const handleInitialPush = async () => {
      const result = await PushNotifications.getDeliveredNotifications();
      if (result.notifications.length > 0) {
        result.notifications.forEach(n => handleCallPush(n));
      }
    };
    handleInitialPush();

    return;
  }

  // Web Push (Browser)
  if (!('serviceWorker' in navigator)) return;

  if (Notification.permission === 'default')
    await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;

  // Unregister all old service workers to ensure we always have the latest
  const registrations = await navigator.serviceWorker.getRegistrations();
  for (const reg of registrations) {
    await reg.unregister();
    console.log('Unregistered old service worker');
  }

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

const handleCallPush = (notification: any) => {
  return;
  const data = notification.data;
  if (data && data.type === 'incoming_call') {
    const callerId = data.callerId;
    const roomId = data.roomId;
    const topicId = data.topicId;

    const user = getUserById(callerId);
    if (user) {
      receiveCall(user, roomId, topicId);
      if (Capacitor.isNativePlatform()) {
        showIncomingCallKit(user.initials, roomId);
      }
    }
  }
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
