import { describe, expect, spyOn, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { compareMessages } from '../src/utils/messageOrder';
import { compareMessagesBefore } from '../e2e/fixtures/message-order-reference';

const createMessage = (id: string, createdAt: string, ex: unknown): IMessage =>
  ({
    id,
    createdAt,
    ex
  }) as unknown as IMessage;

describe('compareMessages', () => {
  test('сохраняет прежний порядок дат, одинакового времени, JSONB и некорректных метаданных', () => {
    const metadata = [
      undefined,
      null,
      '',
      '{invalid',
      'null',
      '[]',
      42,
      { clientId: 'local' },
      JSON.stringify({ clientId: 'local' }),
      ...Array.from({ length: 5 }, (_, forwardBatchOrder) =>
        JSON.stringify({ forwardBatchId: 'batch', forwardBatchOrder })
      )
    ];
    const rows = Array.from({ length: 180 }, (_, index) => ({
      id: index % 9 ? `id-${index % 23}` : '',
      createdAt:
        index % 7 === 0
          ? 'invalid'
          : index % 2
            ? new Date(Date.UTC(2026, 8, 1, 0, 0, index % 5))
            : new Date(Date.UTC(2026, 8, 1, 0, 0, index % 5)).toISOString(),
      ex: metadata[index % metadata.length]
    })) as unknown as IMessage[];
    for (const left of rows)
      for (const right of rows) {
        expect(compareMessages(left, right)).toBe(
          compareMessagesBefore(left, right)
        );
      }
  });

  test('учитывает замену ex, изменение JSONB и изменение Date на месте', () => {
    const left = createMessage(
      'a',
      '2026-09-01T00:00:00Z',
      JSON.stringify({ forwardBatchId: 'batch', forwardBatchOrder: 0 })
    );
    const right = createMessage(
      'b',
      '2026-09-01T00:00:00Z',
      JSON.stringify({ forwardBatchId: 'batch', forwardBatchOrder: 1 })
    );
    expect(compareMessages(left, right)).toBe(-1);
    left.ex = JSON.stringify({ forwardBatchId: 'batch', forwardBatchOrder: 2 });
    expect(compareMessages(left, right)).toBe(1);
    const jsonb = { forwardBatchId: 'batch', forwardBatchOrder: 3 };
    left.ex = jsonb as unknown as string;
    expect(compareMessages(left, right)).toBe(2);
    jsonb.forwardBatchOrder = -1;
    expect(compareMessages(left, right)).toBe(-2);
    left.ex = right.ex = '';
    left.createdAt = new Date('2026-09-01T00:00:00Z');
    expect(compareMessages(left, right)).toBeLessThan(0);
    left.createdAt.setSeconds(2);
    expect(compareMessages(left, right)).toBe(2000);
  });

  test('повторные сравнения не разбирают один и тот же JSON заново', () => {
    const rows = [0, 1].map(index =>
      createMessage(
        String(index),
        '2026-09-01',
        JSON.stringify({ clientId: String(index) })
      )
    );
    const parse = spyOn(JSON, 'parse');
    try {
      for (let index = 0; index < 1000; index++)
        compareMessages(rows[0], rows[1]);
      expect(parse).toHaveBeenCalledTimes(2);
      rows[0].ex = '{broken';
      for (let index = 0; index < 1000; index++)
        compareMessages(rows[0], rows[1]);
      expect(parse).toHaveBeenCalledTimes(3);
    } finally {
      parse.mockRestore();
    }
  });
  test('preserves forward batch order when the server returns ex as JSONB', () => {
    const messages = [
      createMessage('third', '2026-08-21T06:29:01.000Z', {
        forwardBatchId: 'batch-id',
        forwardBatchOrder: 2
      }),
      createMessage('first', '2026-08-21T06:29:03.000Z', {
        forwardBatchId: 'batch-id',
        forwardBatchOrder: 0
      }),
      createMessage('second', '2026-08-21T06:29:02.000Z', {
        forwardBatchId: 'batch-id',
        forwardBatchOrder: 1
      })
    ];

    expect(messages.sort(compareMessages).map(message => message.id)).toEqual([
      'first',
      'second',
      'third'
    ]);
  });

  test('continues to support serialized message metadata', () => {
    const messages = [
      createMessage(
        'second',
        '2026-08-21T06:29:01.000Z',
        JSON.stringify({
          forwardBatchId: 'batch-id',
          forwardBatchOrder: 1
        })
      ),
      createMessage(
        'first',
        '2026-08-21T06:29:02.000Z',
        JSON.stringify({
          forwardBatchId: 'batch-id',
          forwardBatchOrder: 0
        })
      )
    ];

    expect(messages.sort(compareMessages).map(message => message.id)).toEqual([
      'first',
      'second'
    ]);
  });
});
