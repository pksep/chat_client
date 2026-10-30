import { expect, test } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const topicId = 'performance-0';

test('подтверждение удалённой отправки очищает временное сообщение и блокирует старый кеш', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const pending = {
    ...makeMessages(topicId, 1)[0],
    id: 'deleted-client',
    senderUserId: 'performance-user',
    status: 'WAIT',
    ex: JSON.stringify({ clientId: 'deleted-client' })
  };
  const ids = await page.evaluate(pending => {
    const fixture = (window as any).topicPerformance;
    fixture.seed(pending.topicId, [pending]);
    fixture.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'DELETE',
        topicId: pending.topicId,
        data: {
          ...pending,
          id: 'deleted-server',
          deletedAt: new Date().toISOString()
        }
      }
    });
    fixture.seed(pending.topicId, [pending]);
    return fixture.messages
      .getFullMessagesByTopicId(pending.topicId)
      .map((message: any) => message.id);
  }, pending);
  expect(ids).toEqual([]);
  expect(errors).toEqual([]);
});

for (const readFirst of [false, true]) {
  test(`echo с более ранним временем заменяет часы, readFirst=${readFirst}`, async ({
    page
  }) => {
    const { errors } = await openFixture(page);
    const pending = {
      ...makeMessages(topicId, 1)[0],
      id: 'client-id',
      senderUserId: 'performance-user',
      status: 'WAIT',
      createdAt: '2026-10-20T05:41:59.364Z',
      ex: JSON.stringify({ clientId: 'client-id' })
    };
    const confirmed = {
      ...pending,
      id: 'server-id',
      status: 'DELIVERED',
      createdAt: '2026-10-20T05:41:57.769Z'
    };
    await page.evaluate(
      ({ pending, confirmed, readFirst }) => {
        const fixture = (window as any).topicPerformance;
        fixture.seed(pending.topicId, [pending]);
        fixture.setTopics([
          { ...fixture.getSelectedTopic(pending.topicId), lastMessage: pending }
        ]);
        fixture.mountTopicList();
        const read = () =>
          fixture.emitChatEvent({
            type: 'readMessage',
            payload: {
              topicId: pending.topicId,
              messageIds: [confirmed.id],
              userId: 'peer-0'
            }
          });
        if (readFirst) read();
        fixture.emitChatEvent({
          type: 'changeMessage',
          payload: { type: 'NEW', topicId: pending.topicId, data: confirmed }
        });
        if (!readFirst) read();
      },
      { pending, confirmed, readFirst }
    );
    const row = page.locator(`[data-topic-id="${topicId}"]`);
    await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();
    await page.evaluate(
      ({ pending, confirmed }) => {
        const fixture = (window as any).topicPerformance;
        fixture.seed(pending.topicId, [pending]);
        fixture.setTopics([
          {
            ...fixture.getSelectedTopic(pending.topicId),
            lastMessage: confirmed
          }
        ]);
      },
      { pending, confirmed }
    );
    await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();
    expect(
      await page.evaluate(
        topicId =>
          (window as any).topicPerformance.getSelectedTopic(topicId).lastMessage
            .id,
        topicId
      )
    ).toBe('server-id');
    expect(errors).toEqual([]);
  });
}

test('серверные дубли сохраняют сердечко при смене порядка, снятии реакции и удалении другой копии', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 2 });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-1"]')
  ).toBeVisible();
  const base = {
    ...makeMessages(topicId, 1)[0],
    text: 'ладно не надо)',
    senderUserId: 'performance-user',
    ex: JSON.stringify({ clientId: 'shared-client-id' }),
    updatedAt: '2026-10-19T10:13:44.560Z'
  };
  const first = {
    ...base,
    id: 'copy-a',
    createdAt: '2026-10-19T10:13:40.316Z'
  };
  const second = {
    ...base,
    id: 'copy-b',
    createdAt: '2026-10-19T10:13:40.318Z',
    reactions: [
      { id: 'heart', messageId: 'copy-b', senderUserId: 'peer-0', text: '❤️' }
    ]
  };
  const heart = page.locator('[data-message-id="copy-b"] .reaction');
  for (const rows of [
    [first, second],
    [second, first],
    [first, second]
  ]) {
    await page.evaluate(
      rows => (window as any).topicPerformance.seed('performance-0', rows),
      rows
    );
    await expect(heart).toHaveCount(1);
    await expect(
      page.locator('[data-message-id="copy-a"] .reaction')
    ).toHaveCount(0);
  }
  await page.evaluate(async () => {
    await (window as any).topicPerformance.messages.deleteMessageFromLocal(
      'performance-0',
      'copy-a'
    );
  });
  await expect(heart).toHaveCount(1);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    [first, second]
  );
  await expect(page.locator('[data-message-id="copy-a"]')).toHaveCount(0);
  await expect(heart).toHaveCount(1);
  await page.evaluate(() => {
    (window as any).topicPerformance.emitChatEvent({
      type: 'reactionUpdated',
      payload: {
        action: 'removed',
        topicId: 'performance-0',
        messageId: 'copy-b',
        reactionId: 'heart',
        reaction: {
          id: 'heart',
          messageId: 'copy-b',
          senderUserId: 'peer-0',
          text: '❤️'
        }
      }
    });
  });
  await expect(heart).toHaveCount(0);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    [second, first]
  );
  await expect(heart).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('свежий WAIT не вызывает второй send; потерянное echo допускает повтор и подтверждение останавливает retry', async ({
  page
}) => {
  test.setTimeout(60_000);
  const { errors } = await openFixture(page);
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-19"]')
  ).toBeVisible();
  await page.clock.install();
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const path = '/e2e/fixtures/message-send-harness.ts';
    const { mountMessageSender } = await import(/* @vite-ignore */ path);
    const networkPath = '/e2e/fixtures/network-harness.ts';
    const { controlConnection } = await import(/* @vite-ignore */ networkPath);
    controlConnection();
    const sdk = fixture.sdk;
    (window as any).sends = [];
    sdk.sendWebSocketEvent = (type: string, data: any) => {
      if (type === 'sendMessage') (window as any).sends.push(data);
      return true;
    };
    (window as any).sender = mountMessageSender('performance-0');
    await (window as any).sender.handleSend();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
  });
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => (window as any).sends.length)).toBe(1);
  await page.clock.runFor(14_100);
  await expect
    .poll(() => page.evaluate(() => (window as any).sends.length))
    .toBe(2);
  await page.evaluate(() => {
    const clientId = JSON.parse((window as any).sends[0].ex).clientId;
    const pending = (window as any).topicPerformance.messages
      .getFullMessagesByTopicId('performance-0')
      .find((message: any) => message.id === clientId);
    (window as any).topicPerformance.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: pending.topicId,
        data: { ...pending, id: 'confirmed-retry', status: 'DELIVERED' }
      }
    });
  });
  await page.clock.fastForward(31_000);
  expect(await page.evaluate(() => (window as any).sends.length)).toBe(2);
  expect(errors).toEqual([]);
});
