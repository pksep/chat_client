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
  requestNotificationTopicRefresh,
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
import { getChatAuthSession } from '../utils/stored-chat-session';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';
import { clearAnyChatBackgroundSyncSession } from './useChatBackgroundSync';
import { withNetworkTimeout } from '../utils/network-timeout';
import { isChatSessionEnding } from '../composables/useAuth';

const FIREBASE_PUSH_TOKEN_STORAGE_KEY = 'chat_native_push_token';
const RUSTORE_PUSH_TOKEN_STORAGE_KEY = 'chat_rustore_push_token';
const WEB_PUSH_ENDPOINT_STORAGE_KEY = 'chat_web_push_endpoint';
const WEB_PUSH_SUBSCRIPTION_MIGRATION_STORAGE_KEY =
  'chat_web_push_subscription_migration';
const WEB_PUSH_SUBSCRIPTION_MIGRATION_VERSION = 'v1';

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
  sentAt?: string;
  expiresAt?: string;
  receivedAt?: string;
  deliveryDelayMs?: string;
  startTime?: string;
  tag?: string;
  topicId?: string;
  topicType?: string;
  type?: string;
  url?: string;
  link?: string;
  messageId?: string;
};

const NotificationTap =
  registerPlugin<NotificationTapPlugin>('NotificationTap');
const INCOMING_CALL_MAX_AGE_MS = 60_000;
let nativeNotificationTapListener: PluginListenerHandle | null = null;
let nativeNotificationTapListenerPromise: Promise<PluginListenerHandle> | null =
  null;
let ruStorePushListenersBound = false;
let firebasePushListenersBound = false;
let pushNotificationsEnabled = false;
let pushSessionRevision = 0;
const nativePushRegistrationsInFlight = new Set<string>();
const syncedNativePushRegistrations = new Set<string>();
let lastHandledNotificationKey = '';
let lastHandledNotificationAt = 0;
const NOTIFICATION_INTERACTION_DEDUPE_MS = 30_000;
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
  token: string,
  provider: 'firebase' | 'rustore'
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

const parsePushTimestamp = (value?: string): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const isFreshIncomingCallPayload = (
  data: NativeNotificationData,
  now = Date.now()
): boolean => {
  if (
    data.type !== 'incoming_call' ||
    String(data.topicType || '').toUpperCase() === 'GROUP'
  ) {
    return false;
  }

  const expiresAt = parsePushTimestamp(data.expiresAt);
  if (expiresAt !== null && now >= expiresAt) {
    return false;
  }

  const sentAt = parsePushTimestamp(data.sentAt);
  return sentAt === null || now - sentAt <= INCOMING_CALL_MAX_AGE_MS;
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
    now - lastHandledNotificationAt < NOTIFICATION_INTERACTION_DEDUPE_MS
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

  if (!nativeNotificationTapListenerPromise) {
    nativeNotificationTapListenerPromise = NotificationTap.addListener(
      'notificationTap',
      payload => {
        handleNotificationInteraction(payload as NativeNotificationData);
      }
    );
  }

  try {
    nativeNotificationTapListener = await nativeNotificationTapListenerPromise;
  } finally {
    nativeNotificationTapListenerPromise = null;
  }
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
    void clearTopicNotifications(
      normalizedData.topicId,
      parsePushTimestamp(normalizedData.stateAt) ||
        parsePushTimestamp(normalizedData.sentAt)
    );
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
    if (isFreshIncomingCallPayload(normalizedData)) {
      handleCallPush({ data: normalizedData });
    }
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
      const startupNotificationTap = window.__chatNativeInitialNotificationTap;
      delete window.__chatNativeInitialNotificationTap;
      const pendingNotificationTap =
        startupNotificationTap ||
        (await NotificationTap.consumePendingNotificationTap());
      const handled = hasPayloadValues(pendingNotificationTap)
        ? handleNotificationInteraction(
            pendingNotificationTap as NativeNotificationData
          )
        : false;

      // `addListener` can take noticeably longer than a single native method
      // call on a cold WebView. Do not keep Vue mounting behind it: consume the
      // launch payload first, then bind future taps in the background. A
      // second consume after binding closes the very small race where another
      // intent arrives between those operations.
      void bindNativeNotificationTapListener()
        .then(async () => {
          const racedNotificationTap =
            await NotificationTap.consumePendingNotificationTap();

          if (hasPayloadValues(racedNotificationTap)) {
            handleNotificationInteraction(
              racedNotificationTap as NativeNotificationData
            );
          }
        })
        .catch(error => {
          console.warn('Failed to bind fast Android notification tap:', error);
        });

      return handled;
    } catch (error) {
      console.warn('Failed to consume fast Android notification tap:', error);
      void bindNativeNotificationTapListener().catch(listenerError => {
        console.warn(
          'Failed to bind fast Android notification tap:',
          listenerError
        );
      });
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

const consumeWebNotificationNavigationFromUrl = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  const messageId = url.searchParams.get('notificationMessageId');

  if (!messageId) {
    return;
  }

  url.searchParams.delete('notificationMessageId');
  window.history.replaceState({}, document.title, url.toString());

  handleNotificationInteraction({
    messageId,
    url: url.toString()
  });
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
  provider: 'firebase' | 'rustore'
): Promise<void> => {
  const userId = getChatAuthSession()?.user?.id || getCurrentUserId();
  if (isChatSessionEnding() || !pushNotificationsEnabled || !userId) return;
  const revision = pushSessionRevision;
  const registrationKey = `${userId}:${provider}:${token}`;
  if (
    nativePushRegistrationsInFlight.has(registrationKey) ||
    syncedNativePushRegistrations.has(registrationKey)
  ) {
    return;
  }

  nativePushRegistrationsInFlight.add(registrationKey);
  storeNativePushToken(token, provider);

  try {
    await useChatApi().post('/notifications/device', {
      token,
      platform: provider === 'firebase' ? 'android' : 'rustore',
      installationId: getTelemetryInstallationId()
    });
    if (!pushNotificationsEnabled || revision !== pushSessionRevision) return;
    syncedNativePushRegistrations.add(registrationKey);
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.native.registration.success',
      entityType: 'notification',
      payload: {
        provider,
        platform: provider === 'firebase' ? 'android' : 'rustore',
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
        platform: provider === 'firebase' ? 'android' : 'rustore',
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
  if (
    isChatSessionEnding() ||
    !pushNotificationsEnabled ||
    !getChatAuthSession()?.token
  ) {
    return;
  }
  console.log(`${provider} push received:`, notification);
  const normalizedData = normalizeNativeNotificationData(
    (notification.data || {}) as NativeNotificationData
  );
  const receivedAt =
    parsePushTimestamp(normalizedData.receivedAt) || Date.now();
  const sentAt = parsePushTimestamp(normalizedData.sentAt);
  const nativeDeliveryDelayMs = Number(normalizedData.deliveryDelayMs);
  const deliveryDelayMs = Number.isFinite(nativeDeliveryDelayMs)
    ? Math.max(0, nativeDeliveryDelayMs)
    : sentAt !== null
      ? Math.max(0, receivedAt - sentAt)
      : undefined;
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
      topicType: normalizedData.topicType,
      sentAt,
      receivedAt,
      deliveryDelayMs
    }
  });

  if (normalizedData.action === 'CLEAR_CHAT_NOTIFICATIONS') {
    void clearTopicNotifications(
      normalizedData.topicId,
      parsePushTimestamp(normalizedData.stateAt) || sentAt
    );
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
    requestNotificationTopicRefresh(normalizedData.topicId, false);
    void clearTopicNotifications(normalizedData.topicId);
    return;
  }

  handleCallPush({ ...notification, data: normalizedData });
};

const recordNativePushError = (
  error: unknown,
  provider: 'firebase' | 'rustore'
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
  if (isChatSessionEnding() || !getChatAuthSession()?.token) return;
  const revision = pushSessionRevision;
  pushNotificationsEnabled = true;
  const isCurrentSession = () =>
    !isChatSessionEnding() &&
    pushNotificationsEnabled &&
    revision === pushSessionRevision &&
    Boolean(getChatAuthSession()?.token);
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
    if (!isRuStorePushPlatform()) {
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.native.unsupported_platform',
        level: 'warn',
        entityType: 'notification',
        payload: { platform: Capacitor.getPlatform() }
      });
      return;
    }

    let permStatus = await RuStorePush.checkPermissions();
    if (!isCurrentSession()) return;
    if (
      permStatus.receive === 'prompt' ||
      permStatus.receive === 'prompt-with-rationale'
    ) {
      permStatus = await RuStorePush.requestPermissions();
    }
    if (!isCurrentSession()) return;
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

    if (!nativeNotificationTapListener) {
      await bindNativeNotificationTapListener();
    }
    if (!isCurrentSession()) return;

    if (!firebasePushListenersBound) {
      await PushNotifications.addListener('registration', token => {
        void syncNativePushToken(token.value, 'firebase');
      });
      await PushNotifications.addListener('pushNotificationReceived', n => {
        handleNativePushReceived(n, 'firebase');
      });
      await PushNotifications.addListener('registrationError', error => {
        recordNativePushError(error, 'firebase');
      });
      firebasePushListenersBound = true;
    }

    try {
      if (!isCurrentSession()) return;
      await PushNotifications.register();
    } catch (error) {
      recordNativePushError(error, 'firebase');
    }

    if (!isCurrentSession()) return;
    if (!ruStorePushListenersBound) {
      await RuStorePush.addListener('registration', token => {
        void syncNativePushToken(token.value, 'rustore');
      });

      await RuStorePush.addListener('pushNotificationReceived', n => {
        handleNativePushReceived(n, 'rustore');
      });

      await RuStorePush.addListener('registrationError', error => {
        recordNativePushError(error, 'rustore');
      });

      ruStorePushListenersBound = true;
    }

    try {
      if (!isCurrentSession()) return;
      const registration = await RuStorePush.register();
      if (registration.value) {
        await syncNativePushToken(registration.value, 'rustore');
      }
    } catch (error) {
      recordNativePushError(error, 'rustore');
    }

    if (!isCurrentSession()) return;
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

  consumeWebNotificationNavigationFromUrl();

  // Web Push (Browser)
  if (!('serviceWorker' in navigator)) return;

  if (Notification.permission === 'default')
    await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;

  const registration = await getOrRegisterWebServiceWorker();
  if (!isCurrentSession()) return;
  bindWebServiceWorkerMessageListener();
  consumeWebCallActionFromUrl();

  // Get public key from server
  const resp = await api.get<{ publicKey: string }>('/push/public-key');
  const data = await resp.json();
  if (!isCurrentSession()) return;
  const publicKey = data?.publicKey;
  if (!publicKey) return console.error('Missing VAPID key');

  const applicationServerKey = urlBase64ToArrayBuffer(publicKey);

  let subscription = await registration.pushManager.getSubscription();
  const subscriptionKeyMatches = subscription
    ? doesWebPushSubscriptionUseKey(subscription, applicationServerKey)
    : true;
  const needsSubscriptionMigration =
    Boolean(subscription) &&
    (subscriptionKeyMatches === false ||
      localStorage.getItem(WEB_PUSH_SUBSCRIPTION_MIGRATION_STORAGE_KEY) !==
        WEB_PUSH_SUBSCRIPTION_MIGRATION_VERSION);

  if (subscription && needsSubscriptionMigration) {
    const previousEndpoint = subscription.endpoint;
    const migrationReason =
      subscriptionKeyMatches === false
        ? 'vapid_key_changed'
        : 'one_time_refresh';

    try {
      await api.post('/push/unsubscribe', { endpoint: previousEndpoint });
    } catch (error) {
      console.warn(
        'Failed to remove the previous web push subscription:',
        error
      );
    }

    try {
      const didUnsubscribe = await subscription.unsubscribe();
      if (!didUnsubscribe) {
        throw new Error(
          'Browser did not remove the previous web push subscription'
        );
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });
      recordTelemetryEvent({
        category: 'notification',
        name: 'notification.web.subscription_recreated',
        entityType: 'notification',
        payload: { reason: migrationReason }
      });
    } catch (error) {
      console.warn('Failed to recreate web push subscription:', error);
      subscription = await registration.pushManager.getSubscription();
    }
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });
  }

  if (subscription?.endpoint) {
    storeWebPushEndpoint(subscription.endpoint);
  }

  if (!isCurrentSession()) {
    await subscription?.unsubscribe();
    return;
  }

  const userId = getCurrentUserId();
  if (!userId) return console.warn('No user ID, skipping subscribe');

  const browser = getWebPushBrowser();
  const subscriptionPayload = {
    ...subscription.toJSON(),
    browser
  };

  await api.post('/push/subscribe', {
    subscription: subscriptionPayload,
    browser
  });
  localStorage.setItem(
    WEB_PUSH_SUBSCRIPTION_MIGRATION_STORAGE_KEY,
    WEB_PUSH_SUBSCRIPTION_MIGRATION_VERSION
  );
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
  if (data && isFreshIncomingCallPayload(data)) {
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
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
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
  pushNotificationsEnabled = false;
  pushSessionRevision++;
  const accessToken = getAuthToken() || getChatAuthSession()?.token;
  const apiUrl = getConfig().CHAT_API_DOMAIN.replace(/\/+$/, '');
  // При истёкшей сессии очистка не должна запускать refresh и повторный выход.
  const unregister = async (path: string, body: Record<string, string>) => {
    const response = await withNetworkTimeout(signal =>
      fetch(`${apiUrl}${path}`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(body)
      })
    );
    if (!response.ok) {
      console.warn('Не удалось удалить push-подписку на сервере:', response.status);
    }
  };
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
    // Нативный обработчик проверяет эту сессию даже при закрытом WebView.
    await clearAnyChatBackgroundSyncSession();
    if (Capacitor.isNativePlatform()) {
      const tokens = [...new Set(getStoredNativePushTokens())];

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

      await removePushListeners().catch(error => {
        console.warn('Не удалось удалить обработчики push:', error);
      });

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

      for (const token of tokens) {
        try {
          await unregister('/notifications/device/unregister', { token });
        } catch (error) {
          console.warn('Failed to unregister native push token:', error);
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

    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    const endpoint = subscription?.endpoint || getStoredWebPushEndpoint();

    if (endpoint) {
      try {
        await unregister('/push/unsubscribe', { endpoint });
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

const doesWebPushSubscriptionUseKey = (
  subscription: PushSubscription,
  expectedKey: ArrayBuffer
): boolean | null => {
  const applicationServerKey = subscription.options?.applicationServerKey;
  if (!applicationServerKey) {
    return null;
  }

  const actualBytes = toUint8Array(applicationServerKey);
  const expectedBytes = new Uint8Array(expectedKey);

  if (actualBytes.length !== expectedBytes.length) {
    return false;
  }

  return actualBytes.every((value, index) => value === expectedBytes[index]);
};

const toUint8Array = (value: BufferSource): Uint8Array => {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
};
