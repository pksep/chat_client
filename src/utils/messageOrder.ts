import type { IMessage } from '../components/interfaces/interfaces';
import { parseMessageEx } from './messageReplyQuote';

export const getMessageTimestamp = (message: IMessage): number =>
  new Date(message.createdAt).getTime();

const getMessageStableSortKey = (message: IMessage): string => {
  const clientId = parseMessageEx(message.ex).clientId;

  return (
    message.id || (typeof clientId === 'string' ? `client:${clientId}` : '')
  );
};

export const compareMessages = (left: IMessage, right: IMessage): number => {
  const leftEx = parseMessageEx(left.ex);
  const rightEx = parseMessageEx(right.ex);
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

  return getMessageStableSortKey(left).localeCompare(
    getMessageStableSortKey(right)
  );
};
