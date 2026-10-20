import { parseMessageEx } from './messageReplyQuote';

export type MessageIdentity = {
  id?: string | null;
  ex?: unknown;
  topicId?: string;
  senderUserId?: string;
};

export const getMessageClientId = (
  message?: MessageIdentity
): string | null => {
  const clientId = parseMessageEx(message?.ex).clientId;
  return typeof clientId === 'string' && clientId ? clientId : null;
};

export const isTemporaryMessage = (message?: MessageIdentity): boolean =>
  !!message?.id && message.id === getMessageClientId(message);

export const getMessageRenderKeys = (
  messages: MessageIdentity[]
): Map<string, string> => {
  const counts = new Map<string, number>();
  messages.forEach(message => {
    const clientId = getMessageClientId(message);
    if (clientId) counts.set(clientId, (counts.get(clientId) || 0) + 1);
  });
  return new Map(
    messages
      .filter(message => !!message.id)
      .map(message => {
        const clientId = getMessageClientId(message);
        return [
          message.id!,
          clientId && counts.get(clientId) === 1
            ? `client:${clientId}`
            : `id:${message.id}`
        ];
      })
  );
};

export const pendingMessageTombstone = (clientId: string): string =>
  `pending:${clientId}`;

export const isMessageIdDeleted = (
  message: MessageIdentity,
  deletedIds?: Set<string>
): boolean =>
  !!message.id &&
  (!!deletedIds?.has(message.id) ||
    (isTemporaryMessage(message) &&
      !!deletedIds?.has(pendingMessageTombstone(message.id))));

export const isSameMessage = (
  left?: MessageIdentity,
  right?: MessageIdentity
): boolean => {
  if (!left?.id || !right?.id) return false;
  if (left.id === right.id) return true;
  if (
    (left.topicId && right.topicId && left.topicId !== right.topicId) ||
    (left.senderUserId &&
      right.senderUserId &&
      left.senderUserId !== right.senderUserId)
  )
    return false;
  // clientId связывает локальную очередь с подтверждением. Два разных
  // серверных ID сохраняют собственные реакции, ответы и операции удаления.
  return (
    (isTemporaryMessage(left) && left.id === getMessageClientId(right)) ||
    (isTemporaryMessage(right) && right.id === getMessageClientId(left))
  );
};
