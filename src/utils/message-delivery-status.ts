import type {
  IMessage,
  IMessageDeliveryState,
  IMessageReceipt,
  ITopic
} from '../components/interfaces/interfaces';
import { MessageStatus } from '../services/useChatSDK/types';

export const mergeMessageReceipts = (
  ...lists: (IMessageReceipt[] | undefined)[]
): IMessageReceipt[] => {
  const receipts = new Map<string, IMessageReceipt>();
  lists.forEach(list =>
    list?.forEach(receipt => {
      const previous = receipts.get(receipt.userId);
      if (
        !previous ||
        (receipt.createdAt &&
          (!previous.createdAt ||
            new Date(receipt.createdAt).getTime() <
              new Date(previous.createdAt).getTime()))
      ) {
        receipts.set(receipt.userId, receipt);
      }
    })
  );
  return [...receipts.values()];
};

export const mergeMessageDeliveryState = (
  previous?: IMessageDeliveryState,
  next?: IMessageDeliveryState
): IMessageDeliveryState | undefined => {
  if (!previous) return next;
  if (!next) return previous;
  return {
    recipientUserIds: next.recipientUserIds,
    delivered: mergeMessageReceipts(previous.delivered, next.delivered),
    read: mergeMessageReceipts(previous.read, next.read)
  };
};

export const getMessageRecipients = (
  message: IMessage,
  topic?: ITopic
): string[] =>
  [
    ...new Set(
      message.deliveryState?.recipientUserIds ?? [
        ...(topic?.members?.map(member => member.id) || []),
        topic?.user?.id,
        ...(message.messageRead?.map(receipt => receipt.userId) || [])
      ]
    )
  ].filter((id): id is string => !!id && id !== message.senderUserId);

export const getMessageReadReceipts = (message: IMessage): IMessageReceipt[] =>
  mergeMessageReceipts(
    message.deliveryState?.read,
    message.messageRead?.map(receipt => ({
      userId: receipt.userId,
      createdAt: receipt.createdAt || receipt.updatedAt
    }))
  );

export const getRecipientMessageStatus = (
  message: IMessage,
  userId: string
): MessageStatus => {
  if (
    getMessageReadReceipts(message).some(receipt => receipt.userId === userId)
  )
    return MessageStatus.Read;
  if (
    message.deliveryState?.delivered.some(receipt => receipt.userId === userId)
  )
    return MessageStatus.Delivery;
  return MessageStatus.Sent;
};

export const getMessageDisplayStatus = (message: IMessage): string => {
  if (
    !message.deliveryState ||
    message.status === MessageStatus.Wait ||
    message.status === MessageStatus.NotDelivered
  )
    return message.status;

  const recipients = getMessageRecipients(message);
  if (!recipients.length) return MessageStatus.Read;
  const read = new Set(
    getMessageReadReceipts(message).map(receipt => receipt.userId)
  );
  if (recipients.every(id => read.has(id))) return MessageStatus.Read;
  const delivered = new Set([
    ...read,
    ...message.deliveryState.delivered.map(receipt => receipt.userId)
  ]);
  return recipients.every(id => delivered.has(id))
    ? MessageStatus.Delivery
    : MessageStatus.Sent;
};
