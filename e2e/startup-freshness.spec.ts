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

async function prepare(page: Page, offline = false, once = false) {
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.addInitScript(
    ({ origin, config, user, topics, offline, once }) => {
      if (once && sessionStorage.getItem('startup-fixture-seeded')) return;
      if (once) sessionStorage.setItem('startup-fixture-seeded', '1');
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
      once,
      topics: fixture.topics.map(topic => ({
        ...topic,
        lastMessage: { ...topic.lastMessage, text: 'Сохранённое сообщение' }
      }))
    }
  );
}

test('прямой вход показывает сохранённое время посещения до ответа пользователей', async ({
  page,
  isMobile
}, testInfo) => {
  test.skip(isMobile, 'Мобильный старт уже ждёт свежее присутствие.');
  await prepare(page);
  await page.route('**/presence-cache-seed', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html></html>'
    })
  );
  await page.goto('/presence-cache-seed');
  const peer = fixture.topics[1].user;
  await page.evaluate(
    async ({ peer, userId }) => {
      const { saveCachedUsers } = await import(
        '/src/services/useChatStateCache.ts'
      );
      await saveCachedUsers(
        [{ ...peer, lastOnline: new Date(Date.now() - 300_000) }] as any,
        userId
      );
    },
    { peer, userId: fixture.user.id }
  );

  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let requested = false;
  await page.route('**/api/users?*', async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: {
        data: fixture.users.map(user =>
          user.id === peer.id ? { ...user, lastOnline: null } : user
        )
      }
    });
  });
  await page.addInitScript(() => {
    (window as any).__firstHeaderFrame = null;
    const capture = () => {
      const status = document.querySelector(
        '.chat__header-profile .user-profile__ex'
      );
      if (status && !document.getElementById('startup-shell')) {
        (window as any).__firstHeaderFrame = status.textContent;
      } else requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  });
  try {
    await page.goto(`/dialogs/${fixture.topics[1].id}`);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    expect(requested).toBe(true);
    const status = page.locator('.chat__header-profile .user-profile__ex');
    const title = page.locator(
      '.chat__header-profile .user-profile__title-text'
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__firstHeaderFrame))
      .toContain('5 минут назад');
    await expect(status).toContainText('5 минут назад');
    const original = (await title.boundingBox())!;
    await page.screenshot({
      path: testInfo.outputPath('cached-last-seen.png')
    });
    release();
    await expect(status).toHaveText('Онлайн');
    const updated = (await title.boundingBox())!;
    expect({ x: updated.x, y: updated.y }).toEqual({
      x: original.x,
      y: original.y
    });
    await page.screenshot({ path: testInfo.outputPath('fresh-online.png') });
  } finally {
    release();
  }
});

test('свежий список чатов доступен до медленного справочника сотрудников', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильный запуск скрывает список до готовности данных');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let usersRequested = false;
  await page.route('**/api/users?*', async route => {
    usersRequested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => usersRequested).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance.getEntriesByName('chat-startup:topics-resolved').length
        )
      )
      .toBe(1);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 1800
    });
    const topic = fixture.topics[1];
    await expect(page.locator(`[data-topic-id="${topic.id}"]`)).toContainText(
      topic.lastMessage.text
    );
    expect(
      await page.evaluate(
        () => performance.getEntriesByName('chat-startup:users-resolved').length
      )
    ).toBe(0);
    await page.getByRole('button', { name: 'Остаться в браузере' }).click();
    await page.locator(`[data-topic-id="${topic.id}"]:visible`).click();
    await expect(
      page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
    ).toBeVisible();
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () => performance.getEntriesByName('chat-startup:users-resolved').length
      )
    )
    .toBe(1);
  await expect(page.locator('#startup-shell')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('недавний кеш виден до сети, затем список обновляется без повторного запуска', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Быстрый показ кеша при мобильном запуске');
  await prepare(page);
  await page.addInitScript(
    ({ origin, userId }) => {
      localStorage.setItem(
        `chat-topic-preview-v1:${origin}/api:${userId}`,
        String(Date.now())
      );
    },
    { origin: fixture.origin, userId: fixture.user.id }
  );
  await page.addInitScript(() => {
    const writes: Array<{ at: number; shellVisible: boolean }> = [];
    (window as any).__topicCacheWrites = writes;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (args[0]?.type === 'topics')
        writes.push({
          at: performance.now(),
          shellVisible: !!document.getElementById('startup-shell')
        });
      return put.apply(this, args);
    };
  });
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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
      .toContain('Сохранённое сообщение');
    expect(
      await page.evaluate(
        () =>
          performance.getEntriesByName('chat-startup:topics-resolved').length
      )
    ).toBe(0);
  } finally {
    release();
  }
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
    .toContain('Сохранённое сообщение');
  await expect(
    page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
  ).toContainText('Новое сообщение после закрытия');
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
  await expect
    .poll(() => page.evaluate(() => (window as any).__topicCacheWrites.length))
    .toBeGreaterThan(0);
  expect(
    await page.evaluate(() => {
      const painted = performance.getEntriesByName(
        'chat-startup:content-painted'
      )[0];
      return (window as any).__topicCacheWrites.every(
        (write: { at: number; shellVisible: boolean }) =>
          !write.shellVisible && write.at > painted.startTime
      );
    })
  ).toBe(true);
});

async function prepareExpiredSession(page: Page, recentCache = true) {
  await prepare(page, false, true);
  await page.addInitScript(
    ({ origin, user, recentCache }) => {
      if (sessionStorage.getItem('expired-startup-fixture-seeded')) return;
      sessionStorage.setItem('expired-startup-fixture-seeded', '1');
      const encode = (part: Record<string, unknown>) =>
        btoa(JSON.stringify(part))
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
      const token = [
        encode({ alg: 'RS256', typ: 'JWT', kid: 'startup-fixture' }),
        encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) - 60 }),
        'fixture-signature'
      ].join('.');
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token, user, source: 'chat_credentials' })
      );
      if (recentCache)
        localStorage.setItem(
          `chat-topic-preview-v1:${origin}/api:${user.id}`,
          String(Date.now())
        );
    },
    { origin: fixture.origin, user: fixture.user, recentCache }
  );
}

for (const refreshStatus of [200, 503, 401]) {
  test(`истёкшая сессия: недавний кеш доступен во время refresh ${refreshStatus}`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Ранний показ списка при мобильном запуске');
    await prepareExpiredSession(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let refreshRequests = 0;
    const topicTokens: string[] = [];
    await page.route('**/api/topics?*', async route => {
      topicTokens.push(route.request().headers().authorization || '');
      await route.continue();
    });
    await page.route('**/api/auth/refresh', async route => {
      refreshRequests++;
      await gate;
      await route.fulfill({
        status: refreshStatus,
        json:
          refreshStatus === 200
            ? { token: 'chat-294-refreshed-fixture', user: fixture.user }
            : { message: 'Тестовый ответ обновления сессии' }
      });
    });
    await page.route('**/api/auth/logout', route =>
      route.fulfill({ json: {} })
    );
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => refreshRequests, { timeout: 30_000 }).toBe(1);
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 1800
      });
      await expect(
        page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
      ).toContainText('Сохранённое сообщение');
      expect(topicTokens).toEqual([]);
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('chat_auth_session') || 'null')
      );
      expect(saved.user.id).toBe(fixture.user.id);
      expect(saved.token).toContain('fixture-signature');
      release();
      if (refreshStatus === 401) {
        await expect(page.getByTestId('AuthorizationScreen')).toBeVisible();
        expect(
          await page.evaluate(() => localStorage.getItem('chat_auth_session'))
        ).toBeNull();
        await expect(page.locator('[data-topic-id]')).toHaveCount(0);
      } else {
        await expect(
          page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
        ).toContainText(fixture.topics[1].lastMessage.text);
        if (refreshStatus === 200) {
          expect(topicTokens.length).toBeGreaterThan(0);
          expect(
            topicTokens.every(
              token => token === 'Bearer chat-294-refreshed-fixture'
            )
          ).toBe(true);
        }
      }
      expect(refreshRequests).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

test('сохранённая переписка открывается из списка во время обновления сессии', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Ранний показ списка при мобильном запуске');
  await prepareExpiredSession(page);
  await page.route('**/startup-session-seed', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  );
  await page.goto('/startup-session-seed');
  const topic = fixture.topics[1];
  await page.evaluate(
    async ({ topic, userId }) => {
      const { saveCachedTopicMessages } = await import(
        '/src/services/useTopicMessagesCache.ts'
      );
      await saveCachedTopicMessages(
        topic.id,
        [{ ...topic.lastMessage, text: 'Локальная история до refresh' }] as any,
        userId
      );
    },
    { topic, userId: fixture.user.id }
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let requested = false;
  await page.route('**/api/auth/refresh', async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: { token: 'chat-294-refreshed-fixture', user: fixture.user }
    });
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(0);
    await page.getByRole('button', { name: 'Остаться в браузере' }).click();
    await page.locator(`[data-topic-id="${topic.id}"]:visible`).click();
    await expect(page.locator('.chat__input')).toBeVisible();
    await expect(
      page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
    ).toContainText('Локальная история до refresh', { timeout: 1800 });
    expect(
      await page.evaluate(
        () => performance.getEntriesByName('chat-startup:sdk-ready').length
      )
    ).toBe(0);
    release();
    await expect(
      page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
    ).toContainText(topic.lastMessage.text);
  } finally {
    release();
  }
});

test('истёкшая сессия без подтверждённого кеша ждёт refresh и свежий список', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Ранний показ списка при мобильном запуске');
  await prepareExpiredSession(page, false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let requested = false;
  await page.route('**/api/auth/refresh', async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: { token: 'chat-294-refreshed-fixture', user: fixture.user }
    });
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => requested, { timeout: 30_000 }).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(1);
    expect(
      await page.evaluate(() => (window as any).__firstTopicFrame)
    ).toBeNull();
    release();
    await expect(page.locator('#startup-shell')).toHaveCount(0);
    await expect(
      page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
    ).toContainText(fixture.topics[1].lastMessage.text);
  } finally {
    release();
  }
});

test('свежий пустой список не ждёт сотрудников и не возвращает старые чаты', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильный запуск скрывает список до готовности данных');
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/users?*', async route => {
    await gate;
    await route.continue();
  });
  await page.route('**/api/topics?*', route =>
    route.fulfill({ json: { data: [], total: 0 } })
  );
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance.getEntriesByName('chat-startup:fresh-list-ready').length
        )
      )
      .toBe(1);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 1800
    });
    await expect(
      page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => performance.getEntriesByName('chat-startup:users-resolved').length
      )
    ).toBe(0);
  } finally {
    release();
  }
});

for (const scenario of [
  'month-old',
  'missing',
  'other-server',
  'other-user',
  'future',
  'no-cache'
]) {
  test(`первый список ждёт свежий снимок: ${scenario}`, async ({ page }) => {
    await prepare(page);
    await page.addInitScript(
      ({ origin, userId, scenario }) => {
        const server =
          scenario === 'other-server'
            ? 'https://other.test/api'
            : `${origin}/api`;
        const user = scenario === 'other-user' ? 'other-user' : userId;
        if (scenario !== 'missing')
          localStorage.setItem(
            `chat-topic-preview-v1:${server}:${user}`,
            String(
              Date.now() +
                (scenario === 'month-old'
                  ? -31 * 86400_000
                  : scenario === 'future'
                    ? 60_000
                    : 0)
            )
          );
        if (scenario === 'no-cache')
          localStorage.removeItem(`chat-offline-fast-topics-v1:${userId}`);
      },
      { origin: fixture.origin, userId: fixture.user.id, scenario }
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let requests = 0;
    await page.route('**/api/topics?*', async route => {
      requests++;
      await gate;
      await route.fulfill({
        json: { data: fixture.topics, total: fixture.topics.length }
      });
    });
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requests, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.locator('#startup-shell')).toHaveCount(1);
      expect(
        await page.evaluate(() => (window as any).__firstTopicFrame)
      ).toBeNull();
      release();
      await expect(page.locator('#startup-shell')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
        .toContain(fixture.topics[1].lastMessage.text);
    } finally {
      release();
    }
  });
}

test('запись кеша другого сервера отменяет прежнюю отметку свежести', async ({
  page
}) => {
  await page.route('**/cache-scope', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  );
  await page.goto('/cache-scope');
  const result = await page.evaluate(async () => {
    const { setConfig } = await import('/src/services/useConfig.ts');
    const { saveCachedTopics } = await import(
      '/src/services/useChatStateCache.ts'
    );
    const { hasRecentTopicPreview } = await import(
      '/src/utils/startup-topic-freshness.ts'
    );
    const userId = 'same-user';
    setConfig({ CHAT_API_DOMAIN: 'https://first.test/api' });
    await saveCachedTopics([], userId, Date.now());
    const firstBefore = hasRecentTopicPreview('https://first.test/api', userId);
    setConfig({ CHAT_API_DOMAIN: 'https://second.test/api' });
    await saveCachedTopics([], userId, Date.now());
    return {
      firstBefore,
      firstAfter: hasRecentTopicPreview('https://first.test/api', userId),
      second: hasRecentTopicPreview('https://second.test/api', userId)
    };
  });
  expect(result).toEqual({
    firstBefore: true,
    firstAfter: false,
    second: true
  });
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
    'Нет сети',
    { timeout: 10_000 }
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
    'Не удалось обновить',
    { timeout: 10_000 }
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
    await expect
      .poll(() => requestedAt, { timeout: 30_000 })
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 8_000
    });
    expect(Date.now() - requestedAt).toBeLessThan(8_000);
    await expect
      .poll(() => page.evaluate(() => (window as any).__firstTopicFrame))
      .toContain('Сохранённое сообщение');
    await expect(page.locator('.connection-status:visible')).toContainText(
      'Не удалось обновить',
      { timeout: 8_000 }
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
    await page.route('**/api/auth/session', async route => {
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
  'fresh-in-list',
  'offline',
  'pending-text-without-snapshot'
]) {
  const failNetwork = scenario === 'failed';
  const openFromList =
    scenario === 'stalled-in-list' || scenario === 'fresh-in-list';
  const freshFromList = scenario === 'fresh-in-list';
  const stallNetwork = scenario === 'stalled' || scenario === 'stalled-in-list';
  const offline = scenario === 'offline';
  const missingPendingSnapshot = scenario === 'pending-text-without-snapshot';
  const description = freshFromList
    ? 'из списка сразу виден кеш, свежий ответ сохраняет входящие сообщения'
    : openFromList
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
    if (freshFromList)
      await page.route('**/api/topics?*', route =>
        route.fulfill({
          json: {
            data: fixture.topics.map(topic => ({
              ...topic,
              unreadMessageCount: 50000
            })),
            total: fixture.topics.length
          }
        })
      );
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
    const historyLimits: number[] = [];
    if (freshFromList) {
      await page.evaluate(async topicId => {
        const { hydrateMessagesFromCache } = await import(
          '/src/services/useMessages.ts'
        );
        await hydrateMessagesFromCache(topicId);
      }, topic.id);
      await page.evaluate(cachedId => {
        (window as any).__sawCachedHistory = false;
        const frame = () => {
          const node = document.querySelector<HTMLElement>(
            `[data-message-id="${cachedId}"]`
          );
          if (node && node.getBoundingClientRect().height > 0)
            (window as any).__sawCachedHistory = true;
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }, cached.id);
      await page.route('**/api/messages/topic/*?*', async route => {
        historyLimits.push(
          Number(new URL(route.request().url()).searchParams.get('limit'))
        );
        await gate;
        await route.continue();
      });
    }
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
      if (freshFromList) {
        await expect.poll(() => historyLimits.length).toBeGreaterThan(0);
        await expect(
          page.locator(`[data-message-id="${cached.id}"]`)
        ).toBeVisible();
        await page.evaluate(
          async ({ topic, user }) => {
            const { addMessageToLocal, editMessageFromLocal } = await import(
              '/src/services/useMessages.ts'
            );
            addMessageToLocal(topic.id, {
              ...topic.lastMessage,
              id: '29410000-0000-4000-8000-999999999992',
              text: 'Пришло во время запроса',
              senderUserId: user.id,
              senderUser: user,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            } as any);
            editMessageFromLocal(topic.id, {
              ...topic.lastMessage,
              text: 'Правка во время запроса'
            } as any);
          },
          { topic, user: fixture.users[2] }
        );
        release();
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
          ).toHaveCount(0);
        }
      } else {
        await expect(
          page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
        ).toBeVisible();
        await expect(
          page.locator(`[data-message-id="${cached.id}"]`)
        ).toHaveCount(0);
        if (freshFromList) {
          expect(
            await page.evaluate(() => (window as any).__sawCachedHistory)
          ).toBe(true);
          expect(historyLimits.every(limit => limit > 0 && limit <= 250)).toBe(
            true
          );
          await expect(
            page.locator(
              '[data-message-id="29410000-0000-4000-8000-999999999992"]'
            )
          ).toContainText('Пришло во время запроса');
          await expect(
            page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
          ).toContainText('Правка во время запроса');
        }
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
