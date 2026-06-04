import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  isPermissionGranted,
  onAction,
  removeActive,
  removeAllActive,
  requestPermission,
  sendNotification,
  type Options
} from '@tauri-apps/plugin-notification';
import type {
  IMessage,
  ITopic,
  IUser
} from '../components/interfaces/interfaces';
import { stripHtml } from '../utils/stripHtml';

type TauriNotificationExtra = Record<string, unknown> & {
  callerId?: string | null;
  dialogsId?: string | null;
  groupId?: string | null;
  roomId?: string | null;
  topicId?: string | null;
  topicType?: string | null;
  type?: string | null;
  url?: string | null;
};

interface TauriNotificationPayload {
  body?: string;
  extra?: TauriNotificationExtra;
  group?: string;
  id?: number;
  title: string;
}

const MAX_NOTIFICATION_ID = 2_147_483_647;
const TAURI_NOTIFICATION_CLICK_EVENT = 'sep-chat://notification-click';

let permissionGrantedCache: boolean | null = null;
let isActionListenerBound = false;

export const isTauriRuntime = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

const hashNotificationId = (value: string): number => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash || 1) % MAX_NOTIFICATION_ID;
};

const normalizeTopicType = (
  topicType?: string | null
): 'DM' | 'GROUP' | null => {
  if (!topicType) {
    return null;
  }

  const normalized = topicType.toUpperCase();

  if (normalized === 'GROUP') {
    return 'GROUP';
  }

  if (normalized === 'DM' || normalized === 'DIALOGS') {
    return 'DM';
  }

  return null;
};

const isWindowsEnvironment = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  return /windows/i.test(
    navigatorWithUserAgentData.userAgentData?.platform ||
      navigator.userAgent ||
      ''
  );
};

const parseNotificationPayload = (
  payload?: string | TauriNotificationExtra | null
): TauriNotificationExtra => {
  if (!payload) {
    return {};
  }

  if (typeof payload !== 'string') {
    return payload;
  }

  try {
    const parsedPayload = JSON.parse(payload) as TauriNotificationExtra;

    if (parsedPayload && typeof parsedPayload === 'object') {
      return parsedPayload;
    }
  } catch (error) {
    console.warn('Failed to parse Tauri notification payload:', error);
  }

  return {};
};

const ensureTauriNotificationPermission = async (): Promise<boolean> => {
  if (!isTauriRuntime()) {
    return false;
  }

  if (permissionGrantedCache !== null) {
    return permissionGrantedCache;
  }

  let isGranted = await isPermissionGranted();

  if (!isGranted) {
    const permission = await requestPermission();
    isGranted = permission === 'granted';
  }

  permissionGrantedCache = isGranted;
  return isGranted;
};

const getTopicTitle = (topic?: ITopic | null): string =>
  topic?.name || topic?.user?.initials || 'SEP Chat';

const getSenderTitle = (sender?: IUser | null): string =>
  sender?.initials || 'New message';

const getMessagePreview = (message: IMessage): string => {
  const text = stripHtml(message.text || '');

  if (text) {
    return text;
  }

  if (message.media?.length) {
    return 'Attachment';
  }

  return 'New message';
};

const getMessageNotificationTitle = (
  message: IMessage,
  topic?: ITopic | null,
  sender?: IUser | null
): string => {
  const senderTitle =
    sender?.initials || message.senderUser?.initials || getSenderTitle(sender);
  const topicTitle = getTopicTitle(topic);

  if (normalizeTopicType(topic?.type) === 'GROUP' && topicTitle) {
    return `${senderTitle} in ${topicTitle}`;
  }

  return senderTitle;
};

export const getTauriMessageNotificationId = (topicId: string): number =>
  hashNotificationId(`message:${topicId}`);

export const getTauriCallNotificationId = (topicId: string): number =>
  hashNotificationId(`call:${topicId}`);

const getWindowsMessageNotificationTag = (topicId: string): string =>
  `sep-chat-message-${topicId}`;

const getWindowsCallNotificationTag = (topicId: string): string =>
  `sep-chat-call-${topicId}`;

export const initTauriNotifications = async (
  onNotificationAction?: (payload: TauriNotificationExtra) => void
): Promise<boolean> => {
  if (!isTauriRuntime()) {
    return false;
  }

  await ensureTauriNotificationPermission();

  if (!isActionListenerBound && onNotificationAction) {
    await listen<string>(TAURI_NOTIFICATION_CLICK_EVENT, event => {
      onNotificationAction(parseNotificationPayload(event.payload));
    });

    await onAction(notification => {
      onNotificationAction(
        (notification.extra || {}) as TauriNotificationExtra
      );
    });

    const pendingPayload = await invoke<string | null>(
      'consume_pending_notification_target'
    );

    if (pendingPayload) {
      onNotificationAction(parseNotificationPayload(pendingPayload));
    }

    isActionListenerBound = true;
  }

  return true;
};

export const activateTauriAppWindow = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const isMinimized = await appWindow.isMinimized();

    if (isMinimized) {
      await appWindow.unminimize();
    }

    await appWindow.show();
    await appWindow.setFocus();
  } catch (error) {
    console.warn('Failed to activate Tauri window:', error);
  }
};

export const showTauriNotification = async ({
  body,
  extra,
  group,
  id,
  title
}: TauriNotificationPayload): Promise<boolean> => {
  if (!(await ensureTauriNotificationPermission())) {
    return false;
  }

  if (isWindowsEnvironment()) {
    try {
      return await invoke<boolean>('show_windows_notification', {
        title,
        body: body || null,
        payload: JSON.stringify(extra || {}),
        tag:
          extra?.type === 'incoming_call' && extra.topicId
            ? getWindowsCallNotificationTag(extra.topicId)
            : extra?.topicId
              ? getWindowsMessageNotificationTag(extra.topicId)
              : null,
        group: extra?.topicId || group || null
      });
    } catch (error) {
      console.warn(
        'Failed to show Windows native notification, falling back to plugin:',
        error
      );
    }
  }

  const options: Options = {
    id,
    title,
    body,
    group,
    autoCancel: true,
    extra
  };

  sendNotification(options);
  return true;
};

export const showTauriMessageNotification = async ({
  message,
  sender,
  topic
}: {
  message: IMessage;
  sender?: IUser | null;
  topic?: ITopic | null;
}): Promise<boolean> => {
  if (!message.topicId) {
    return false;
  }

  const resolvedTopicType = normalizeTopicType(topic?.type);
  const isGroupTopic = resolvedTopicType === 'GROUP';

  return showTauriNotification({
    id: getTauriMessageNotificationId(message.topicId),
    title: getMessageNotificationTitle(message, topic, sender),
    body: getMessagePreview(message),
    group: message.topicId,
    extra: {
      dialogsId: !isGroupTopic ? message.topicId : null,
      groupId: isGroupTopic ? message.topicId : null,
      topicId: message.topicId,
      topicType: resolvedTopicType,
      type: 'new_message',
      url: isGroupTopic
        ? `/group/${message.topicId}`
        : `/dialogs/${message.topicId}`
    }
  });
};

export const showTauriIncomingCallNotification = async ({
  caller,
  roomId,
  topic,
  topicId,
  topicType
}: {
  caller?: IUser | null;
  roomId?: string | null;
  topic?: ITopic | null;
  topicId?: string | null;
  topicType?: string | null;
}): Promise<boolean> => {
  const targetTopicId = topicId || topic?.id || roomId;

  if (!targetTopicId) {
    return false;
  }

  const resolvedTopicType = normalizeTopicType(topicType || topic?.type);
  const isGroupTopic = resolvedTopicType === 'GROUP';
  const callerTitle = caller?.initials || 'Incoming call';
  const topicTitle = isGroupTopic ? getTopicTitle(topic) : '';

  return showTauriNotification({
    id: getTauriCallNotificationId(targetTopicId),
    title: topicTitle ? `Call: ${topicTitle}` : 'Incoming call',
    body: topicTitle ? callerTitle : `From ${callerTitle}`,
    group: targetTopicId,
    extra: {
      callerId: caller?.id,
      dialogsId: !isGroupTopic ? targetTopicId : null,
      groupId: isGroupTopic ? targetTopicId : null,
      roomId,
      topicId: targetTopicId,
      topicType: resolvedTopicType,
      type: 'incoming_call',
      url: isGroupTopic
        ? `/group/${targetTopicId}`
        : `/dialogs/${targetTopicId}`
    }
  });
};

export const clearTauriTopicNotifications = async (
  topicId?: string | null
): Promise<void> => {
  if (!topicId || !isTauriRuntime()) {
    return;
  }

  try {
    await removeActive([
      { id: getTauriMessageNotificationId(topicId) },
      { id: getTauriCallNotificationId(topicId) }
    ]);

    if (isWindowsEnvironment()) {
      await invoke<boolean>('clear_windows_topic_notifications', {
        topicId
      }).catch(error => {
        console.warn('Failed to clear Windows native notifications:', error);
      });
    }
  } catch (error) {
    console.warn('Failed to clear Tauri notifications for topic:', error);
  }
};

export const clearAllTauriNotifications = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await removeAllActive();
  } catch (error) {
    console.warn('Failed to clear Tauri notifications:', error);
  }
};
