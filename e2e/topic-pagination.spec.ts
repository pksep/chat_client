import { expect, test, type Page } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);
let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;

test.beforeAll(async ({}, workerInfo) => {
  fixture = await createAndroidPerformanceServer({
    port: 5320 + workerInfo.workerIndex,
    topicCount: 120,
    userCount: 121,
    messagesPerTopic: 2
  });
});
test.afterAll(async () => {
  await fixture.close();
});

async function prepare(page: Page, cached = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.addInitScript(
    ({ origin, config, user, topics, cached }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'topic-pagination-fixture', user })
      );
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([{ url: origin, config }])
      );
      localStorage.setItem('chat_runtime_last_organization', origin);
      localStorage.setItem(
        'chat.indexeddb.reset.done',
        'chat-client-indexeddb-reset-2026-04-29-v1'
      );
      if (cached)
        localStorage.setItem(
          `chat-offline-fast-topics-v1:${user.id}`,
          JSON.stringify(topics)
        );
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      topics: fixture.topics,
      cached
    }
  );
  return errors;
}

async function dismissInstallPrompt(page: Page) {
  const button = page.getByRole('button', { name: 'Остаться в браузере' });
  if (await button.isVisible()) await button.click();
}

async function scrollToEnd(page: Page) {
  await page
    .locator('[data-testid$="-ContactList-LoadMore"]')
    .evaluate(element =>
      element.scrollIntoView({ block: 'end', behavior: 'instant' })
    );
}

test('следующие страницы загружаются при прокрутке к концу списка', async ({
  page
}) => {
  const errors = await prepare(page);
  const queries: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let secondRequested = false;
  await page.route('**/api/topics?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    queries.push(params.toString());
    if (params.get('page') === '2') {
      secondRequested = true;
      await gate;
    }
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 15000
    });
    await expect(page.locator('[data-topic-id]')).toHaveCount(50);
    expect(secondRequested).toBe(false);
    expect(queries).toEqual([
      'page=1&limit=50&scope=chats&includeUnread=true&includeSync=true'
    ]);
    await dismissInstallPrompt(page);
    const sentinel = page.locator('[data-testid$="-ContactList-LoadMore"]');
    await expect(
      page.getByRole('button', { name: 'Показать ещё' })
    ).toHaveCount(0);
    await scrollToEnd(page);
    await expect.poll(() => secondRequested).toBe(true);
    await expect(page.locator('[data-topic-id]')).toHaveCount(50);
    await expect(sentinel.getByRole('status')).toHaveText('Загрузка…');
    await scrollToEnd(page);
    expect(queries).toHaveLength(2);
    release();
    await expect(page.locator('[data-topic-id]')).toHaveCount(100);
    expect(queries).toHaveLength(2);
    await scrollToEnd(page);
    await expect(page.locator('[data-topic-id]')).toHaveCount(120);
    await expect(sentinel).toHaveCount(0);
    expect(queries).toEqual([
      'page=1&limit=50&scope=chats&includeUnread=true&includeSync=true',
      'page=2&limit=50&scope=chats',
      'page=3&limit=50&scope=chats'
    ]);
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined);
  }
});

test('сбой второй страницы сохраняет кеш остальных чатов и не создаёт новое Избранное', async ({
  page
}) => {
  const errors = await prepare(page, true);
  const mutations: string[] = [];
  const pages: string[] = [];
  let failSecondPage = true;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith('/groups'))
      mutations.push(request.url());
  });
  await page.route('**/api/topics?*', route => {
    const pageNumber = new URL(route.request().url()).searchParams.get('page')!;
    pages.push(pageNumber);
    return pageNumber === '2' && failSecondPage
      ? route.fulfill({
          status: 503,
          json: { message: 'Тестовая недоступность' }
        })
      : route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15_000
  });
  await expect(page.locator('[data-topic-id]')).toHaveCount(120);
  await dismissInstallPrompt(page);
  const sentinel = page.locator('[data-testid$="-ContactList-LoadMore"]');
  await scrollToEnd(page);
  await expect(page.locator('.connection-status:visible')).toContainText(
    'Не удалось обновить'
  );
  await expect(sentinel.getByRole('status')).toHaveCount(0);
  await expect(page.locator('[data-topic-id]')).toHaveCount(120);
  expect(pages).toEqual(['1', '2']);
  failSecondPage = false;
  await page.locator('[data-topic-id]').first().scrollIntoViewIfNeeded();
  await expect(sentinel).not.toBeInViewport();
  await scrollToEnd(page);
  await expect(sentinel).toHaveCount(0);
  expect(pages).toEqual(['1', '2', '2', '3']);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test('прямая ссылка открывает выбранный чат без ожидания общего списка', async ({
  page
}) => {
  const errors = await prepare(page);
  const topic = fixture.topics[100];
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/topics?*', async route => {
    await gate;
    await route.abort().catch(() => undefined);
  });
  try {
    await page.goto(`/dialogs/${topic.id}`);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 15_000
    });
    await expect(
      page.locator(`[data-message-id="${topic.lastMessage.id}"]`)
    ).toBeVisible();
    await expect(page.locator('[contenteditable="true"]')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('зависшая загрузка модуля переписки не оставляет весь интерфейс под скелетоном', async ({
  page
}) => {
  const errors = await prepare(page, true);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/*MessageList.vue*', async route => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto(`/favorites/${fixture.topics[0].id}`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => requested, { timeout: 15000 }).toBe(true);
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 8000
    });
    release();
    await expect(page.locator('[contenteditable="true"]')).toBeVisible({
      timeout: 15_000
    });
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('главная получает 30 обычных чатов вместо 120 топиков разных разделов', async ({
  page
}) => {
  const original = fixture.topics.slice();
  for (let index = 30; index < fixture.topics.length; index++) {
    fixture.topics[index] = {
      ...fixture.topics[index],
      type: 'GROUP',
      group: {
        description:
          index < 90
            ? `sep-chat:call-topic:v1:room-${index}:${fixture.user.id}`
            : 'sep-chat:external-inquiry:v1'
      }
    } as any;
  }
  try {
    await prepare(page);
    const queries: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/topics')
        queries.push(request.url());
    });
    await page.goto('/');
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 15000
    });
    await expect(page.locator('[data-topic-id]')).toHaveCount(30);
    await expect(
      page.locator('[data-testid$="-ContactList-LoadMore"]')
    ).toHaveCount(0);
    expect(queries).toHaveLength(1);
    expect(new URL(queries[0]).searchParams.get('scope')).toBe('chats');
  } finally {
    fixture.topics.splice(0, fixture.topics.length, ...original);
  }
});

for (const cached of [false, true]) {
  test(`непрочитанные за пределами первой страницы учитываются без загрузки карточек: кеш ${cached}`, async ({
    page
  }) => {
    const topic = fixture.topics[100];
    const previousCount = topic.unreadMessageCount;
    topic.unreadMessageCount = 7;
    try {
      await prepare(page, cached);
      if (cached)
        await page.addInitScript(
          ({ key, id, userId }) => {
            const topics = JSON.parse(localStorage.getItem(key)!);
            const topic = topics.find((item: { id: string }) => item.id === id);
            topic.unreadMessageCount = 0;
            topic.lastMessage = {
              ...topic.lastMessage,
              senderUserId: userId,
              createdAt: '2020-01-01T00:00:00Z',
              updatedAt: '2020-01-01T00:00:00Z'
            };
            localStorage.setItem(key, JSON.stringify(topics));
          },
          {
            key: `chat-offline-fast-topics-v1:${fixture.user.id}`,
            id: topic.id,
            userId: fixture.user.id
          }
        );
      const pages: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname === '/api/topics')
          pages.push(url.searchParams.get('page')!);
      });
      await page.goto('/');
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 15000
      });
      await expect(page.locator('[data-topic-id]')).toHaveCount(
        cached ? 120 : 50
      );
      await expect(page).toHaveTitle(/\(7\)/);
      expect(pages).toEqual(['1']);
    } finally {
      topic.unreadMessageCount = previousCount;
    }
  });
}

test('старый сервер без scope: служебная первая страница не оставляет список чатов пустым', async ({
  page
}) => {
  await prepare(page);
  const all = fixture.topics.map((topic, index) =>
    index < 90
      ? {
          ...topic,
          type: 'GROUP',
          user: null,
          group: {
            id: `legacy-call-${index}`,
            description: `sep-chat:call-topic:v1:room-${index}:${fixture.user.id}`,
            members: []
          }
        }
      : topic
  );
  const pages: number[] = [];
  let thirdPageRequested!: () => void;
  const thirdPage = new Promise<void>(resolve => {
    thirdPageRequested = resolve;
  });
  await page.route('**/api/topics?*', async route => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get('page')
    );
    pages.push(pageNumber);
    if (pageNumber === 2) await thirdPage;
    if (pageNumber === 3) thirdPageRequested();
    return route.fulfill({
      json: {
        data: all.slice((pageNumber - 1) * 50, pageNumber * 50),
        meta: { totalItems: 120, totalPages: 3, currentPage: pageNumber }
      }
    });
  });
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15000
  });
  await expect(
    page.locator(`[data-topic-id="${fixture.topics[119].id}"]`)
  ).toHaveCount(1);
  expect(pages).toEqual([1, 2, 3]);
});

test('поиск находит чат со следующей страницы', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 15000
  });
  await expect(page.locator('[data-topic-id]')).toHaveCount(50);
  const search = page.locator('input').filter({ visible: true }).first();
  await dismissInstallPrompt(page);
  await search.click();
  await search.fill(fixture.topics[100].user.initials);
  await expect(search).toHaveValue(fixture.topics[100].user.initials);
  await expect(
    page.locator(`[data-topic-id="${fixture.topics[100].id}"]`)
  ).toBeVisible();
});
