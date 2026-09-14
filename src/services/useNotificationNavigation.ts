import { Capacitor } from '@capacitor/core';
import { shallowRef } from 'vue';
import { navigateToDialogs, navigateToGroup } from '../composables/navigation';
import {
  RouteTypes,
  currentRoute
} from '../composables/navigation/useUrlRouting';
import {
  activateTauriAppWindow,
  clearTauriMessageNotification,
  clearTauriTopicNotifications,
  isTauriRuntime
} from './useTauriNotifications';
import { getIsAppActivelyVisible } from './useAppVisibility';
import { RuStorePush } from './nativePush';

type NotificationTopicType = 'DM' | 'GROUP' | null;

export interface NotificationTopicRefreshRequest {
  id: number;
  topicId: string;
  scrollToBottom: boolean;
  messageId?: string;
}

let notificationTopicRefreshRequestId = 0;
export const notificationTopicRefreshRequest =
  shallowRef<NotificationTopicRefreshRequest | null>(null);

export const consumeNotificationTopicRefreshRequest = (
  topicId: string,
  requestId: number
): boolean => {
  const request = notificationTopicRefreshRequest.value;

  if (request?.topicId !== topicId || request.id !== requestId) {
    return false;
  }

  notificationTopicRefreshRequest.value = null;
  return true;
};

export const hasPendingForcedNotificationTopicRefresh = (
  topicId?: string | null
): boolean => {
  const request = notificationTopicRefreshRequest.value;

  return Boolean(
    topicId && request?.topicId === topicId && request.scrollToBottom === true
  );
};

export const requestNotificationTopicRefresh = (
  topicId: string,
  scrollToBottom = false,
  messageId?: string | null
): void => {
  const pendingRequest = notificationTopicRefreshRequest.value;

  notificationTopicRefreshRequest.value = {
    id: ++notificationTopicRefreshRequestId,
    topicId,
    scrollToBottom:
      scrollToBottom ||
      (pendingRequest?.topicId === topicId &&
        pendingRequest?.scrollToBottom === true),
    ...(messageId
      ? { messageId }
      : pendingRequest?.topicId === topicId && pendingRequest.messageId
        ? { messageId: pendingRequest.messageId }
        : {})
  };
};

export interface NotificationNavigationPayload {
  topicId?: string | null;
  topicType?: string | null;
  url?: string | null;
  link?: string | null;
  tag?: string | null;
  chatId?: string | null;
  dialogsId?: string | null;
  groupId?: string | null;
  messageId?: string | null;
  message?: { id?: string | null } | null;
  data?: {
    messageId?: string | null;
    message?: { id?: string | null } | null;
  } | null;
}

export const resolveNotificationMessageId = (
  payload?: NotificationNavigationPayload | null
): string | null => {
  const messageId =
    payload?.messageId ||
    payload?.message?.id ||
    payload?.data?.messageId ||
    payload?.data?.message?.id;

  return messageId ? String(messageId) : null;
};

const normalizeTopicType = (
  topicType?: string | null
): NotificationTopicType => {
  if (!topicType) {
    return null;
  }

  const normalized = topicType.toUpperCase();

  if (normalized === 'DM' || normalized === 'DIALOGS') {
    return 'DM';
  }

  if (normalized === 'GROUP') {
    return 'GROUP';
  }

  return null;
};

const extractTopicFromUrl = (
  url?: string | null
): { topicId: string | null; topicType: NotificationTopicType } => {
  if (!url) {
    return { topicId: null, topicType: null };
  }

  try {
    const parsedUrl = new URL(url, window.location.origin);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      const [routeType, topicId] = pathParts;

      if (routeType === RouteTypes.DIALOGS) {
        return { topicId, topicType: 'DM' };
      }

      if (routeType === RouteTypes.GROUP) {
        return { topicId, topicType: 'GROUP' };
      }
    }
  } catch (error) {
    console.warn('Failed to parse notification URL:', error);
  }

  return { topicId: null, topicType: null };
};

const localizeUrlToCurrentClient = (url?: string | null): string | null => {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url, window.location.origin);

    if (parsedUrl.origin !== window.location.origin) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }

    return parsedUrl.toString();
  } catch (error) {
    console.warn('Failed to normalize notification URL:', error);
    return null;
  }
};

const resolveNotificationTarget = (payload: NotificationNavigationPayload) => {
  const directUrl = payload.url || payload.link || null;
  const parsedFromUrl = extractTopicFromUrl(directUrl);
  const topicId = resolveNotificationTopicId(payload) || parsedFromUrl.topicId;
  const topicType =
    normalizeTopicType(payload.topicType) || parsedFromUrl.topicType;

  return {
    topicId,
    topicType,
    url: topicId
      ? buildNotificationTargetUrl(topicId, topicType)
      : localizeUrlToCurrentClient(directUrl)
  };
};

export const resolveNotificationTopicId = (
  payload?: NotificationNavigationPayload | null
): string | null => {
  if (!payload) {
    return null;
  }

  const directTopicId =
    payload.topicId ||
    payload.chatId ||
    payload.dialogsId ||
    payload.groupId ||
    null;

  if (directTopicId) {
    return directTopicId;
  }

  if (payload.tag && payload.tag !== 'chat-message') {
    return payload.tag;
  }

  return extractTopicFromUrl(payload.url || payload.link || null).topicId;
};

export const buildNotificationTargetUrl = (
  topicId?: string | null,
  topicType?: string | null
): string => {
  const normalizedType = normalizeTopicType(topicType);

  if (!topicId) {
    return '/';
  }

  if (normalizedType === 'GROUP') {
    return `/group/${topicId}`;
  }

  return `/dialogs/${topicId}`;
};

export const navigateToNotificationTarget = (
  payload: NotificationNavigationPayload
): boolean => {
  const target = resolveNotificationTarget(payload);
  const directUrl = payload.url || payload.link;
  const targetUrl =
    target.url || buildNotificationTargetUrl(target.topicId, target.topicType);

  if (!target.topicId && !directUrl) {
    return false;
  }

  if (target.topicId) {
    requestNotificationTopicRefresh(
      target.topicId,
      true,
      resolveNotificationMessageId(payload)
    );
  }

  if (isTauriRuntime()) {
    void (async () => {
      await activateTauriAppWindow();

      if (target.topicId) {
        if (target.topicType === 'GROUP') {
          navigateToGroup(target.topicId);
        } else {
          navigateToDialogs(target.topicId);
        }

        const absoluteUrl = new URL(
          buildNotificationTargetUrl(target.topicId, target.topicType),
          window.location.origin
        ).toString();

        if (window.location.href !== absoluteUrl) {
          window.history.replaceState({}, document.title, absoluteUrl);
        }

        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      if (!targetUrl) {
        return;
      }

      const absoluteUrl = new URL(targetUrl, window.location.origin).toString();

      if (window.location.href !== absoluteUrl) {
        window.history.replaceState({}, document.title, absoluteUrl);
      }

      window.dispatchEvent(new PopStateEvent('popstate'));
    })();

    if (target.topicId) {
      void clearTopicNotifications(target.topicId);
    }

    return true;
  }

  if (!target.topicId) {
    if (target.url) {
      window.location.assign(
        new URL(target.url, window.location.origin).toString()
      );
      return true;
    }

    return false;
  }

  if (target.topicType === 'GROUP') {
    navigateToGroup(target.topicId);
  } else {
    navigateToDialogs(target.topicId);
  }

  void clearTopicNotifications(target.topicId);

  return true;
};

export const syncNotificationContext = async (params: {
  focused: boolean;
  topicId?: string | null;
}) => {
  if (isTauriRuntime() || !('serviceWorker' in navigator)) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const activeWorker =
    navigator.serviceWorker.controller ||
    registration.active ||
    registration.waiting;

  activeWorker?.postMessage({
    type: 'APP_CONTEXT',
    focused: params.focused,
    topicId: params.topicId || null
  });
};

const pendingNativeTopicClears = new Map<
  string,
  { repeat: boolean; promise: Promise<void> }
>();

export const clearTopicNotifications = async (
  topicId?: string | null
): Promise<void> => {
  if (!topicId) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') {
      const pending = pendingNativeTopicClears.get(topicId);
      if (pending) {
        pending.repeat = true;
        return pending.promise;
      }
      const task = { repeat: false, promise: Promise.resolve() };
      pendingNativeTopicClears.set(topicId, task);
      task.promise = (async () => {
        try {
          do {
            task.repeat = false;
            await RuStorePush.clearNotificationsForTopic({ topicId });
          } while (task.repeat);
        } catch (error) {
          console.warn(
            'Failed to clear RuStore notifications for topic:',
            error
          );
        } finally {
          pendingNativeTopicClears.delete(topicId);
        }
      })();
      return task.promise;
    }

    return;
  }

  if (isTauriRuntime()) {
    await clearTauriTopicNotifications(topicId);
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const activeWorker =
      navigator.serviceWorker.controller ||
      registration.active ||
      registration.waiting;

    activeWorker?.postMessage({
      type: 'CLEAR_TOPIC_NOTIFICATIONS',
      topicId
    });
  } catch (error) {
    console.warn('Failed to clear web notifications for topic:', error);
  }
};

export const clearMessageNotification = async (
  topicId?: string | null,
  messageId?: string | null
): Promise<void> => {
  if (!messageId) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() === 'android') {
      if (!topicId) {
        return;
      }

      try {
        await RuStorePush.clearNotificationForMessage({
          topicId,
          messageId
        });
      } catch (error) {
        console.warn(
          'Failed to clear RuStore notification for message:',
          error
        );
      }

      return;
    }

    return;
  }

  if (isTauriRuntime()) {
    await clearTauriMessageNotification(topicId, messageId);
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const activeWorker =
      navigator.serviceWorker.controller ||
      registration.active ||
      registration.waiting;

    activeWorker?.postMessage({
      type: 'CLEAR_MESSAGE_NOTIFICATION',
      topicId,
      messageId
    });
  } catch (error) {
    console.warn('Failed to clear web notification for message:', error);
  }
};

export const isTopicCurrentlyVisible = (topicId?: string | null): boolean => {
  if (!topicId) {
    return false;
  }

  const routeType = currentRoute.value.type;
  const isChatRoute =
    routeType === RouteTypes.DIALOGS || routeType === RouteTypes.GROUP;

  return (
    isChatRoute &&
    currentRoute.value.id === topicId &&
    getIsAppActivelyVisible()
  );
};
