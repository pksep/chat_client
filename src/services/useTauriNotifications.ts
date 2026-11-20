import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  onAction,
  removeActive,
  removeAllActive,
  sendNotification,
  type Options
} from '@tauri-apps/plugin-notification';
import type {
  IMessage,
  ITopic,
  IUser
} from '../components/interfaces/interfaces';
import { stripHtml } from '../utils/stripHtml';
import { getStickerMessagePreview } from '../utils/stickers';
import { ensureStickerMessageMetadata } from './sticker-catalog';
import { getNotificationAttachmentPreview } from '../utils/notification-attachments';
import { getChatAuthSession } from '../utils/stored-chat-session';
import { ensureDesktopNotificationPermission } from './desktop-notification-permissions';

type TauriNotificationExtra = Record<string, unknown> & {
  callerId?: string | null;
  dialogsId?: string | null;
  groupId?: string | null;
  messageId?: string | null;
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

let isActionListenerBound = false;
const activeMessageNotificationIdsByTopic = new Map<string, string>();
const activeCallNotificationRoomsByTopic = new Map<string, string | null>();

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

  return ensureDesktopNotificationPermission();
};

const getTopicTitle = (topic?: ITopic | null): string =>
  topic?.name || topic?.user?.initials || 'СЭП Чат';

const getSenderTitle = (sender?: IUser | null): string =>
  sender?.initials || 'Новое сообщение';

const getMessagePreview = (message: IMessage): string => {
  const sticker = getStickerMessagePreview(message.ex, message.text);
  if (sticker) return sticker;
  const text = stripHtml(message.text || '');

  const attachments = getNotificationAttachmentPreview(message.media);
  return [text, attachments].filter(Boolean).join('\n') || 'Новое сообщение';
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
    return `${senderTitle} в ${topicTitle}`;
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

    // Windows использует собственный toast callback. API действий плагина
    // реализован только на мобильных платформах и не должен срывать запуск.
    if (!isWindowsEnvironment()) {
      await onAction(notification => {
        onNotificationAction(
          (notification.extra || {}) as TauriNotificationExtra
        );
      }).catch(error => {
        console.warn(
          'Действия уведомлений недоступны на этой платформе:',
          error
        );
      });
    }

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

  if (!isTauriRuntime()) return false;
  await ensureStickerMessageMetadata(message.ex);

  const resolvedTopicType = normalizeTopicType(topic?.type);
  const isGroupTopic = resolvedTopicType === 'GROUP';

  const wasShown = await showTauriNotification({
    id: getTauriMessageNotificationId(message.topicId),
    title: getMessageNotificationTitle(message, topic, sender),
    body: getMessagePreview(message),
    group: message.topicId,
    extra: {
      dialogsId: !isGroupTopic ? message.topicId : null,
      groupId: isGroupTopic ? message.topicId : null,
      messageId: message.id,
      accountId: getChatAuthSession()?.user?.id,
      replyClientId: crypto.randomUUID(),
      topicId: message.topicId,
      topicType: resolvedTopicType,
      type: 'new_message',
      url: isGroupTopic
        ? `/group/${message.topicId}`
        : `/dialogs/${message.topicId}`
    }
  });

  if (wasShown) {
    activeMessageNotificationIdsByTopic.set(message.topicId, message.id);
  }

  return wasShown;
};

export const clearTauriMessageNotification = async (
  topicId?: string | null,
  messageId?: string | null
): Promise<void> => {
  if (!messageId || !isTauriRuntime()) {
    return;
  }

  const resolvedTopicId =
    topicId ||
    Array.from(activeMessageNotificationIdsByTopic.entries()).find(
      ([, activeMessageId]) => activeMessageId === messageId
    )?.[0];

  if (!resolvedTopicId) {
    return;
  }

  const activeMessageId =
    activeMessageNotificationIdsByTopic.get(resolvedTopicId);

  if (activeMessageId && activeMessageId !== messageId) {
    return;
  }

  try {
    if (isWindowsEnvironment()) {
      await invoke<boolean>('clear_windows_topic_notifications', {
        topicId: resolvedTopicId,
        messagesOnly: true
      });
    } else {
      await removeActive([
        { id: getTauriMessageNotificationId(resolvedTopicId) }
      ]);
    }
    activeMessageNotificationIdsByTopic.delete(resolvedTopicId);
  } catch (error) {
    console.warn('Failed to clear Tauri message notification:', error);
  }
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
  const callerTitle = caller?.initials || 'Неизвестный абонент';
  const topicTitle = isGroupTopic ? getTopicTitle(topic) : '';

  activeCallNotificationRoomsByTopic.set(targetTopicId, roomId || null);
  return showTauriNotification({
    id: getTauriCallNotificationId(targetTopicId),
    title: topicTitle ? `Входящий звонок: ${topicTitle}` : 'Входящий звонок',
    body: callerTitle,
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

export const clearTauriCallNotification = async (
  topicId?: string | null,
  roomId?: string | null
): Promise<void> => {
  if (!topicId || !isTauriRuntime()) return;
  const activeRoom = activeCallNotificationRoomsByTopic.get(topicId);
  if (roomId && activeRoom && roomId !== activeRoom) return;
  activeCallNotificationRoomsByTopic.delete(topicId);
  try {
    if (isWindowsEnvironment()) {
      await invoke('clear_windows_topic_notifications', {
        topicId,
        callsOnly: true
      });
    } else {
      await removeActive([{ id: getTauriCallNotificationId(topicId) }]);
    }
  } catch (error) {
    console.warn('Не удалось убрать уведомление о звонке:', error);
  }
};

export const clearTauriTopicNotifications = async (
  topicId?: string | null
): Promise<void> => {
  if (!topicId || !isTauriRuntime()) {
    return;
  }

  try {
    activeMessageNotificationIdsByTopic.delete(topicId);
    activeCallNotificationRoomsByTopic.delete(topicId);
    if (isWindowsEnvironment()) {
      await invoke<boolean>('clear_windows_topic_notifications', {
        topicId
      });
    } else {
      await removeActive([
        { id: getTauriMessageNotificationId(topicId) },
        { id: getTauriCallNotificationId(topicId) }
      ]);
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
    activeMessageNotificationIdsByTopic.clear();
    activeCallNotificationRoomsByTopic.clear();
    if (isWindowsEnvironment()) {
      await invoke<boolean>('clear_all_windows_notifications');
    } else {
      await removeAllActive();
    }
  } catch (error) {
    console.warn('Failed to clear Tauri notifications:', error);
  }
};
