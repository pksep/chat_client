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

test('зависший сервер при наличии сети открывает кеш и обновляет чаты после восстановления связи', async ({
  page
}) => {
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requestedAt = 0;
  let stalled = true;
  await page.route(`${fixture.origin}/config`, async route => {
    await gate;
    await route.abort().catch(() => undefined);
  });
  await page.route('**/api/topics?*', async route => {
    if (!stalled) return route.continue();
    requestedAt ||= Date.now();
    await gate;
    await route.abort().catch(() => undefined);
  });
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  try {
    await page.goto('/');
    await expect.poll(() => requestedAt).toBeGreaterThan(0);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 8_000
    });
    expect(Date.now() - requestedAt).toBeLessThan(8_000);
    await expect
      .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
      .toContain('Сохранённое сообщение');
    await expect(page.locator('.connection-status:visible')).toContainText(
      'Не удалось обновить'
    );

    stalled = false;
    release();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(
      page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
    ).toContainText(fixture.topics[1].lastMessage.text, { timeout: 15_000 });
    await expect(page.locator('.connection-status:visible')).not.toContainText(
      'Не удалось обновить'
    );
    await expect(page.locator('#startup-shell')).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

for (const failure of ['stalled', 'unavailable'] as const) {
  test(`сервер авторизации ${failure}: сохранённая сессия открывает чаты`, async ({
    page
  }) => {
    await prepare(page);
    await page.addInitScript(() =>
      localStorage.setItem('erp_bootstrap_token', 'fixture-erp-token')
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/chat/token', async route => {
      if (failure === 'stalled') await gate;
      await route
        .fulfill({ status: 503, json: { error: 'Тестовая недоступность' } })
        .catch(() => undefined);
    });
    try {
      await page.goto('/');
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 12_000
      });
      await expect(
        page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
      ).toBeVisible();
      const session = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('chat_auth_session') || 'null')
      );
      expect(session).toMatchObject({
        token: 'chat-294-local-fixture',
        user: { id: fixture.user.id }
      });
      expect(
        await page.evaluate(() => localStorage.getItem('erp_bootstrap_token'))
      ).toBe('fixture-erp-token');
    } finally {
      release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
}

for (const scenario of [
  'fresh',
  'failed',
  'stalled',
  'stalled-in-list',
  'offline',
  'pending-text-without-snapshot'
]) {
  const failNetwork = scenario === 'failed';
  const openFromList = scenario === 'stalled-in-list';
  const stallNetwork = scenario === 'stalled' || openFromList;
  const offline = scenario === 'offline';
  const missingPendingSnapshot = scenario === 'pending-text-without-snapshot';
  const description = openFromList
    ? 'сохранённый чат открывается из списка при зависшем HTTP'
    : stallNetwork
      ? 'зависший HTTP не блокирует сохранённую историю'
      : offline
        ? 'без сети доступна сохранённая история'
        : failNetwork
          ? 'ошибка HTTP возвращает сохранённую историю'
          : missingPendingSnapshot
            ? 'неотправленный текст без отдельного снимка сохраняется'
            : 'свежий ответ сохраняет неотправленное сообщение';
  test(`первый экран чата: ${description}`, async ({
    page,
    isMobile
  }, testInfo) => {
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
    if (offline) {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          get: () => false
        })
      );
      await page.route(`${fixture.origin}/**`, route => route.abort());
      await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    }
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    if (stallNetwork) {
      await page.route('**/api/messages/topic/*?*', async route => {
        await gate;
        await route.abort().catch(() => undefined);
      });
    }
    try {
      if (openFromList) {
        const browserButton = page.getByRole('button', {
          name: 'Остаться в браузере'
        });
        await browserButton.click();
        await page.locator(`[data-topic-id="${topic.id}"]:visible`).click();
      } else {
        await page.goto(`/dialogs/${topic.id}`);
      }
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 30_000
      });
      await expect(
        page.locator(`[data-message-id="${pending.id}"]`)
      ).toBeVisible();
      if (failNetwork || stallNetwork || offline) {
        await expect(
          page.locator(`[data-message-id="${cached.id}"]`)
        ).toBeVisible({ timeout: stallNetwork ? 8_000 : 5_000 });
        if (offline) {
          await expect(
            page.locator('.connection-status:visible')
          ).toContainText('Нет сети');
        } else if (!openFromList) {
          await expect(
            page.getByText(
              'Не удалось обновить сообщения. Показана сохранённая переписка.',
              { exact: true }
            )
          ).toBeVisible();
        }
      } else {
        await expect(
          page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
        ).toBeVisible();
        await expect(
          page.locator(`[data-message-id="${cached.id}"]`)
        ).toHaveCount(0);
      }
      if (stallNetwork) {
        const browserButton = page.getByRole('button', {
          name: 'Остаться в браузере'
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        // На снимках проверяем переписку после закрытия предложения установки.
        if (!openFromList) await browserButton.click();
        for (const dark of [true, false]) {
          await page.evaluate(async dark => {
            const { useThemeStore } = await import('/src/stores/theme.ts');
            useThemeStore().setTheme(dark);
          }, dark);
          await expect(page.locator('html')).toHaveClass(
            new RegExp(dark ? 'theme-dark' : 'theme-light')
          );
          await page.screenshot({
            path: testInfo.outputPath(
              `cached-chat-${dark ? 'dark' : 'light'}.png`
            ),
            fullPage: true
          });
        }
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        release();
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect(
          page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          page.locator(`[data-message-id="${pending.id}"]`)
        ).toBeVisible();
      }
    } finally {
      release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
}
