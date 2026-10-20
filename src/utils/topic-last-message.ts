import type { IMessage } from '../components/interfaces/interfaces';
import { MessageStatus } from '../services/useChatSDK/types';
import {
  isSameMessage,
  isTemporaryMessage,
  type MessageIdentity
} from './message-identity';

type MessageStatusSnapshot = MessageIdentity &
  Pick<IMessage, 'id'> &
  Partial<Pick<IMessage, 'status'>>;
type TopicLastMessage = Pick<IMessage, 'createdAt'> & MessageStatusSnapshot;

export const resolveLastMessageStatus = (
  topicLastMessage?: MessageStatusSnapshot,
  clientMessage?: MessageStatusSnapshot
): IMessage['status'] | undefined => {
  if (!isSameMessage(topicLastMessage, clientMessage)) {
    return topicLastMessage?.status;
  }

  // Подтверждённая доставка и прочтение не отменяются устаревшим снимком.
  const statuses = [topicLastMessage?.status, clientMessage?.status];
  if (statuses.includes(MessageStatus.Read)) return MessageStatus.Read;
  if (statuses.includes(MessageStatus.Delivery)) return MessageStatus.Delivery;
  return clientMessage?.status ?? topicLastMessage?.status;
};

const preserveConfirmedStatus = <T extends MessageStatusSnapshot>(
  currentMessage: T | undefined,
  nextMessage: T | undefined
): T | undefined => {
  if (!nextMessage || !isSameMessage(currentMessage, nextMessage))
    return nextMessage;
  const status = resolveLastMessageStatus(currentMessage, nextMessage);
  const canonical =
    isTemporaryMessage(nextMessage) &&
    currentMessage &&
    !isTemporaryMessage(currentMessage)
      ? currentMessage
      : nextMessage;
  return status === canonical.status ? canonical : { ...canonical, status };
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

  if (!serverLastMessage) return clientLastMessage;

  if (isSameMessage(serverLastMessage, clientLastMessage)) {
    if (
      isTemporaryMessage(clientLastMessage) &&
      !isTemporaryMessage(serverLastMessage)
    ) {
      return preserveConfirmedStatus(clientLastMessage, serverLastMessage);
    }
    return preserveConfirmedStatus(serverLastMessage, clientLastMessage);
  }

  return getCreatedAtTimestamp(clientLastMessage) >=
    getCreatedAtTimestamp(serverLastMessage)
    ? clientLastMessage
    : serverLastMessage;
};
