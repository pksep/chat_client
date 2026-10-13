import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

async function prepareOwnMessage(page: Page, connected = true) {
  const state = await openFixture(page, { count: 2, topicCount: 2 });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-1"]').first()
  ).toBeVisible();
  const rows = makeMessages('performance-0', 2);
  rows[0].senderUserId = 'performance-user';
  rows[0].senderUser = { id: 'performance-user', name: 'Тест' };
  await page.evaluate(
    ({ rows, connected }) => {
      const fixture = (window as any).topicPerformance;
      fixture.seed('performance-0', rows);
      (window as any).deleteRequests = [];
      fixture.sdk.sendWebSocketEvent = (type: string, payload: unknown) => {
        if (type === 'deleteMessage')
          (window as any).deleteRequests.push(payload);
        return connected;
      };
    },
    { rows, connected }
  );
  return { state, rows };
}

async function confirmDelete(page: Page) {
  await page
    .locator('[data-message-id="performance-0-message-0"]')
    .first()
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('button', { name: 'Да', exact: true }).click();
}

test('удалённое сообщение не возвращается после быстрого перехода и устаревшей истории без события сервера', async ({
  page
}) => {
  const { state, rows } = await prepareOwnMessage(page);
  await confirmDelete(page);
  await openTopic(page, 1);
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-1"]').first()
  ).toBeVisible();
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]')
  ).toHaveCount(0);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    rows
  );
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]')
  ).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).deleteRequests)).toEqual([
    { topicId: 'performance-0', messageId: 'performance-0-message-0' }
  ]);
  expect(state.errors).toEqual([]);
});

test('при отсутствии сокета удаление завершается через HTTP даже после смены топика', async ({
  page
}) => {
  await prepareOwnMessage(page, false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(
    '**/performance-api/topics/performance-0/messages/performance-0-message-0',
    async route => {
      await gate;
      await route.fulfill({ json: { deleted: true } });
    }
  );
  const request = page.waitForRequest(
    req =>
      req.method() === 'DELETE' &&
      req
        .url()
        .includes('/topics/performance-0/messages/performance-0-message-0')
  );
  try {
    await confirmDelete(page);
    await request;
    await openTopic(page, 1);
    release();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).topicPerformance.messages
            .getFullMessagesByTopicId('performance-0')
            .some((row: any) => row.id === 'performance-0-message-0')
        )
      )
      .toBe(false);
    await openTopic(page, 0);
    await expect(
      page.locator('[data-message-id="performance-0-message-0"]')
    ).toHaveCount(0);
    await expect(
      page.locator('[data-message-id="performance-0-message-1"]').first()
    ).toBeVisible();
  } finally {
    release();
  }
});

test('неуспешное HTTP-удаление сохраняет сообщение после возврата в топик', async ({
  page
}) => {
  await prepareOwnMessage(page, false);
  await page.route(
    '**/performance-api/topics/performance-0/messages/performance-0-message-0',
    route =>
      route.fulfill({ status: 500, json: { message: 'Ошибка удаления' } })
  );
  await confirmDelete(page);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const path = '/src/composables/useNotifications.ts';
        const { useNotifications } = await import(/* @vite-ignore */ path);
        return useNotifications().state.items.some(
          (item: { description: string }) =>
            item.description === 'Не удалось удалить сообщение'
        );
      })
    )
    .toBe(true);
  await openTopic(page, 1);
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]').first()
  ).toBeVisible();
});

for (const source of ['socket', 'history']) {
  test(`удаление до подтверждения отправки учитывает новый ID сервера из ${source} после смены топика`, async ({
    page
  }) => {
    const { rows } = await prepareOwnMessage(page);
    const pending = {
      ...rows[0],
      status: 'WAIT',
      ex: JSON.stringify({ clientId: rows[0].id })
    };
    await page.evaluate(
      rows => (window as any).topicPerformance.seed('performance-0', rows),
      [pending, rows[1]]
    );
    await confirmDelete(page);
    await openTopic(page, 1);
    const confirmed = {
      ...pending,
      id: 'confirmed-message',
      status: 'DELIVERED'
    };
    if (source === 'socket') {
      await page.evaluate(message => {
        (window as any).topicPerformance.sdk.ws.handleWebSocketEvent({
          type: 'newMessage',
          payload: message
        });
      }, confirmed);
      expect(
        await page.evaluate(
          () =>
            (window as any).topicPerformance.getSelectedTopic('performance-0')
              ?.lastMessage?.id
        )
      ).not.toBe(confirmed.id);
    } else {
      await page.evaluate(
        rows => (window as any).topicPerformance.seed('performance-0', rows),
        [confirmed, rows[1]]
      );
    }
    await openTopic(page, 0);
    await expect(
      page.locator('[data-message-id="confirmed-message"]')
    ).toHaveCount(0);
    await page.evaluate(
      rows => (window as any).topicPerformance.seed('performance-0', rows),
      [confirmed, rows[1]]
    );
    await expect(
      page.locator('[data-message-id="confirmed-message"]')
    ).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).deleteRequests)).toEqual([
      { topicId: 'performance-0', messageId: 'confirmed-message' }
    ]);
  });
}

test('картинка с ID сервера удаляется на сервере даже при устаревшем статусе отправки после перехода', async ({
  page
}) => {
  const { rows } = await prepareOwnMessage(page);
  const image = {
    ...rows[0],
    text: '',
    status: 'WAIT',
    ex: JSON.stringify({ clientId: 'original-image-client-id' }),
    media: [
      {
        id: 'uploaded-image',
        name: 'image.png',
        path: 'image.png',
        type: 'IMAGE',
        size: 100,
        width: 100,
        height: 100
      }
    ]
  };
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    [image, rows[1]]
  );
  await openTopic(page, 1);
  await openTopic(page, 0);
  await confirmDelete(page);
  expect(await page.evaluate(() => (window as any).deleteRequests)).toEqual([
    { topicId: 'performance-0', messageId: rows[0].id }
  ]);
  await openTopic(page, 1);
  await openTopic(page, 0);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    [image, rows[1]]
  );
  await expect(
    page.locator('[data-message-id="performance-0-message-0"]')
  ).toHaveCount(0);
});
