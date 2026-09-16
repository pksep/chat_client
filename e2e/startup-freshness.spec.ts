import { expect, test, type Page } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.setTimeout(60_000);

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
test.beforeAll(async () => {
  fixture = await createAndroidPerformanceServer({
    port: 5194,
    topicCount: 8,
    userCount: 20,
    messagesPerTopic: 20
  });
});
test.afterAll(async () => {
  await fixture.close();
});

async function prepare(page: Page, offline = false) {
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.addInitScript(
    ({ origin, config, user, topics, offline }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'chat-294-local-fixture', user })
      );
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([{ url: origin, config }])
      );
      localStorage.setItem('chat_runtime_last_organization', origin);
      localStorage.setItem(
        `chat-offline-fast-topics-v1:${user.id}`,
        JSON.stringify(topics)
      );
      localStorage.setItem(
        'chat.indexeddb.reset.done',
        'chat-client-indexeddb-reset-2026-04-29-v1'
      );
      if (offline)
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          get: () => false
        });
      (window as any).__firstTopicFrame = null;
      const capture = () => {
        const row = document.querySelector<HTMLElement>(
          `[data-topic-id="${topics[1].id}"]`
        );
        if (
          row &&
          !document.getElementById('startup-shell') &&
          row.getBoundingClientRect().height > 0
        ) {
          (window as any).__firstTopicFrame = row.innerText;
        } else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      offline,
      topics: fixture.topics.map(topic => ({
        ...topic,
        lastMessage: { ...topic.lastMessage, text: 'Сохранённое сообщение' }
      }))
    }
  );
}

test('обычный запуск ждёт свежий список и показывает новое сообщение в первом кадре', async ({
  page
}) => {
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/api/topics?*', async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: {
        data: fixture.topics.map(topic => ({
          ...topic,
          lastMessage: {
            ...topic.lastMessage,
            text: 'Новое сообщение после закрытия',
            updatedAt: '2026-09-15T12:00:00Z'
          }
        })),
        total: fixture.topics.length
      }
    });
  });
  try {
    await page.goto('/');
    await expect.poll(() => requested, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as any).__firstTopicFrame)
    ).toBeNull();
  } finally {
    release();
  }
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
    .toContain('Новое сообщение после закрытия');
  expect(
    await page.evaluate(
      () =>
        (
          performance
            .getEntriesByName('chat-startup:topics-resolved')
            .at(-1) as PerformanceMark
        )?.detail?.isFresh
    )
  ).toBe(true);
});

test('нет сети: обычный запуск показывает кеш со статусом в заголовке', async ({
  page
}) => {
  await prepare(page, true);
  await page.route(`${fixture.origin}/**`, route => route.abort());
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
    .toContain('Сохранённое сообщение');
  await expect(page.locator('.connection-status:visible')).toContainText(
    'Нет сети'
  );
});

test('сервер недоступен: кеш доступен, заголовок сообщает об ошибке обновления', async ({
  page
}) => {
  await prepare(page);
  await page.route('**/api/topics?*', route =>
    route.fulfill({ status: 503, json: { message: 'Тестовая недоступность' } })
  );
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
    .toContain('Сохранённое сообщение');
  await expect(page.locator('.connection-status:visible')).toContainText(
    'Не удалось обновить'
  );
  expect(
    await page.evaluate(
      () =>
        (
          performance
            .getEntriesByName('chat-startup:topics-resolved')
            .at(-1) as PerformanceMark
        )?.detail?.isFresh
    )
  ).toBe(false);
});

for (const scenario of ['fresh', 'failed', 'pending-text-without-snapshot']) {
  const failNetwork = scenario === 'failed';
  const missingPendingSnapshot = scenario === 'pending-text-without-snapshot';
  const description = failNetwork
    ? 'ошибка HTTP возвращает сохранённую историю'
    : missingPendingSnapshot
      ? 'неотправленный текст без отдельного снимка сохраняется'
      : 'свежий ответ сохраняет неотправленное сообщение';
  test(`первый экран чата: ${description}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Оптимизация мобильного холодного запуска');
    await prepare(page);
    await page.goto('/');
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    const topic = fixture.topics[1];
    const cached = {
      ...topic.lastMessage,
      id: '29410000-0000-4000-8000-999999999990',
      text: 'Старая сохранённая история'
    };
    const pending = {
      ...cached,
      id: '29410000-0000-4000-8000-999999999991',
      text: 'Неотправленное сообщение',
      status: 'NOT_DELIVERED',
      ex: JSON.stringify({ clientId: '29410000-0000-4000-8000-999999999991' }),
      senderUserId: fixture.user.id,
      senderUser: fixture.user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await page.evaluate(
      async ({ topicId, userId, cached, pending, missingPendingSnapshot }) => {
        const cache = await import('/src/services/useTopicMessagesCache.ts');
        const shadow = await import('/src/services/useShadowChatSync.ts');
        await cache.saveCachedTopicMessages(topicId, [cached, pending], userId);
        await shadow.saveShadowTopicSnapshot(
          topicId,
          [cached, pending],
          'local',
          userId,
          { replace: true }
        );
        await cache.savePendingUploadMeta({
          topicId,
          userId,
          messageId: pending.id,
          message: missingPendingSnapshot ? undefined : pending,
          forwardMessageIds: []
        });
      },
      {
        topicId: topic.id,
        userId: fixture.user.id,
        cached,
        pending,
        missingPendingSnapshot
      }
    );
    if (failNetwork) {
      await page.route('**/api/messages/topic/*?*', route =>
        route.fulfill({ status: 503, json: {} })
      );
    }
    await page.goto(`/dialogs/${topic.id}`);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    await expect(
      page.locator(`[data-message-id="${pending.id}"]`)
    ).toBeVisible();
    if (failNetwork) {
      await expect(
        page.locator(`[data-message-id="${cached.id}"]`)
      ).toBeVisible();
      await expect(
        page.getByText(
          'Не удалось обновить сообщения. Показана сохранённая переписка.',
          { exact: true }
        )
      ).toBeVisible();
    } else {
      await expect(
        page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
      ).toBeVisible();
      await expect(
        page.locator(`[data-message-id="${cached.id}"]`)
      ).toHaveCount(0);
    }
  });
}
