import type { IMessage } from '../components/interfaces/interfaces';

export const getMessageIdDiagnostic = (messageIds: string[]) => ({
  messageCount: messageIds.length,
  firstMessageId: messageIds[0] || null,
  lastMessageId: messageIds.at(-1) || null,
  messageIds:
    messageIds.length > 24
      ? [...messageIds.slice(0, 12), ...messageIds.slice(-12)]
      : messageIds,
  messageIdsTruncated: messageIds.length > 24
});

export const getMessageRangeDiagnostic = (
  messages: IMessage[],
  latestKnownMessageId?: string
) => ({
  ...getMessageIdDiagnostic(messages.map(message => message.id)),
  firstMessageCreatedAt: normalizeDate(messages[0]?.createdAt),
  lastMessageCreatedAt: normalizeDate(messages.at(-1)?.createdAt),
  deliveryStateMessageCount: messages.filter(message => message.deliveryState)
    .length,
  latestKnownMessageId: latestKnownMessageId || null,
  includesLatestKnownMessage: latestKnownMessageId
    ? messages.some(message => message.id === latestKnownMessageId)
    : null
});

const normalizeDate = (value: IMessage['createdAt'] | undefined) =>
  value instanceof Date
    ? Number.isFinite(value.getTime())
      ? value.toISOString()
      : null
    : value || null;
