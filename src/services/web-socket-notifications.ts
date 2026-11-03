import { Capacitor } from '@capacitor/core';
import type {
  IMessage,
  ITopic,
  IUser
} from '../components/interfaces/interfaces';
import { isTauriRuntime } from './useTauriNotifications';
import { isChatSessionEnding } from '../composables/useAuth';
import { getChatAuthSession } from '../utils/stored-chat-session';
import { stripHtml } from '../utils/stripHtml';
import { getStickerMessagePreview } from '../utils/stickers';
import { getTelemetryErrorPayload, recordTelemetryEvent } from './useTelemetry';

export const showWebSocketMessageNotification = async ({
  message,
  sender,
  topic
}: {
  message: IMessage;
  sender?: IUser | null;
  topic: ITopic;
}): Promise<void> => {
  if (
    Capacitor.isNativePlatform() ||
    isTauriRuntime() ||
    isChatSessionEnding() ||
    !('Notification' in window) ||
    Notification.permission !== 'granted' ||
    !('serviceWorker' in navigator)
  )
    return;

  const session = getChatAuthSession();
  if (!session?.token) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (
      !registration?.active?.scriptURL.endsWith('/service-worker.js') ||
      isChatSessionEnding() ||
      getChatAuthSession()?.token !== session.token
    )
      return;
    const isGroup = String(topic.type).toUpperCase() === 'GROUP';
    const senderName = sender?.initials || message.senderUser?.initials;
    const topicName = topic.name || topic.user?.initials || 'SEP Chat';
    const body =
      getStickerMessagePreview(message.ex, message.text) ||
      stripHtml(message.text || '') ||
      (message.media?.length ? 'Вложение' : 'Новое сообщение');
    // Активный сокет может исключать пользователя из серверной рассылки push.
    // Общий worker проверяет открытый чат и устраняет повторы между вкладками.
    registration.active.postMessage({
      type: 'SOCKET_MESSAGE_NOTIFICATION',
      payload: {
        title:
          isGroup && senderName ? `${senderName} · ${topicName}` : topicName,
        body,
        topicId: message.topicId,
        messageId: message.id,
        topicType: isGroup ? 'GROUP' : 'DM',
        url: `/${isGroup ? 'group' : 'dialogs'}/${message.topicId}`,
        sentAt: new Date(message.createdAt).getTime(),
        type: 'new_message'
      }
    });
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.web.socket_forwarded',
      entityType: 'message',
      entityId: message.id,
      payload: { topicId: message.topicId }
    });
  } catch (error) {
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.web.socket_failed',
      level: 'warn',
      entityType: 'message',
      entityId: message.id,
      payload: { topicId: message.topicId, ...getTelemetryErrorPayload(error) }
    });
  }
};
