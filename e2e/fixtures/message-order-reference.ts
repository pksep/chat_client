// Алгоритм до оптимизации CHAT-294: эталон порядка и парного замера.
import type { IMessage } from '../../src/components/interfaces/interfaces';
import { parseMessageEx } from '../../src/utils/messageReplyQuote';

const stableKey = (message: IMessage): string => {
  const clientId = parseMessageEx(message.ex).clientId;
  return (
    message.id || (typeof clientId === 'string' ? `client:${clientId}` : '')
  );
};

export const compareMessagesBefore = (
  left: IMessage,
  right: IMessage
): number => {
  const leftEx = parseMessageEx(left.ex);
  const rightEx = parseMessageEx(right.ex);
  if (
    typeof leftEx.forwardBatchId === 'string' &&
    leftEx.forwardBatchId === rightEx.forwardBatchId &&
    typeof leftEx.forwardBatchOrder === 'number' &&
    typeof rightEx.forwardBatchOrder === 'number'
  )
    return leftEx.forwardBatchOrder - rightEx.forwardBatchOrder;
  const timeDiff =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  if (timeDiff !== 0) return timeDiff;
  return stableKey(left).localeCompare(stableKey(right));
};
