import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createMessageDeliveryQueue } from '../src/services/message-delivery-queue';
import type { IMessage } from '../src/components/interfaces/interfaces';

const queues: ReturnType<typeof createMessageDeliveryQueue>[] = [];
afterEach(() => queues.splice(0).forEach(queue => queue.dispose()));
const row = (id: string, senderUserId = 'peer'): IMessage =>
  ({
    id,
    topicId: 'topic',
    senderUserId,
    deliveryState: { recipientUserIds: ['me'], delivered: [], read: [] }
  }) as IMessage;
const pause = () => new Promise(resolve => setTimeout(resolve, 120));

describe('очередь подтверждений доставки', () => {
  test('объединяет сообщения в пачку, исключает собственные и повторные подтверждения', async () => {
    const send = mock(async () => ({ success: true }));
    const queue = createMessageDeliveryQueue({
      getUserId: () => 'me',
      isConnected: () => true,
      send
    });
    queues.push(queue);
    queue.enqueue([
      row('a'),
      row('b'),
      row('a'),
      row('own', 'me'),
      { ...row('legacy'), deliveryState: undefined },
      {
        ...row('read'),
        deliveryState: {
          recipientUserIds: ['me'],
          delivered: [],
          read: [{ userId: 'me' }]
        }
      }
    ]);
    await pause();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['topic', ['a', 'b']]);
    queue.enqueue([row('a')]);
    await pause();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test('сохраняет неподтверждённую доставку до восстановления соединения', async () => {
    let connected = false;
    const send = mock(async () => ({ success: true }));
    const queue = createMessageDeliveryQueue({
      getUserId: () => 'me',
      isConnected: () => connected,
      send
    });
    queues.push(queue);
    queue.enqueue([row('a')]);
    await pause();
    expect(send).not.toHaveBeenCalled();
    connected = true;
    queue.resume();
    await pause();
    expect(send.mock.calls[0]).toEqual(['topic', ['a']]);
  });
});
