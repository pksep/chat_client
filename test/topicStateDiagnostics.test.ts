import { describe, expect, test } from 'bun:test';
import type { IMessage, ITopic } from '../src/components/interfaces/interfaces';
import { getTopicStateDiagnostic } from '../src/utils/topic-state-diagnostics';

describe('topic state diagnostics', () => {
  test('reports the actual status source, manual unread mark and no message content', () => {
    const topic = {
      id: 'topic',
      unreadMessageCount: 0,
      info: { isMarkedUnread: true },
      lastMessage: {
        id: 'message',
        status: 'WAIT',
        senderUserId: 'self',
        text: 'private content'
      }
    } as ITopic;
    const state = getTopicStateDiagnostic(
      topic,
      { id: 'message', status: 'READ', isReadByMe: true } as IMessage,
      'self'
    );
    expect(state).toMatchObject({
      topicStatus: 'WAIT',
      clientStatus: 'READ',
      displayedStatus: 'READ',
      statusMismatch: true,
      isMarkedUnread: true,
      unreadMessageCount: 0,
      isOwnLastMessage: true
    });
    expect(JSON.stringify(state)).not.toContain('private content');
  });

  test('does not compare the status of different messages', () => {
    const state = getTopicStateDiagnostic(
      { id: 'topic', lastMessage: { id: 'last', status: 'WAIT' } } as ITopic,
      { id: 'older', status: 'READ' } as IMessage,
      'self'
    );
    expect(state).toMatchObject({
      displayedStatus: 'WAIT',
      statusMismatch: false
    });
    expect(state.clientStatus).toBeUndefined();
  });
});
