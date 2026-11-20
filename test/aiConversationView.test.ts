import { expect, test } from 'bun:test';
import { createAiConversationView } from '../src/services/aiConversationView';
import type { AIMessage } from '../src/types/messages';

test('сохраняет запрос перед неполным ответом и заменяет его только серверной копией', (): void => {
  const input: AIMessage = {
    id: 'request-1',
    requestId: 'request-1',
    role: 'user',
    content: 'Создай деталь, изделие и сборку. Мой комментарий.',
    timestamp: 1
  };
  const incomplete = {
    protocol: 1 as const,
    generation: 0,
    messages: [],
    tasks: [],
    incompleteMessages: [{ id: 'incomplete-1', requestId: 'request-1' }]
  };

  const view = createAiConversationView(incomplete, [input]);
  expect(view.map(message => message.id)).toEqual([
    'request-1',
    'incomplete-1'
  ]);
  expect(view[0].content).toBe(input.content);
  expect(createAiConversationView(incomplete, view)).toEqual(view);

  const synchronized = createAiConversationView(
    {
      ...incomplete,
      messages: [
        {
          id: 'server-user-1',
          requestId: 'request-1',
          role: 'user',
          content: input.content,
          timestamp: 1,
          attachments: [],
          outputAttachments: [],
          pendingToolApprovals: []
        }
      ]
    },
    view
  );
  expect(synchronized.map(message => message.id)).toEqual([
    'server-user-1',
    'incomplete-1'
  ]);
});
