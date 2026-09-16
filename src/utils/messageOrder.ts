import type { IMessage } from '../components/interfaces/interfaces';
import { parseMessageEx } from './messageReplyQuote';

export const getMessageTimestamp = (message: IMessage): number =>
  message.createdAt instanceof Date
    ? message.createdAt.getTime()
    : new Date(message.createdAt).getTime();

const emptyMetadata: Record<string, unknown> = {};
const serializedMetadata = new WeakMap<
  IMessage,
  {
    source: string;
    clientId?: string;
    forwardBatchId?: string;
    forwardBatchOrder?: number;
  }
>();

const getOrderMetadata = (message: IMessage): Record<string, unknown> => {
  const source = message.ex;
  if (!source) return emptyMetadata;
  // JSONB может изменяться на месте; кешируем только неизменяемую строку.
  if (typeof source !== 'string') return parseMessageEx(source);
  const cached = serializedMetadata.get(message);
  if (cached?.source === source) return cached;
  const parsed = parseMessageEx(source);
  const value = {
    source,
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : undefined,
    forwardBatchId:
      typeof parsed.forwardBatchId === 'string'
        ? parsed.forwardBatchId
        : undefined,
    forwardBatchOrder:
      typeof parsed.forwardBatchOrder === 'number'
        ? parsed.forwardBatchOrder
        : undefined
  };
  serializedMetadata.set(message, value);
  return value;
};

const getMessageStableSortKey = (
  message: IMessage,
  metadata: Record<string, unknown>
): string => {
  const clientId = metadata.clientId;

  return (
    message.id || (typeof clientId === 'string' ? `client:${clientId}` : '')
  );
};

export const compareMessages = (left: IMessage, right: IMessage): number => {
  const leftEx = getOrderMetadata(left);
  const rightEx = getOrderMetadata(right);
  const leftBatchId = leftEx.forwardBatchId;
  const rightBatchId = rightEx.forwardBatchId;

  if (
    typeof leftBatchId === 'string' &&
    leftBatchId === rightBatchId &&
    typeof leftEx.forwardBatchOrder === 'number' &&
    typeof rightEx.forwardBatchOrder === 'number'
  ) {
    return leftEx.forwardBatchOrder - rightEx.forwardBatchOrder;
  }

  const timeDiff = getMessageTimestamp(left) - getMessageTimestamp(right);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return getMessageStableSortKey(left, leftEx).localeCompare(
    getMessageStableSortKey(right, rightEx)
  );
};
