import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { navigateToDialogs, navigateToGroup } from '../composables/navigation';
import {
  RouteTypes,
  currentRoute
} from '../composables/navigation/useUrlRouting';

type NotificationTopicType = 'DM' | 'GROUP' | null;

export interface NotificationNavigationPayload {
  topicId?: string | null;
  topicType?: string | null;
  url?: string | null;
  link?: string | null;
  tag?: string | null;
  chatId?: string | null;
  dialogsId?: string | null;
  groupId?: string | null;
}

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

const resolveNotificationTarget = (payload: NotificationNavigationPayload) => {
  const directUrl = payload.url || payload.link || null;
  const parsedFromUrl = extractTopicFromUrl(directUrl);
  const topicId = resolveNotificationTopicId(payload) || parsedFromUrl.topicId;
  const topicType =
    normalizeTopicType(payload.topicType) || parsedFromUrl.topicType;

  return {
    topicId,
    topicType,
    url: directUrl || buildNotificationTargetUrl(topicId, topicType)
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

  if (!target.topicId && !directUrl) {
    return false;
  }

  if (!target.topicId) {
    if (target.url) {
      window.location.assign(target.url);
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
  if (!('serviceWorker' in navigator)) {
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

export const clearTopicNotifications = async (
  topicId?: string | null
): Promise<void> => {
  if (!topicId) {
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const delivered = await PushNotifications.getDeliveredNotifications();
      const matchingNotifications = delivered.notifications.filter(
        notification =>
          resolveNotificationTopicId({
            topicId: notification.data?.topicId,
            chatId: notification.data?.chatId,
            dialogsId: notification.data?.dialogsId,
            groupId: notification.data?.groupId,
            tag: notification.tag || notification.data?.tag,
            url: notification.link || notification.data?.url,
            link:
              notification.click_action ||
              notification.data?.link ||
              notification.data?.click_action
          }) === topicId
      );

      if (matchingNotifications.length > 0) {
        await PushNotifications.removeDeliveredNotifications({
          notifications: matchingNotifications
        });
      }
    } catch (error) {
      console.warn('Failed to clear native notifications for topic:', error);
    }

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
    !document.hidden &&
    document.hasFocus()
  );
};
