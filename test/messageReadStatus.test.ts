import { describe, expect, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { MessageStatus } from '../src/services/useChatSDK/types';
import {
  getLatestReadOutgoingMessageIndex,
  shouldDisplayMessageAsRead
} from '../src/utils/messageReadStatus';

const AUTH_USER_ID = 'auth-user';

const createMessage = (
  id: string,
  status: MessageStatus,
  senderUserId = AUTH_USER_ID
): IMessage =>
  ({
    id,
    status,
    senderUserId
  }) as IMessage;

const isOutgoingMessage = (message: IMessage): boolean =>
  message.senderUserId === AUTH_USER_ID;

describe('message read status', () => {
  test('marks earlier delivered outgoing messages as read', () => {
    const messages = [
      createMessage('first', MessageStatus.Delivery),
      createMessage('second', MessageStatus.Delivery),
      createMessage('last', MessageStatus.Read)
    ];
    const latestReadIndex = getLatestReadOutgoingMessageIndex(
      messages,
      isOutgoingMessage
    );

    expect(latestReadIndex).toBe(2);
    expect(
      messages.map((message, index) =>
        shouldDisplayMessageAsRead(
          message,
          index,
          latestReadIndex,
          isOutgoingMessage
        )
      )
    ).toEqual([true, true, true]);
  });

  test('does not promote incoming, pending, or failed messages', () => {
    const messages = [
      createMessage('incoming', MessageStatus.Delivery, 'other-user'),
      createMessage('pending', MessageStatus.Wait),
      createMessage('failed', MessageStatus.NotDelivered),
      createMessage('last', MessageStatus.Read)
    ];
    const latestReadIndex = getLatestReadOutgoingMessageIndex(
      messages,
      isOutgoingMessage
    );

    expect(
      messages.map((message, index) =>
        shouldDisplayMessageAsRead(
          message,
          index,
          latestReadIndex,
          isOutgoingMessage
        )
      )
    ).toEqual([false, false, false, true]);
  });

  test('keeps newer delivered messages unread after the latest read message', () => {
    const messages = [
      createMessage('read', MessageStatus.Read),
      createMessage('newer', MessageStatus.Delivery)
    ];
    const latestReadIndex = getLatestReadOutgoingMessageIndex(
      messages,
      isOutgoingMessage
    );

    expect(
      shouldDisplayMessageAsRead(
        messages[1],
        1,
        latestReadIndex,
        isOutgoingMessage
      )
    ).toBe(false);
  });
});
