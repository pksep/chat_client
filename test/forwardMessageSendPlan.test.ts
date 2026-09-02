import { describe, expect, test } from 'bun:test';
import { buildForwardMessageSendPlan } from '../src/utils/forward-message-send-plan';

describe('buildForwardMessageSendPlan', () => {
  test('sends a single forward separately from the typed message', () => {
    expect(
      buildForwardMessageSendPlan(['forward-1'], ['typed message'])
    ).toEqual([
      {
        kind: 'forward',
        text: '',
        forwardMessageId: 'forward-1',
        forwardBatchOrder: 0
      },
      {
        kind: 'text',
        text: 'typed message',
        forwardBatchOrder: 1
      }
    ]);
  });

  test('preserves the order of multiple forwards and text parts', () => {
    expect(
      buildForwardMessageSendPlan(
        ['forward-1', 'forward-2'],
        ['typed part 1', 'typed part 2']
      ).map(item => [
        item.kind,
        item.forwardMessageId,
        item.text,
        item.forwardBatchOrder
      ])
    ).toEqual([
      ['forward', 'forward-1', '', 0],
      ['forward', 'forward-2', '', 1],
      ['text', undefined, 'typed part 1', 2],
      ['text', undefined, 'typed part 2', 3]
    ]);
  });
});
