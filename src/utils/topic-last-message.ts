import type { IMessage } from '../components/interfaces/interfaces';
import { MessageStatus } from '../services/useChatSDK/types';

type MessageStatusSnapshot = Pick<IMessage, 'id'> &
  Partial<Pick<IMessage, 'status'>>;
type TopicLastMessage = Pick<IMessage, 'createdAt'> & MessageStatusSnapshot;

export const resolveLastMessageStatus = (
  topicLastMessage?: MessageStatusSnapshot,
  clientMessage?: MessageStatusSnapshot
): IMessage['status'] | undefined => {
  if (!topicLastMessage?.id || clientMessage?.id !== topicLastMessage.id) {
    return topicLastMessage?.status;
  }

  // Подтверждённая доставка и прочтение не отменяются устаревшим снимком.
  const statuses = [topicLastMessage.status, clientMessage.status];
  if (statuses.includes(MessageStatus.Read)) return MessageStatus.Read;
  if (statuses.includes(MessageStatus.Delivery)) return MessageStatus.Delivery;
  return clientMessage.status ?? topicLastMessage.status;
};

const preserveConfirmedStatus = <T extends MessageStatusSnapshot>(
  currentMessage: T | undefined,
  nextMessage: T | undefined
): T | undefined => {
  if (
    !nextMessage ||
    !currentMessage?.id ||
    currentMessage.id !== nextMessage.id
  )
    return nextMessage;
  const status = resolveLastMessageStatus(currentMessage, nextMessage);
  return status === nextMessage.status
    ? nextMessage
    : { ...nextMessage, status };
};

const getCreatedAtTimestamp = (message?: TopicLastMessage): number => {
  if (!message?.createdAt) {
    return 0;
  }

  const timestamp = new Date(message.createdAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const resolveLastMessageAfterLocalSync = <
  T extends MessageStatusSnapshot
>(
  currentLastMessage: T | undefined,
  localLastMessage: T | undefined,
  hasKnownLocalState: boolean
): T | undefined =>
  hasKnownLocalState
    ? preserveConfirmedStatus(currentLastMessage, localLastMessage)
    : currentLastMessage;

export const resolveTopicLastMessage = <T extends TopicLastMessage>(
  serverLastMessage?: T,
  clientLastMessage?: T
): T | undefined => {
  if (!clientLastMessage) {
    return serverLastMessage;
  }

  if (!serverLastMessage || serverLastMessage.id === clientLastMessage.id) {
    return preserveConfirmedStatus(serverLastMessage, clientLastMessage);
  }

  return getCreatedAtTimestamp(clientLastMessage) >=
    getCreatedAtTimestamp(serverLastMessage)
    ? clientLastMessage
    : serverLastMessage;
};
