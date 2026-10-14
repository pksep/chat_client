import { expect, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';
import { visibleInquiryMessages } from '../src/utils/inquiry-message-visibility';

test('старые служебные записи скрыты только в обращении, клиентская переписка сохранена', (): void => {
  const messages = [
    { id: 'removed-manager', topicId: 'client', isSystem: true },
    { id: 'joined-manager', topicId: 'client', isSystem: true },
    { id: 'guest', topicId: 'client', isSystem: false },
    { id: 'operator', topicId: 'client', isSystem: false },
    { id: 'ordinary-group-event', topicId: 'group', isSystem: true }
  ] as IMessage[];
  const before = messages.map(message => message.id);

  const visible = visibleInquiryMessages(
    messages,
    (topicId: string): boolean => topicId === 'client'
  );

  expect(visible.map(message => message.id)).toEqual([
    'guest',
    'operator',
    'ordinary-group-event'
  ]);
  expect(messages.map(message => message.id)).toEqual(before);
});
