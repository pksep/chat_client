import { describe, expect, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { compareMessages } from '../src/utils/messageOrder';

const createMessage = (id: string, createdAt: string, ex: unknown): IMessage =>
  ({
    id,
    createdAt,
    ex
  }) as unknown as IMessage;

describe('compareMessages', () => {
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
