import { describe, expect, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { MessageStatus, TopicType } from '../src/services/useChatSDK/types';
import {
  getMessageDisplayStatus,
  getMessageRecipients,
  getRecipientMessageStatus
} from '../src/utils/message-delivery-status';
import { mergeMessageSnapshots } from '../src/utils/merge-message-snapshots';
import { shouldDisplayMessageAsRead } from '../src/utils/messageReadStatus';

const message = (delivered: string[] = [], read: string[] = []): IMessage =>
  ({
    id: 'message',
    senderUserId: 'sender',
    topicId: 'topic',
    status: 'READ',
    deliveryState: {
      recipientUserIds: ['sender', 'alice', 'bob'],
      delivered: delivered.map(userId => ({ userId })),
      read: read.map(userId => ({ userId }))
    }
  }) as IMessage;

describe('подтверждения получения сообщения', () => {
  test('в группе достаточно доставки одному, а для голубых галочек нужно прочтение всеми', () => {
    const status = (row: IMessage) =>
      getMessageDisplayStatus(row, TopicType.Group);
    expect(status(message())).toBe(MessageStatus.Sent);
    expect(status(message(['alice']))).toBe(MessageStatus.Delivery);
    expect(status(message([], ['bob']))).toBe(MessageStatus.Delivery);
    expect(status(message(['alice'], ['bob']))).toBe(MessageStatus.Delivery);
    expect(status(message([], ['alice', 'bob']))).toBe(MessageStatus.Read);
    expect(
      status(message(['sender', 'outsider'], ['sender', 'outsider']))
    ).toBe(MessageStatus.Sent);
    expect(
      status({
        ...message([], ['bob']),
        messageRead: [{ id: 'read', messageId: 'message', userId: 'alice' }]
      })
    ).toBe(MessageStatus.Read);
    expect(status({ ...message(['alice'], ['alice']), status: 'WAIT' })).toBe(
      MessageStatus.Wait
    );
    expect(
      status({ ...message(['alice'], ['alice']), status: 'NOT_DELIVERED' })
    ).toBe(MessageStatus.NotDelivered);
  });

  test('в личном чате сохраняются подтверждения единственного собеседника', () => {
    const row = message();
    row.deliveryState!.recipientUserIds = ['alice'];
    expect(getMessageDisplayStatus(row, TopicType.DM)).toBe(MessageStatus.Sent);
    row.deliveryState!.delivered = [{ userId: 'alice' }];
    expect(getMessageDisplayStatus(row, TopicType.DM)).toBe(
      MessageStatus.Delivery
    );
    row.deliveryState!.read = [{ userId: 'alice' }];
    expect(getMessageDisplayStatus(row, TopicType.DM)).toBe(MessageStatus.Read);
  });

  test('в группе прочтение другого сообщения не меняет галочки текущего', () => {
    const isRead = (row: IMessage) =>
      shouldDisplayMessageAsRead(row, 0, 10, () => true, TopicType.Group);
    expect(isRead(message(['alice']))).toBe(false);
    expect(isRead(message([], ['alice']))).toBe(false);
    expect(isRead(message([], ['alice', 'bob']))).toBe(true);
    const merged = mergeMessageSnapshots([
      message(['alice'], ['alice', 'bob']),
      message()
    ])[0];
    expect(getMessageDisplayStatus(merged, TopicType.Group)).toBe(
      MessageStatus.Read
    );
  });

  test('без типа группы сохраняется требование подтверждений всех получателей', () => {
    expect(getMessageDisplayStatus(message())).toBe(MessageStatus.Sent);
    expect(getMessageDisplayStatus(message(['alice']))).toBe(
      MessageStatus.Sent
    );
    expect(getMessageDisplayStatus(message(['alice', 'bob'], ['alice']))).toBe(
      MessageStatus.Delivery
    );
    expect(getMessageDisplayStatus(message([], ['alice', 'bob']))).toBe(
      MessageStatus.Read
    );
  });

  test('прочтение подтверждает доставку, отправитель не входит в получателей', () => {
    const row = message(['alice'], ['bob']);
    expect(getMessageRecipients(row)).toEqual(['alice', 'bob']);
    expect(getRecipientMessageStatus(row, 'alice')).toBe(
      MessageStatus.Delivery
    );
    expect(getRecipientMessageStatus(row, 'bob')).toBe(MessageStatus.Read);
    expect(getMessageDisplayStatus(row)).toBe(MessageStatus.Delivery);
  });

  test('без типа группы позднее прочтение не заменяет подтверждения текущего сообщения', () => {
    const row = message(['alice'], ['alice']);
    expect(shouldDisplayMessageAsRead(row, 0, 10, () => true)).toBe(false);
    row.messageRead = [{ id: 'read', messageId: row.id, userId: 'bob' }];
    expect(shouldDisplayMessageAsRead(row, 0, 10, () => true)).toBe(true);
  });

  test('устаревший снимок не отменяет подтверждения', () => {
    const received = message(['alice', 'bob'], ['alice', 'bob']);
    const stale = message();
    const merged = mergeMessageSnapshots([received, stale])[0];
    expect(getMessageDisplayStatus(merged)).toBe(MessageStatus.Read);
  });

  test('ожидание, ошибка и прежний протокол сохраняют свои значки', () => {
    expect(getMessageDisplayStatus({ ...message(), status: 'WAIT' })).toBe(
      MessageStatus.Wait
    );
    expect(
      getMessageDisplayStatus({ ...message(), status: 'NOT_DELIVERED' })
    ).toBe(MessageStatus.NotDelivered);
    expect(
      getMessageDisplayStatus({
        ...message(),
        deliveryState: undefined,
        status: 'DELIVERED'
      })
    ).toBe(MessageStatus.Delivery);
  });
});
