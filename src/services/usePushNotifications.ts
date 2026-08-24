import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { useChatApi } from './useApi';
import { getCurrentUserId } from './useChat';
import { getUserById } from '../composables/useUsers';
import {
  clearTopicNotifications,
  isTopicCurrentlyVisible,
  navigateToNotificationTarget,
  resolveNotificationTopicId
} from './useNotificationNavigation';
import {
  clearAllTauriNotifications,
  initTauriNotifications,
  isTauriRuntime
} from './useTauriNotifications';
import { getTelemetryErrorPayload, recordTelemetryEvent } from './useTelemetry';
import { getTelemetryInstallationId } from './useTelemetryDevice';
import { RuStorePush, type NativePushNotificationPayload } from './nativePush';

const FIREBASE_PUSH_TOKEN_STORAGE_KEY = 'chat_native_push_token';
const RUSTORE_PUSH_TOKEN_STORAGE_KEY = 'chat_rustore_push_token';
const WEB_PUSH_ENDPOINT_STORAGE_KEY = 'chat_web_push_endpoint';

type WebPushBrowser = 'chrome' | 'mozilla' | 'yandex' | 'unknown';

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
  startTime?: string;
  tag?: string;
  topicId?: string;
  topicType?: string;
  type?: string;
  url?: string;
  link?: string;
};

const NotificationTap =
  registerPlugin<NotificationTapPlugin>('NotificationTap');
let nativeNotificationTapListener: PluginListenerHandle | null = null;
let firebasePushListenersBound = false;
let ruStorePushListenersBound = false;
const nativePushRegistrationsInFlight = new Set<string>();
const syncedNativePushRegistrations = new Set<string>();
let lastHandledNotificationKey = '';
let lastHandledNotificationAt = 0;
let isWebServiceWorkerMessageListenerBound = false;
type LiveKitModule = typeof import('./useLiveKit');

const loadLiveKit = () => import('./useLiveKit');

const handleIncomingPushCallLazy = async (
  ...args: Parameters<LiveKitModule['handleIncomingPushCall']>
) => {
  const { handleIncomingPushCall } = await loadLiveKit();

  return handleIncomingPushCall(...args);
};

const handleNativeCallActionLazy = async (
  ...args: Parameters<LiveKitModule['handleNativeCallAction']>
) => {
  const { handleNativeCallAction } = await loadLiveKit();

  return handleNativeCallAction(...args);
};

const dismissIncomingCallStateLazy = async (
  ...args: Parameters<LiveKitModule['dismissIncomingCallState']>
) => {
  const { dismissIncomingCallState } = await loadLiveKit();

  return dismissIncomingCallState(...args);
};

const storeNativePushToken = (
  provider: 'firebase' | 'rustore',
  token: string
): void => {
  localStorage.setItem(
    provider === 'firebase'
      ? FIREBASE_PUSH_TOKEN_STORAGE_KEY
      : RUSTORE_PUSH_TOKEN_STORAGE_KEY,
    token
  );
};

const getStoredNativePushTokens = (): string[] =>
  [
    localStorage.getItem(FIREBASE_PUSH_TOKEN_STORAGE_KEY),
    localStorage.getItem(RUSTORE_PUSH_TOKEN_STORAGE_KEY)
  ].filter((token): token is string => Boolean(token));

const isRuStorePushPlatform = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const storeWebPushEndpoint = (endpoint: string): void => {
  localStorage.setItem(WEB_PUSH_ENDPOINT_STORAGE_KEY, endpoint);
};

const getStoredWebPushEndpoint = (): string =>
  localStorage.getItem(WEB_PUSH_ENDPOINT_STORAGE_KEY) || '';

const clearStoredPushRegistration = (): void => {
  localStorage.removeItem(FIREBASE_PUSH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(RUSTORE_PUSH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(WEB_PUSH_ENDPOINT_STORAGE_KEY);
};

const getWebPushBrowser = (): WebPushBrowser => {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: {
      brands?: { brand?: string }[];
    };
  };
  const userAgent = navigator.userAgent.toLowerCase();
  const brands =
    navigatorWithUserAgentData.userAgentData?.brands?.map(({ brand }) =>
      (brand || '').toLowerCase()
    ) || [];
  const hasBrand = (needle: string) =>
    brands.some(brand => brand.includes(needle));

  if (userAgent.includes('yabrowser') || hasBrand('yandex')) {
    return 'yandex';
  }

  if (userAgent.includes('firefox') || userAgent.includes('fxios')) {
    return 'mozilla';
  }

  if (
    userAgent.includes('chrome') ||
    userAgent.includes('crios') ||
    userAgent.includes('chromium') ||
    hasBrand('google chrome') ||
    hasBrand('chromium')
  ) {
    return 'chrome';
  }

  return 'unknown';
};

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
  data['rustore.message_id'] ||
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

const bindNativeNotificationTapListener = async (): Promise<void> => {
  if (
    !Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'android' ||
    nativeNotificationTapListener
  ) {
    return;
  }

  nativeNotificationTapListener = await NotificationTap.addListener(
    'notificationTap',
    payload => {
      handleNotificationInteraction(payload as NativeNotificationData);
    }
  );
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

  if (
    normalizedActionId?.includes('accept') ||
    normalizedActionId?.includes('answer')
  ) {
    void handleNativeCallActionLazy(
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
    void handleNativeCallActionLazy(
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

  if (normalizedData.action === 'DISMISS_INCOMING_CALL') {
    void dismissIncomingCallStateLazy(
      normalizedData.roomId,
      normalizedData.topicId || normalizedData.roomId
    );
    return true;
  }

  if (normalizedData.type === 'incoming_call') {
    navigateToNotificationTarget(normalizedData);
    handleCallPush({ data: normalizedData });
    return true;
  }

  if (navigateToNotificationTarget(normalizedData)) {
    return true;
  }

  handleCallPush({ data: normalizedData });
  return false;
};

export const initFastNativeNotificationNavigation =
  async (): Promise<boolean> => {
    if (
      !Capacitor.isNativePlatform() ||
      Capacitor.getPlatform() !== 'android'
    ) {
      return false;
    }

    try {
      await bindNativeNotificationTapListener();
    } catch (error) {
      console.warn('Failed to bind fast Android notification tap:', error);
    }

    try {
      const pendingNotificationTap =
        await NotificationTap.consumePendingNotificationTap();

      if (!hasPayloadValues(pendingNotificationTap)) {
        return false;
      }

      handleNotificationInteraction(
        pendingNotificationTap as NativeNotificationData
      );
      return true;
    } catch (error) {
      console.warn('Failed to consume fast Android notification tap:', error);
      return false;
    }
  };

const consumeWebCallActionFromUrl = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  const action = url.searchParams.get('callAction');

  if (action !== 'accept' && action !== 'decline') {
    return;
  }

  const roomId = url.searchParams.get('roomId') || undefined;
  const topicId = url.searchParams.get('topicId') || undefined;

  url.searchParams.delete('callAction');
  url.searchParams.delete('roomId');
  url.searchParams.delete('topicId');
  window.history.replaceState({}, document.title, url.toString());

  void handleNativeCallActionLazy(action, roomId, topicId);
};

const isChatServiceWorkerRegistration = (
  registration?: ServiceWorkerRegistration
): boolean =>
  Boolean(
    registration &&
      [registration.active, registration.waiting, registration.installing].some(
        worker => worker?.scriptURL.endsWith('/service-worker.js')
      )
  );

const getOrRegisterWebServiceWorker =
  async (): Promise<ServiceWorkerRegistration> => {
    const existingRegistration =
      await navigator.serviceWorker.getRegistration('/');
    const registration =
      existingRegistration &&
      isChatServiceWorkerRegistration(existingRegistration)
        ? existingRegistration
        : await navigator.serviceWorker.register('/service-worker.js');

    try {
      await registration.update();
    } catch (error) {
      console.warn('Не удалось обновить service worker:', error);
    }

    return registration;
  };

const bindWebServiceWorkerMessageListener = () => {
  if (
    Capacitor.isNativePlatform() ||
    isWebServiceWorkerMessageListenerBound ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  navigator.serviceWorker.addEventListener('message', event => {
    const payload = event.data as
      | {
          type?: string;
          action?: 'accept' | 'decline';
          roomId?: string | null;
          topicId?: string | null;
          notification?: NativeNotificationData;
          source?: string;
        }
      | undefined;

    if (
      payload?.type === 'CALL_ACTION' &&
      (payload.action === 'accept' || payload.action === 'decline')
    ) {
      void handleNativeCallActionLazy(
        payload.action,
        payload.roomId || undefined,
        payload.topicId || undefined
      );
      return;
    }

    if (payload?.type === 'CHAT_BACKGROUND_SYNC_UPDATED') {
      void import('./useWebChatBackgroundSync')
        .then(({ importWebChatBackgroundSnapshot }) =>
          importWebChatBackgroundSnapshot(getCurrentUserId() || undefined, {
            source: `service-worker-${payload.source || 'message'}`,
            requireNewerThanLocalPts: true
          })
        )
        .catch(error => {
          console.warn(
            'Не удалось импортировать web-снимок фоновой синхронизации чата:',
            error
          );
        });
      return;
    }

    if (payload?.type !== 'NOTIFICATION_NAVIGATE') {
      return;
    }

    handleNotificationInteraction(payload.notification);
  });

  isWebServiceWorkerMessageListenerBound = true;
};

const syncNativePushToken = async (
  token: string,
  platform: 'android' | 'ios' | 'rustore',
  provider: 'firebase' | 'rustore'
): Promise<void> => {
  const registrationKey = `${provider}:${token}`;
  if (
    nativePushRegistrationsInFlight.has(registrationKey) ||
    syncedNativePushRegistrations.has(registrationKey)
  ) {
    return;
  }

  nativePushRegistrationsInFlight.add(registrationKey);
  storeNativePushToken(provider, token);

  try {
    await useChatApi().post('/notifications/device', {
      token,
      platform,
      installationId: getTelemetryInstallationId()
    });
    syncedNativePushRegistrations.add(registrationKey);
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.native.registration.success',
      entityType: 'notification',
      payload: {
        provider,
        platform,
        tokenLength: token.length
      }
    });
  } catch (error) {
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.native.registration.failed',
      level: 'error',
      entityType: 'notification',
      payload: {
        provider,
        platform,
        ...getTelemetryErrorPayload(error)
      }
    });
    console.error(`${provider} push registration sync failed:`, error);
  } finally {
    nativePushRegistrationsInFlight.delete(registrationKey);
  }
};

const handleNativePushReceived = (
  notification: NativePushNotificationPayload,
  provider: 'firebase' | 'rustore'
): void => {
  console.log(`${provider} push received:`, notification);
  const normalizedData = normalizeNativeNotificationData(
    (notification.data || {}) as NativeNotificationData
  );
  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.native.received',
    entityType: 'notification',
    entityId: normalizedData.topicId || normalizedData.roomId,
    payload: {
      provider,
      action: normalizedData.action,
      type: normalizedData.type,
      topicId: normalizedData.topicId,
      roomId: normalizedData.roomId,
      topicType: normalizedData.topicType
    }
  });

  if (normalizedData.action === 'CLEAR_CHAT_NOTIFICATIONS') {
    void clearTopicNotifications(normalizedData.topicId);
    return;
  }

  if (normalizedData.action === 'DISMISS_INCOMING_CALL') {
    void dismissIncomingCallStateLazy(
      normalizedData.roomId,
      normalizedData.topicId || normalizedData.roomId
    );
    return;
  }

  if (isTopicCurrentlyVisible(normalizedData.topicId)) {
    void clearTopicNotifications(normalizedData.topicId);
    return;
  }

  handleCallPush({ ...notification, data: normalizedData });
};

const recordNativePushError = (
  provider: 'firebase' | 'rustore',
  error: unknown
): void => {
  const normalizedError =
    error && typeof error === 'object' && 'error' in error
      ? (error as { error?: unknown }).error
      : error;
  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.native.registration_error',
    level: 'error',
    entityType: 'notification',
    payload: {
      provider,
      ...getTelemetryErrorPayload(normalizedError)
    }
  });
  console.error(`${provider} push error:`, normalizedError);
};

export const initPushNotifications = async () => {
  const api = useChatApi();
  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.init.start',
    entityType: 'notification',
    payload: {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform()
    }
  });
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform() as 'android' | 'ios';
    let permStatus = await PushNotifications.checkPermissions();
    if (
      permStatus.receive === 'prompt' ||
      permStatus.receive === 'prompt-with-rationale'
    ) {
      permStatus = await PushNotifications.requestPermissions();
    }
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.permission.checked',
      level: permStatus.receive === 'granted' ? 'info' : 'warn',
      entityType: 'notification',
      payload: {
        receive: permStatus.receive,
        platform: Capacitor.getPlatform()
      }
    });
    if (permStatus.receive !== 'granted')
      return console.error('Permission denied');

    if (
      Capacitor.getPlatform() === 'android' &&
      !nativeNotificationTapListener
    ) {
      await bindNativeNotificationTapListener();
    }

    if (!firebasePushListenersBound) {
      await PushNotifications.addListener('registration', token => {
        void syncNativePushToken(token.value, platform, 'firebase');
      });

      await PushNotifications.addListener('pushNotificationReceived', n => {
        handleNativePushReceived(n, 'firebase');
      });

      await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        n => {
          console.log('Firebase push action:', n);
          const normalizedData = normalizeNativeNotificationData(
            (n.notification.data || {}) as NativeNotificationData
          );
          recordTelemetryEvent({
            category: 'notification',
            name: 'notification.native.action',
            entityType: 'notification',
            entityId: normalizedData.topicId || normalizedData.roomId,
            payload: {
              provider: 'firebase',
              actionId: n.actionId,
              action: normalizedData.action,
              type: normalizedData.type,
              topicId: normalizedData.topicId,
              roomId: normalizedData.roomId
            }
          });
          handleNotificationInteraction(normalizedData, n.actionId);
        }
      );

      await PushNotifications.addListener('registrationError', error => {
        recordNativePushError('firebase', error);
      });

      firebasePushListenersBound = true;
    }

    try {
      await PushNotifications.register();
    } catch (error) {
      recordNativePushError('firebase', error);
    }

    if (isRuStorePushPlatform()) {
      if (!ruStorePushListenersBound) {
        await RuStorePush.addListener('registration', token => {
          void syncNativePushToken(token.value, 'rustore', 'rustore');
        });

        await RuStorePush.addListener('pushNotificationReceived', n => {
          handleNativePushReceived(n, 'rustore');
        });

        await RuStorePush.addListener('registrationError', error => {
          recordNativePushError('rustore', error);
        });

        ruStorePushListenersBound = true;
      }

      try {
        await RuStorePush.register();
      } catch (error) {
        recordNativePushError('rustore', error);
      }
    }

    // Native notification taps can arrive before the web layer starts.
    if (Capacitor.getPlatform() === 'android') {
      try {
        const pendingNotificationTap =
          await NotificationTap.consumePendingNotificationTap();
        if (hasPayloadValues(pendingNotificationTap)) {
          recordTelemetryEvent({
            category: 'notification',
            name: 'notification.native.pending_tap',
            entityType: 'notification',
            payload: {
              hasPendingTap: true
            }
          });
          handleNotificationInteraction(
            pendingNotificationTap as NativeNotificationData
          );
        }
      } catch (error) {
        recordTelemetryEvent({
          category: 'notification',
          name: 'notification.native.pending_tap_failed',
          level: 'warn',
          entityType: 'notification',
          payload: getTelemetryErrorPayload(error)
        });
        console.warn(
          'Failed to consume pending Android notification tap:',
          error
        );
      }
    }

    return;
  }

  if (
    await initTauriNotifications(payload => {
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.tauri.received',
        entityType: 'notification',
        payload: {
          type: (payload as NativeNotificationData).type,
          topicId: (payload as NativeNotificationData).topicId,
          roomId: (payload as NativeNotificationData).roomId
        }
      });
      handleNotificationInteraction(payload as NativeNotificationData);
    })
  ) {
    return;
  }

  // Web Push (Browser)
  if (!('serviceWorker' in navigator)) return;

  if (Notification.permission === 'default')
    await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;

  const registration = await getOrRegisterWebServiceWorker();
  bindWebServiceWorkerMessageListener();
  consumeWebCallActionFromUrl();

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

  if (subscription?.endpoint) {
    storeWebPushEndpoint(subscription.endpoint);
  }

  const userId = getCurrentUserId();
  if (!userId) return console.warn('No user ID, skipping subscribe');

  const browser = getWebPushBrowser();
  const subscriptionPayload = {
    ...subscription.toJSON(),
    browser
  };

  await api.post('/push/subscribe', {
    userId,
    subscription: subscriptionPayload,
    browser
  });
  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.web.subscribe.success',
    entityType: 'notification',
    payload: {
      browser,
      endpointLength: subscription.endpoint.length
    }
  });
};

const handleCallPush = (notification?: { data?: NativeNotificationData }) => {
  const data = notification?.data;
  if (data && data.type === 'incoming_call') {
    const callerId = data.callerId || data.fromUserId;
    const roomId = data.roomId;
    const targetTopicId = data.topicId || roomId;

    const user = getUserById(callerId);
    if (user) {
      const startTime = data.startTime ? Number(data.startTime) : undefined;

      void handleIncomingPushCallLazy(
        user,
        roomId,
        targetTopicId,
        data.topicType,
        Number.isFinite(startTime) ? startTime : undefined
      );
    }
  }
};

export const removePushListeners = async () => {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  await PushNotifications.removeAllListeners();
  firebasePushListenersBound = false;

  if (isRuStorePushPlatform()) {
    await RuStorePush.removeAllListeners();
    ruStorePushListenersBound = false;
  }

  if (nativeNotificationTapListener) {
    await nativeNotificationTapListener.remove();
    nativeNotificationTapListener = null;
  }

  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.native.listeners_removed',
    entityType: 'notification',
    payload: {
      platform: Capacitor.getPlatform()
    }
  });
};

const clearAllWebNotifications = async (): Promise<void> => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();

    notifications.forEach(notification => {
      notification.close();
    });

    const activeWorker =
      navigator.serviceWorker.controller ||
      registration.active ||
      registration.waiting;

    activeWorker?.postMessage({
      type: 'CLEAR_ALL_NOTIFICATIONS'
    });
  } catch (error) {
    console.warn('Failed to clear web notifications:', error);
  }
};

export const cleanupPushNotificationsOnLogout = async (): Promise<void> => {
  const api = useChatApi();
  const startedAt = Date.now();

  recordTelemetryEvent({
    category: 'notification',
    name: 'notification.cleanup.start',
    entityType: 'notification',
    payload: {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform()
    }
  });

  try {
    if (Capacitor.isNativePlatform()) {
      const tokens = [...new Set(getStoredNativePushTokens())];

      for (const token of tokens) {
        try {
          await api.post('/notifications/device/unregister', { token });
        } catch (error) {
          console.warn('Failed to unregister native push token:', error);
        }
      }

      try {
        await PushNotifications.removeAllDeliveredNotifications();
      } catch (error) {
        console.warn('Failed to clear Firebase notifications:', error);
      }

      if (isRuStorePushPlatform()) {
        try {
          await RuStorePush.clearAllNotifications();
        } catch (error) {
          console.warn('Failed to clear RuStore notifications:', error);
        }
      }

      await removePushListeners();

      try {
        await PushNotifications.unregister();
      } catch (error) {
        console.warn('Failed to unregister Firebase push:', error);
      }

      if (isRuStorePushPlatform()) {
        try {
          await RuStorePush.unregister();
        } catch (error) {
          console.warn('Failed to unregister RuStore push:', error);
        }
      }

      clearStoredPushRegistration();
      nativePushRegistrationsInFlight.clear();
      syncedNativePushRegistrations.clear();
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.cleanup.success',
        entityType: 'notification',
        payload: {
          platform: Capacitor.getPlatform(),
          elapsedMs: Date.now() - startedAt
        }
      });
      return;
    }

    if (isTauriRuntime()) {
      await clearAllTauriNotifications();
      clearStoredPushRegistration();
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.cleanup.success',
        entityType: 'notification',
        payload: {
          platform: 'tauri',
          elapsedMs: Date.now() - startedAt
        }
      });
      return;
    }

    if (!('serviceWorker' in navigator)) {
      clearStoredPushRegistration();
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.cleanup.success',
        entityType: 'notification',
        payload: {
          platform: 'web',
          serviceWorker: false,
          elapsedMs: Date.now() - startedAt
        }
      });
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint || getStoredWebPushEndpoint();

    if (endpoint) {
      try {
        await api.post('/push/unsubscribe', { endpoint });
      } catch (error) {
        console.warn('Failed to unregister web push endpoint:', error);
      }
    }

    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (error) {
        console.warn('Failed to unsubscribe web push subscription:', error);
      }
    }

    await clearAllWebNotifications();
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.cleanup.success',
      entityType: 'notification',
      payload: {
        platform: 'web',
        elapsedMs: Date.now() - startedAt
      }
    });
  } catch (error) {
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.cleanup.failed',
      level: 'error',
      entityType: 'notification',
      payload: {
        elapsedMs: Date.now() - startedAt,
        ...getTelemetryErrorPayload(error)
      }
    });
    throw error;
  } finally {
    clearStoredPushRegistration();
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
