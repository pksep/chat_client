import { describe, expect, test } from 'bun:test';
import { MessageStatus } from '../src/services/useChatSDK/types';
import { resolveLastMessageStatus } from '../src/utils/topic-last-message';

describe('topic last message status', () => {
  test('prefers the current client status for the same message', () => {
    expect(
      resolveLastMessageStatus(
        { id: 'message-id', status: MessageStatus.Wait },
        { id: 'message-id', status: MessageStatus.Delivery }
      )
    ).toBe(MessageStatus.Delivery);
  });

  test('does not apply the status of a different client message', () => {
    expect(
      resolveLastMessageStatus(
        { id: 'topic-last-message', status: MessageStatus.Wait },
        { id: 'another-message', status: MessageStatus.Read }
      )
    ).toBe(MessageStatus.Wait);
  });
});
