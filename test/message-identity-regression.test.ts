import { describe, expect, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { MessageStatus } from '../src/services/useChatSDK/types';
import { mergeMessageSnapshots } from '../src/utils/merge-message-snapshots';
import {
  isSameMessage,
  getMessageRenderKeys,
  isMessageIdDeleted,
  pendingMessageTombstone
} from '../src/utils/message-identity';
import {
  resolveLastMessageAfterLocalSync,
  resolveTopicLastMessage
} from '../src/utils/topic-last-message';
import {
  createOutgoingSendGate,
  OUTGOING_ACK_WAIT_MS
} from '../src/utils/outgoing-send-gate';

const pending = {
  id: 'client-id',
  topicId: 'topic',
  senderUserId: 'self',
  ex: JSON.stringify({ clientId: 'client-id' }),
  createdAt: '2026-10-20T05:41:59.364Z',
  status: MessageStatus.Wait
} as unknown as IMessage;
const confirmed = {
  ...pending,
  id: 'server-id',
  createdAt: '2026-10-20T05:41:57.769Z',
  updatedAt: '2026-10-20T05:41:58.143Z',
  status: MessageStatus.Read
} as unknown as IMessage;

describe('подтверждение сообщения при разных часах', () => {
  test('серверный ID и прочтение заменяют WAIT в обоих порядках', () => {
    for (const [first, second] of [
      [pending, confirmed],
      [confirmed, pending]
    ]) {
      expect(resolveTopicLastMessage(first, second)).toMatchObject({
        id: 'server-id',
        status: MessageStatus.Read
      });
      expect(mergeMessageSnapshots([first, second])).toEqual([confirmed]);
      expect(
        resolveLastMessageAfterLocalSync(first, second, true)
      ).toMatchObject({ id: 'server-id', status: MessageStatus.Read });
    }
  });
  test('новое неподтверждённое сообщение остаётся последним', () => {
    const next = {
      ...pending,
      id: 'next-client',
      ex: JSON.stringify({ clientId: 'next-client' })
    };
    expect(resolveTopicLastMessage(confirmed, next)).toBe(next);
  });
  test('запоздавшая доставка не отменяет прочтение', () => {
    const stale = { ...confirmed, status: MessageStatus.Delivery };
    for (const rows of [
      [confirmed, stale],
      [stale, confirmed]
    ]) {
      expect(mergeMessageSnapshots(rows)[0].status).toBe(MessageStatus.Read);
    }
  });
  test('кеш не возвращает счётчик непрочитанного для уже прочитанного сообщения', () => {
    const read = { ...confirmed, isReadByMe: true, isRead: true };
    const stale = { ...confirmed, isReadByMe: false, isRead: false };
    expect(mergeMessageSnapshots([read, stale])[0]).toMatchObject({
      isReadByMe: true,
      isRead: true
    });
  });
});

describe('старые серверные дубли с одним clientId', () => {
  const first = { ...confirmed, id: 'copy-a', reactions: [] };
  const second = {
    ...confirmed,
    id: 'copy-b',
    reactions: [
      { id: 'heart', messageId: 'copy-b', senderUserId: 'peer', text: '❤️' }
    ]
  } as IMessage;
  test('реакция и ID не зависят от порядка истории и кеша', () => {
    expect(isSameMessage(first, second)).toBe(false);
    for (const rows of [
      [first, second],
      [second, first],
      [pending, second, first]
    ]) {
      const merged = mergeMessageSnapshots(rows);
      expect(merged).toHaveLength(2);
      expect(
        merged.find(message => message.id === 'copy-a')?.reactions
      ).toEqual([]);
      expect(
        merged.find(message => message.id === 'copy-b')?.reactions
      ).toEqual(second.reactions);
    }
  });
  test('обычное echo сохраняет DOM ключ, старые дубли получают разные ключи', () => {
    expect(getMessageRenderKeys([pending]).get(pending.id)).toBe(
      getMessageRenderKeys([confirmed]).get(confirmed.id)
    );
    const keys = getMessageRenderKeys([first, second]);
    expect(keys.get(first.id)).not.toBe(keys.get(second.id));
  });
  test('снятая реакция не восстанавливается объединением дублей', () => {
    const removed = {
      ...second,
      reactions: [],
      updatedAt: '2026-10-20T06:00:00Z'
    } as unknown as IMessage;
    expect(
      mergeMessageSnapshots([second, first, removed]).find(
        message => message.id === 'copy-b'
      )?.reactions
    ).toEqual([]);
  });
  test('удаление копии блокирует её временный снимок, сохраняя другую копию', () => {
    const deleted = new Set(['copy-a', pendingMessageTombstone('client-id')]);
    expect(isMessageIdDeleted(first, deleted)).toBe(true);
    expect(isMessageIdDeleted(pending, deleted)).toBe(true);
    expect(isMessageIdDeleted(second, deleted)).toBe(false);
  });
  test('clientId другого отправителя не заменяет локальную очередь', () => {
    expect(
      mergeMessageSnapshots([pending, { ...confirmed, senderUserId: 'other' }])
    ).toHaveLength(2);
    expect(
      isSameMessage(pending, { ...confirmed, senderUserId: 'other' })
    ).toBe(false);
  });
});

describe('ожидание подтверждения отправки', () => {
  test('параллельный retry и повтор через 237 мс отправляют один запрос', async () => {
    const gate = createOutgoingSendGate();
    let calls = 0;
    let finish!: (sent: boolean) => void;
    const send = () => {
      calls += 1;
      return new Promise<boolean>(resolve => {
        finish = resolve;
      });
    };
    const one = gate.send('send', send);
    const two = gate.send('send', send);
    await Promise.resolve();
    expect(calls).toBe(1);
    finish(true);
    expect(await Promise.all([one, two])).toEqual([true, true]);
    expect(gate.delay('send', Date.now() + 237)).toBeGreaterThan(14_000);
    await gate.send('send', send);
    expect(calls).toBe(1);
    expect(gate.delay('send', Date.now() + OUTGOING_ACK_WAIT_MS + 1)).toBe(0);
    const retry = gate.send('send', send);
    await Promise.resolve();
    finish(true);
    await retry;
    expect(calls).toBe(2);
  });
  test('ошибка освобождает отправку; другие сообщения не ждут', async () => {
    const gate = createOutgoingSendGate();
    expect(await gate.send('one', async () => false)).toBe(false);
    expect(gate.delay('one')).toBe(0);
    expect(await gate.send('one', async () => true)).toBe(true);
    expect(await gate.send('two', async () => true)).toBe(true);
  });
});
