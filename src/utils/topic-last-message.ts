import type { IMessage } from '../components/interfaces/interfaces';

export const resolveLastMessageAfterLocalSync = <T>(
  currentLastMessage: T | undefined,
  localLastMessage: T | undefined,
  hasKnownLocalState: boolean
): T | undefined =>
  hasKnownLocalState ? localLastMessage : currentLastMessage;

export const resolveLastMessageStatus = (
  topicLastMessage?: Pick<IMessage, 'id' | 'status'>,
  clientMessage?: Pick<IMessage, 'id' | 'status'>
): IMessage['status'] | undefined =>
  topicLastMessage?.id && clientMessage?.id === topicLastMessage.id
    ? clientMessage.status
    : topicLastMessage?.status;
