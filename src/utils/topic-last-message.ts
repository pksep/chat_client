import type { IMessage } from '../components/interfaces/interfaces';

type TopicLastMessage = Pick<IMessage, 'id' | 'createdAt'>;

const getCreatedAtTimestamp = (message?: TopicLastMessage): number => {
  if (!message?.createdAt) {
    return 0;
  }

  const timestamp = new Date(message.createdAt).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
};

export const resolveLastMessageAfterLocalSync = <T>(
  currentLastMessage: T | undefined,
  localLastMessage: T | undefined,
  hasKnownLocalState: boolean
): T | undefined =>
  hasKnownLocalState ? localLastMessage : currentLastMessage;

export const resolveTopicLastMessage = <T extends TopicLastMessage>(
  serverLastMessage?: T,
  clientLastMessage?: T
): T | undefined => {
  if (!clientLastMessage) {
    return serverLastMessage;
  }

  if (!serverLastMessage || serverLastMessage.id === clientLastMessage.id) {
    return clientLastMessage;
  }

  return getCreatedAtTimestamp(clientLastMessage) >=
    getCreatedAtTimestamp(serverLastMessage)
    ? clientLastMessage
    : serverLastMessage;
};

export const resolveLastMessageStatus = (
  topicLastMessage?: Pick<IMessage, 'id' | 'status'>,
  clientMessage?: Pick<IMessage, 'id' | 'status'>
): IMessage['status'] | undefined =>
  topicLastMessage?.id && clientMessage?.id === topicLastMessage.id
    ? clientMessage.status
    : topicLastMessage?.status;
