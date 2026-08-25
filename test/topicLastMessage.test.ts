import { describe, expect, test } from 'bun:test';
import { MessageStatus } from '../src/services/useChatSDK/types';
import {
  resolveLastMessageStatus,
  resolveTopicLastMessage
} from '../src/utils/topic-last-message';

describe('topic last message source', () => {
  test('keeps the server message before the client has topic data', () => {
    const serverMessage = {
      id: 'server-message',
      createdAt: '2026-08-25T10:00:00.000Z',
      text: 'server'
    };

    expect(resolveTopicLastMessage(serverMessage)).toBe(serverMessage);
  });

  test('prefers the client payload for the same message', () => {
    const serverMessage = {
      id: 'same-message',
      createdAt: '2026-08-25T10:00:00.000Z',
      text: 'stale server text'
    };
    const clientMessage = {
      id: 'same-message',
      createdAt: '2026-08-25T10:00:00.000Z',
      text: 'current client text'
    };

    expect(resolveTopicLastMessage(serverMessage, clientMessage)).toBe(
      clientMessage
    );
  });

  test('prefers a newer client message by creation time', () => {
    const serverMessage = {
      id: 'server-message',
      createdAt: '2026-08-25T10:00:00.000Z'
    };
    const clientMessage = {
      id: 'client-message',
      createdAt: '2026-08-25T10:01:00.000Z'
    };

    expect(resolveTopicLastMessage(serverMessage, clientMessage)).toBe(
      clientMessage
    );
  });

  test('does not replace a newer server message with stale client cache', () => {
    const serverMessage = {
      id: 'server-message',
      createdAt: '2026-08-25T10:01:00.000Z'
    };
    const clientMessage = {
      id: 'client-message',
      createdAt: '2026-08-25T10:00:00.000Z'
    };

    expect(resolveTopicLastMessage(serverMessage, clientMessage)).toBe(
      serverMessage
    );
  });
});

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
