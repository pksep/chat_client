import { expect, test } from 'bun:test';
import { createDesktopNotificationActionHandler } from '../src/utils/desktop-notification-actions';

const topicId = 'c8490ca4-47e9-4b24-a5ba-c2b0b4023bd7';
const messageId = 'bcd4d922-b955-4f6f-9fbc-16a3ff317672';
const replyClientId = '5e356d09-18bb-4e64-b0ac-a7587ada8537';
const payload = {
  type: 'new_message',
  accountId: 'owner',
  topicId,
  messageId,
  replyClientId
};
const fixture = () => {
  const calls: Array<{ path: string; body: Record<string, string> }> = [];
  let owner = 'owner';
  let confirmed = 0;
  const handle = createDesktopNotificationActionHandler({
    accountId: () => owner,
    post: async (path, body) => {
      calls.push({ path, body });
      return path.endsWith('/reply') ? { id: 'sent' } : { success: true };
    },
    confirmed: async () => {
      confirmed++;
    }
  });
  return {
    handle,
    calls,
    owner: (value: string) => {
      owner = value;
    },
    confirmed: () => confirmed
  };
};

test('Нравится ставит сердечко один раз, отдельное Прочитано не теряется из-за дедупликации', async () => {
  const f = fixture();
  await Promise.all([
    f.handle({ ...payload, action: 'like' }),
    f.handle({ ...payload, action: 'like' })
  ]);
  await f.handle({ ...payload, action: 'read' });
  expect(f.calls).toEqual([
    {
      path: `/messages/topic/${topicId}/reaction`,
      body: { messageId, emoji: '❤️' }
    },
    { path: `/messages/topic/${topicId}/read`, body: { messageId } }
  ]);
  expect(f.confirmed()).toBe(2);
});

test('быстрый ответ сохраняет plain text, clientId и исходное сообщение, повтор callback не дублирует отправку', async () => {
  const f = fixture();
  const action = {
    ...payload,
    action: 'reply',
    replyText: '  <b>Ответ</b> & строка\nвторая  '
  };
  await Promise.all([f.handle(action), f.handle(action)]);
  expect(f.calls).toEqual([
    {
      path: `/messages/topic/${topicId}/reply`,
      body: {
        text: '<b>Ответ</b> & строка\nвторая',
        clientId: replyClientId,
        replyMessageId: messageId
      }
    },
    { path: `/messages/topic/${topicId}/read`, body: { messageId } }
  ]);
  expect(f.confirmed()).toBe(1);
});

test('старое уведомление другого аккаунта, неверные ID и пустой ответ не отправляют запросы', async () => {
  const f = fixture();
  await f.handle({ ...payload, action: 'like', accountId: 'previous' });
  await f.handle({ ...payload, action: 'read', topicId: '../other' });
  expect(await f.handle({ type: 'incoming_call', action: 'accept' })).toBe(
    false
  );
  for (const replyText of ['', ' ', 'я'.repeat(3001)])
    await expect(
      f.handle({ ...payload, action: 'reply', replyText })
    ).rejects.toThrow('3000');
  expect(f.calls).toHaveLength(0);
  expect(f.confirmed()).toBe(0);
});

test('смена аккаунта во время ответа останавливает прочтение и очистку', async () => {
  let owner = 'owner';
  const calls: string[] = [];
  const handle = createDesktopNotificationActionHandler({
    accountId: () => owner,
    post: async path => {
      calls.push(path);
      owner = 'other';
      return { id: 'sent' };
    },
    confirmed: async () => {
      throw new Error('Старое уведомление не должно очищаться');
    }
  });
  await expect(
    handle({ ...payload, action: 'reply', replyText: 'Ответ' })
  ).rejects.toThrow('Аккаунт изменился');
  expect(calls).toEqual([`/messages/topic/${topicId}/reply`]);
});

test('ошибка не выдаётся за успех, повтор ответа использует тот же clientId', async () => {
  const requests: Record<string, string>[] = [];
  let confirmed = false;
  const handle = createDesktopNotificationActionHandler({
    accountId: () => 'owner',
    post: async (_path, body) => {
      requests.push(body);
      throw new Error('Нет сети');
    },
    confirmed: async () => {
      confirmed = true;
    }
  });
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(
      handle({ ...payload, action: 'reply', replyText: 'Ответ' })
    ).rejects.toThrow('Нет сети');
  expect(requests.map(body => body.clientId)).toEqual([
    replyClientId,
    replyClientId
  ]);
  expect(confirmed).toBe(false);
});

test('сбой отметки прочтения после подтверждённого ответа сообщает, что ответ уже отправлен', async () => {
  const handle = createDesktopNotificationActionHandler({
    accountId: () => 'owner',
    post: async path => {
      if (path.endsWith('/reply')) return { id: 'sent' };
      throw new Error('Нет сети');
    },
    confirmed: async () => {}
  });
  await expect(
    handle({ ...payload, action: 'reply', replyText: 'Ответ' })
  ).rejects.toThrow('Ответ отправлен');
});
