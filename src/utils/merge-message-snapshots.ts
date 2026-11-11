import type { IMessage } from '../components/interfaces/interfaces';
import { getMessageClientId, isTemporaryMessage } from './message-identity';
import { resolveLastMessageStatus } from './topic-last-message';
import { mergeMessageDeliveryState } from './message-delivery-status';

const version = (message: IMessage): number =>
  Math.max(
    0,
    ...[message.updatedAt, message.deletedAt, message.createdAt].map(value => {
      const timestamp = value ? new Date(value).getTime() : 0;
      return Number.isFinite(timestamp) ? timestamp : 0;
    })
  );

export const mergeMessageSnapshots = (messages: IMessage[]): IMessage[] => {
  const byId = new Map<string, IMessage>();
  messages.forEach(message => {
    if (!message.id) return;
    const previous = byId.get(message.id);
    if (!previous) {
      byId.set(message.id, message);
      return;
    }
    const next = version(message) >= version(previous) ? message : previous;
    const status = resolveLastMessageStatus(previous, message);
    byId.set(message.id, {
      ...previous,
      ...next,
      status,
      deliveryState: mergeMessageDeliveryState(
        previous.deliveryState,
        message.deliveryState
      ),
      ...(previous.isReadByMe || message.isReadByMe
        ? { isReadByMe: true }
        : {}),
      ...(previous.isRead || message.isRead ? { isRead: true } : {})
    });
  });

  byId.forEach(message => {
    const clientId = getMessageClientId(message);
    if (!clientId || isTemporaryMessage(message)) return;
    const pending = byId.get(clientId);
    if (
      pending &&
      isTemporaryMessage(pending) &&
      pending.topicId === message.topicId &&
      pending.senderUserId === message.senderUserId
    ) {
      byId.delete(clientId);
    }
  });
  return [...byId.values()];
};
