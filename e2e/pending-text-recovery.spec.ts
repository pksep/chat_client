import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const preparePendingText = async (
  page: Page,
  offline = false,
  ageMinutes = 23
) => {
  const state = await openFixture(page, { shell: true, count: 1 });
  await openTopic(page, 0);
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await page.clock.install();
  await page.evaluate(
    async ({ row, offline, ageMinutes }) => {
      const fixture = (window as any).topicPerformance;
      const { controlConnection } = await import(
        '/e2e/fixtures/network-harness.ts'
      );
      const { mountMessageSender } = await import(
        '/e2e/fixtures/message-send-harness.ts'
      );
      const connection = controlConnection();
      (window as any).pendingTextRecovery = { sends: [] };
      fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
        if (type === 'sendMessage')
          (window as any).pendingTextRecovery.sends.push(payload);
        return true;
      };
      if (offline) connection.loseConnection();
      const pending = {
        ...row,
        id: 'restored-text-client-id',
        senderUserId: 'performance-user',
        senderUser: { id: 'performance-user', name: 'Я' },
        createdAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
        status: 'WAIT',
        text: 'Сохранённая отправка без подтверждения',
        ex: JSON.stringify({ clientId: 'restored-text-client-id' })
      };
      fixture.seed('performance-0', [row, pending]);
      (window as any).pendingTextRecovery.sender =
        mountMessageSender('performance-0');
    },
    { row: makeMessages('performance-0', 1)[0], offline, ageMinutes }
  );
  return state;
};

const sends = (page: Page) =>
  page.evaluate(() => (window as any).pendingTextRecovery.sends);

test('старый WAIT восстанавливается, когда соединение уже активно', async ({
  page
}) => {
  const { errors } = await preparePendingText(page);
  await page.clock.runFor(1200);
  await expect.poll(async () => (await sends(page)).length).toBe(1);
  expect(JSON.parse((await sends(page))[0].ex).clientId).toBe(
    'restored-text-client-id'
  );
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    const pending = fixture.messages
      .getFullMessagesByTopicId('performance-0')
      .find((row: any) => row.id === 'restored-text-client-id');
    fixture.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: 'performance-0',
        data: { ...pending, id: 'confirmed-restored-text', status: 'DELIVERED' }
      }
    });
  });
  await page.clock.fastForward(31_000);
  expect((await sends(page)).length).toBe(1);
  await expect(
    page.locator('[data-message-id="confirmed-restored-text"]')
  ).toHaveCount(1);
  await expect(
    page.locator('[data-message-id="restored-text-client-id"]')
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('долгое отсутствие сети не отменяет отправку после подключения', async ({
  page
}) => {
  const { errors } = await preparePendingText(page, true, 0);
  await page.clock.fastForward(23 * 60_000);
  expect((await sends(page)).length).toBe(0);
  await page.evaluate(() => (window as any).topicPerformance.sdk.connect());
  await page.clock.runFor(1200);
  await expect.poll(async () => (await sends(page)).length).toBe(1);
  expect(errors).toEqual([]);
});

test('неподтверждённая восстановленная отправка получает ошибку вместо вечных часов', async ({
  page
}) => {
  const { errors } = await preparePendingText(page);
  await page.clock.runFor(1200);
  await expect.poll(async () => (await sends(page)).length).toBe(1);
  await page.clock.fastForward(181_000);
  const pending = page.locator('[data-message-id="restored-text-client-id"]');
  await expect(pending.locator('[data-testid$="-ErrorIcon"]')).toBeVisible();
  await expect(pending.locator('[data-testid$="-SendingIcon"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
