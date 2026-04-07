import { PushNotifications } from '@capacitor/push-notifications';
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';
import { useChatApi } from './useApi';
import { getCurrentUserId } from './useChat';
import { getUserById } from '../composables/useUsers';
import { handleIncomingPushCall, handleNativeCallAction } from './useLiveKit';
import {
  clearTopicNotifications,
  isTopicCurrentlyVisible,
  navigateToNotificationTarget,
  resolveNotificationTopicId
} from './useNotificationNavigation';

interface NotificationTapPlugin {
  addListener(
    eventName: 'notificationTap',
    listenerFunc: (payload: Record<string, string>) => void
  ): Promise<PluginListenerHandle>;
  consumePendingNotificationTap(): Promise<Record<string, string>>;
}

type NativeNotificationData = Record<string, string> & {
  action?: string;
  callerId?: string;
  fromUserId?: string;
  roomId?: string;
  tag?: string;
  topicId?: string;
  topicType?: string;
  type?: string;
  url?: string;
  link?: string;
};

const NotificationTap = registerPlugin<NotificationTapPlugin>(
  'NotificationTap'
);
let nativeNotificationTapListener: PluginListenerHandle | null = null;
let lastHandledNotificationKey = '';
let lastHandledNotificationAt = 0;

const hasPayloadValues = (payload?: Record<string, string> | null) =>
  Boolean(payload && Object.keys(payload).length > 0);

const normalizeNativeNotificationData = (
  data: NativeNotificationData = {}
): NativeNotificationData => {
  const url =
    data.url ||
    data.link ||
    data.click_action ||
    data['gcm.notification.click_action'];
  const topicId =
    resolveNotificationTopicId({
      topicId: data.topicId,
      chatId: data.chatId,
      dialogsId: data.dialogsId,
      groupId: data.groupId,
      tag: data.tag,
      url,
      link: data.link
    }) || undefined;

  return {
    ...data,
    topicId,
    url
  };
};

const getNotificationInteractionKey = (data: NativeNotificationData) =>
  data['google.message_id'] ||
  data.messageId ||
  `${data.topicId || 'unknown'}|${data.url || data.link || ''}|${data.action || ''}`;

const shouldHandleNotificationInteraction = (data: NativeNotificationData) => {
  const key = getNotificationInteractionKey(data);
  const now = Date.now();

  if (
    key === lastHandledNotificationKey &&
    now - lastHandledNotificationAt < 3000
  ) {
    return false;
  }

  lastHandledNotificationKey = key;
  lastHandledNotificationAt = now;
  return true;
};

const handleNotificationInteraction = (
  data: NativeNotificationData = {},
  actionId?: string | null
) => {
  const normalizedData = normalizeNativeNotificationData(data);

  if (!shouldHandleNotificationInteraction(normalizedData)) {
    return true;
  }

  const normalizedActionId = actionId?.toLowerCase();

  if (normalizedActionId?.includes('accept') || normalizedActionId?.includes('answer')) {
    void handleNativeCallAction(
      'accept',
      normalizedData.roomId,
      normalizedData.topicId || normalizedData.roomId
    );
    return true;
  }

  if (
    normalizedActionId?.includes('decline') ||
    normalizedActionId?.includes('reject') ||
    normalizedActionId?.includes('end')
  ) {
    void handleNativeCallAction(
      'decline',
      normalizedData.roomId,
      normalizedData.topicId || normalizedData.roomId
    );
    return true;
  }

  if (normalizedData.action === 'CLEAR_CHAT_NOTIFICATIONS') {
    void clearTopicNotifications(normalizedData.topicId);
    return true;
  }

  if (normalizedData.type === 'incoming_call') {
    handleCallPush({ data: normalizedData });
    return true;
  }

  if (navigateToNotificationTarget(normalizedData)) {
    return true;
  }

  handleCallPush({ data: normalizedData });
  return false;
};

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

    if (
      Capacitor.getPlatform() === 'android' &&
      !nativeNotificationTapListener
    ) {
      nativeNotificationTapListener = await NotificationTap.addListener(
        'notificationTap',
        payload => {
          handleNotificationInteraction(payload as NativeNotificationData);
        }
      );
    }

    PushNotifications.addListener('registration', async token => {
      await api.post('/notifications/device', {
        token: token.value,
        platform: Capacitor.getPlatform()
      });
    });

    PushNotifications.addListener('pushNotificationReceived', n => {
      console.log('Native push received:', n);
      const normalizedData = normalizeNativeNotificationData(
        (n.data || {}) as NativeNotificationData
      );

      if (normalizedData.action === 'CLEAR_CHAT_NOTIFICATIONS') {
        void clearTopicNotifications(normalizedData.topicId);
        return;
      }

      if (isTopicCurrentlyVisible(normalizedData.topicId)) {
        void clearTopicNotifications(normalizedData.topicId);
        return;
      }

      handleCallPush({ ...n, data: normalizedData });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', n => {
      console.log('Native push action:', n);
      handleNotificationInteraction(
        (n.notification.data || {}) as NativeNotificationData,
        n.actionId
      );
    });

    PushNotifications.addListener('registrationError', e =>
      console.error('Push error:', e)
    );

    // Capacitor covers taps via onNewIntent, but cold starts need a native handoff.
    if (Capacitor.getPlatform() === 'android') {
      try {
        const pendingNotificationTap =
          await NotificationTap.consumePendingNotificationTap();
        if (hasPayloadValues(pendingNotificationTap)) {
          handleNotificationInteraction(
            pendingNotificationTap as NativeNotificationData
          );
        }
      } catch (error) {
        console.warn('Failed to consume pending Android notification tap:', error);
      }
    }

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

const handleCallPush = (notification?: { data?: NativeNotificationData }) => {
  const data = notification?.data;
  if (data && data.type === 'incoming_call') {
    const callerId = data.callerId || data.fromUserId;
    const roomId = data.roomId;

    const user = getUserById(callerId);
    if (user) {
      handleIncomingPushCall(user, roomId, data.topicId || roomId);
    }
  }
};

export const removePushListeners = async () => {
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.removeAllListeners();

    if (nativeNotificationTapListener) {
      await nativeNotificationTapListener.remove();
      nativeNotificationTapListener = null;
    }
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
