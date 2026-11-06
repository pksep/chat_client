import type { IMessage } from '../components/interfaces/interfaces';
import { MessageStatus } from '../services/useChatSDK/types';
import { getMessageDisplayStatus } from './message-delivery-status';

type IsOutgoingMessage = (message: IMessage) => boolean;

export const getLatestReadOutgoingMessageIndex = (
  messages: IMessage[],
  isOutgoingMessage: IsOutgoingMessage
): number => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (isOutgoingMessage(message) && message.status === MessageStatus.Read) {
      return index;
    }
  }

  return -1;
};

export const shouldDisplayMessageAsRead = (
  message: IMessage,
  messageIndex: number,
  latestReadOutgoingMessageIndex: number,
  isOutgoingMessage: IsOutgoingMessage
): boolean =>
  message.deliveryState
    ? getMessageDisplayStatus(message) === MessageStatus.Read
    : message.status === MessageStatus.Read ||
      (message.status === MessageStatus.Delivery &&
        isOutgoingMessage(message) &&
        messageIndex < latestReadOutgoingMessageIndex);
