import { expect, test, type Page } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

async function prepareOutbox(page: Page) {
  const state = await openFixture(page, { shell: true, count: 1 });
  await openTopic(page, 0);
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const { controlConnection } = await import(
      '/e2e/fixtures/network-harness.ts'
    );
    const { mountMessageSender } = await import(
      '/e2e/fixtures/message-send-harness.ts'
    );
    controlConnection();
    const state = {
      attempts: [] as number[],
      sends: [] as any[],
      available: false
    };
    (window as any).outboxRegression = state;
    fixture.sdk.uploadFile = async () => {
      state.attempts.push(Date.now());
      if (!state.available)
        throw new Error('Isolated unavailable upload server');
      return { objectName: 'recovered.txt', thumbnailObjectName: null };
    };
    fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
      if (type === 'sendMessage') state.sends.push(payload);
      return true;
    };
    (window as any).outboxSender = mountMessageSender('performance-0');
    await (window as any).outboxSender.handleAttachSharedFiles([
      new File(['saved outgoing bytes'], 'weak-connection.txt', {
        type: 'text/plain'
      })
    ]);
  });
  return state;
}

test('проверки очереди сохраняют паузу между неудачными загрузками', async ({
  page
}, testInfo) => {
  const state = await prepareOutbox(page);
  await page.clock.runFor(8000);
  const attempts = await page.evaluate(() => {
    const state = (window as any).outboxRegression;
    return state.attempts.map((time: number) => time - state.attempts[0]);
  });
  await testInfo.attach('attempts.json', {
    body: JSON.stringify(attempts),
    contentType: 'application/json'
  });
  expect(attempts).toHaveLength(3);
  expect(attempts[1]).toBeGreaterThanOrEqual(1000);
  expect(attempts[2] - attempts[1]).toBeGreaterThanOrEqual(3000);
  expect(
    await page.evaluate(() => (window as any).outboxRegression.sends)
  ).toEqual([]);
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    1
  );
  expect(state.errors).toEqual([]);
});

test('возврат соединения обходит паузу и отправляет сохранённый файл один раз', async ({
  page
}) => {
  const state = await prepareOutbox(page);
  await page.clock.runFor(4100);
  const before = await page.evaluate(
    () => (window as any).outboxRegression.attempts.length
  );
  await page.evaluate(() => {
    (window as any).outboxRegression.available = true;
    window.dispatchEvent(new Event('online'));
  });
  await page.clock.runFor(100);
  await expect
    .poll(
      () =>
        page.evaluate(() => ({
          attempts: (window as any).outboxRegression.attempts.length,
          sends: (window as any).outboxRegression.sends.length,
          path: (window as any).outboxRegression.sends[0]?.medias?.[0]?.path
        })),
      { timeout: 1500 }
    )
    .toEqual({ attempts: before + 1, sends: 1, path: 'recovered.txt' });
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    const sent = (window as any).outboxRegression.sends[0];
    const pending = fixture.messages
      .getFullMessagesByTopicId('performance-0')
      .find((row: any) => row.id === JSON.parse(sent.ex).clientId);
    fixture.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: pending.topicId,
        data: { ...pending, id: 'confirmed-outbox', status: 'DELIVERED' }
      }
    });
  });
  await page.clock.runFor(15000);
  expect(
    await page.evaluate(() => (window as any).outboxRegression.sends.length)
  ).toBe(1);
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    1
  );
  expect(state.errors).toEqual([]);
});

test('удалённое вложение не возвращается в превью из запоздалого снимка списка', async ({
  page
}) => {
  const state = await prepareOutbox(page);
  const result = await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const topicId = 'performance-0';
    const pending = fixture.messages
      .getFullMessagesByTopicId(topicId)
      .find((message: any) => message.media?.length);
    const stale = {
      ...fixture.getSelectedTopic(topicId),
      lastMessage: pending
    };
    await fixture.messages.deleteMessageFromLocal(topicId, pending.id);
    fixture.setTopics([stale]);
    return {
      deletedId: pending.id,
      previewId: fixture.getSelectedTopic(topicId).lastMessage?.id,
      stale
    };
  });
  expect(result.previewId).not.toBe(result.deletedId);
  await openFixture(page, { count: 1, shell: true });
  await page.evaluate(async stale => {
    const fixture = (window as any).topicPerformance;
    fixture.setTopics([]);
    localStorage.setItem(
      'chat-offline-fast-topics-v1:performance-user',
      JSON.stringify([stale])
    );
    await fixture.hydrateTopicsFromCache('performance-user');
  }, result.stale);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).topicPerformance.getSelectedTopic('performance-0')
            ?.lastMessage?.id
      )
    )
    .not.toBe(result.deletedId);
  expect(state.errors).toEqual([]);
});
