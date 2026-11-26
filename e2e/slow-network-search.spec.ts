import { expect, test, type Page } from '@playwright/test';
import { searchMessages as savedMessages } from './fixtures/slow-network-search-data';

const openFixture = async (
  page: Page,
  remoteSearch: Parameters<Page['route']>[1]
) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__slow-network-search')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    if (url.pathname.startsWith('/search-api/messages/topic/'))
      return route.fulfill({
        json: url.pathname.endsWith('/pinned') ? [] : savedMessages
      });
    if (url.pathname === '/search-api/users/me/access')
      return route.fulfill({ json: { ai: false, client: false } });
    if (url.pathname.startsWith('/search-api/'))
      return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.route('**/search-api/search/messages?*', remoteSearch);
  await page.goto('/__slow-network-search');
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/slow-network-search.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).searchFixture = await fixture.initializeSearchFixture();
  });
  const stay = page.getByRole('button', {
    name: 'Остаться в браузере',
    exact: true
  });
  if (await stay.isVisible()) await stay.click();
  return errors;
};

test('локальные результаты общего поиска доступны до медленного ответа сервера', async ({
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  const errors = await openFixture(page, async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: {
        data: [
          { ...savedMessages[1], text: 'Локальный поиск: обновлено сервером' },
          { ...savedMessages[0], id: 'search-remote' }
        ],
        total: 3
      }
    });
  });
  const region = page.locator(
    isMobile ? '.mobile-list-container__section--chats' : '.menu'
  );
  try {
    await region.locator('.chats-toolbar input').click();
    await region.locator('.chats-toolbar input').fill('Локальный поиск');
    await expect(region.locator('.chats-toolbar input')).toHaveValue(
      'Локальный поиск'
    );
    await expect.poll(() => requested).toBe(true);
    await expect(
      region.locator('.contact-list__item--message-result')
    ).toHaveCount(2, { timeout: 1500 });
    await expect(
      region.getByText('Локальный поиск: второе сообщение', { exact: true })
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(
    region.locator('.contact-list__item--message-result')
  ).toHaveCount(3);
  await expect(
    region.getByText('Локальный поиск: обновлено сервером', { exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('поиск по заметке показывает оригинал и только доступные комментарии', async ({
  page,
  isMobile
}, testInfo) => {
  let includeNotes = false;
  const stamp = '2026-11-26T07:00:00.000Z';
  const comments = [
    {
      id: 'note-all',
      scope: 'ALL',
      authorId: 'search-peer',
      text: 'План логистики: общая заметка'
    },
    {
      id: 'note-self',
      scope: 'SELF',
      authorId: 'search-user',
      text: 'Моя личная пометка'
    },
    {
      id: 'note-foreign',
      scope: 'SELF',
      authorId: 'search-peer',
      text: 'Чужая скрытая пометка'
    }
  ].map(note => ({
    ...note,
    topicId: 'search-topic',
    messageId: 'search-note-hit',
    authorName: 'Автор',
    authorAvatarUrl: null,
    revision: '9007199254740993',
    createdAt: stamp,
    updatedAt: stamp
  }));
  const errors = await openFixture(page, async route => {
    includeNotes =
      new URL(route.request().url()).searchParams.get('includePinComments') ===
      'true';
    await route.fulfill({
      json: {
        data: [
          {
            ...savedMessages[0],
            id: 'search-note-hit',
            text: 'Итог встречи',
            isPin: true,
            isPinnedForAll: true,
            isPinnedForMe: true,
            pinComments: comments
          }
        ],
        total: 1
      }
    });
  });
  const region = page.locator(
    isMobile ? '.mobile-list-container__section--chats' : '.menu'
  );
  await region.locator('.chats-toolbar input').fill('План логистики');
  await expect(
    region.locator('.contact-list__item--message-result')
  ).toHaveCount(1);
  await expect(region.getByText('Итог встречи', { exact: true })).toBeVisible();
  await expect(region.locator('.pin-note')).toHaveCount(2);
  await expect(
    region.getByText('План логистики: общая заметка', { exact: true })
  ).toBeVisible();
  await expect(
    region.getByText('Чужая скрытая пометка', { exact: true })
  ).toHaveCount(0);
  expect(includeNotes).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('search-pin-comments.png') });
});

const openChatSearch = async (page: Page, isMobile: boolean) => {
  await page
    .locator('li[data-topic-id="search-topic"] .contact-list__item')
    .click();
  await expect(page.locator('.chat__input')).toBeVisible();
  if (isMobile) {
    await page.locator('[data-testid$="-Header-PopoverIcon"]').click();
    await page
      .getByRole('button', { name: 'Поиск в чате', exact: true })
      .click();
  } else await page.locator('[data-testid$="-Header-SearchIcon"]').click();
  const suffix = isMobile ? 'MobileSearch' : 'Search';
  return {
    input: page.locator(`[data-testid$="-Header-${suffix}Input"] input`),
    count: page.locator(`[data-testid$="-Header-${suffix}Count"]`),
    previous: page.locator(`[data-testid$="-Header-${suffix}Prev"]`)
  };
};

test('поиск в чате работает до HTTP и сохраняет выбранное сообщение после ответа', async ({
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  const errors = await openFixture(page, async route => {
    requested = true;
    await gate;
    await route.fulfill({
      json: {
        data: [
          {
            ...savedMessages[1],
            id: 'search-remote',
            createdAt: new Date(Date.UTC(2026, 9, 26, 0, 0, 5)).toISOString()
          }
        ],
        total: 3
      }
    });
  });
  const search = await openChatSearch(page, isMobile);
  try {
    await search.input.fill('Локальный поиск');
    await expect.poll(() => requested).toBe(true);
    await expect(search.count).toHaveText('1 из 2', { timeout: 1500 });
    await search.previous.click();
    await expect(search.count).toHaveText('2 из 2');
    await expect(
      page.locator('[data-message-id="search-local-1"].highlighted')
    ).toBeInViewport();
  } finally {
    release();
  }
  await expect(search.count).toHaveText('3 из 3');
  await expect(
    page.locator('[data-message-id="search-local-1"].highlighted')
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test('поздний ответ поиска не возвращает прежний запрос во время ввода нового', async ({
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let firstRequested = false;
  const errors = await openFixture(page, async route => {
    const query =
      new URL(route.request().url()).searchParams.get('query') || '';
    if (query.toLowerCase().includes('локальный')) {
      firstRequested = true;
      await gate;
    }
    await route.fulfill({ json: { data: [], total: 0 } });
  });
  const search = await openChatSearch(page, isMobile);
  try {
    await search.input.fill('Локальный поиск');
    await expect.poll(() => firstRequested).toBe(true);
    await expect(search.count).toHaveText('1 из 2', { timeout: 1500 });
    // Ответ прежнего запроса приходит до запуска нового debounce.
    await search.input.fill('Другая');
    release();
    await expect(search.count).toHaveText('1 из 1');
    await expect(
      page.locator('[data-message-id="search-another"].highlighted')
    ).toBeInViewport();
    await search.input.fill('');
    await expect(search.count).toHaveCount(0);
  } finally {
    release();
  }
  expect(errors).toEqual([]);
});

test('без сети поиск показывает локальные результаты без HTTP', async ({
  page,
  isMobile
}) => {
  let requests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false
    });
  });
  const errors = await openFixture(page, async route => {
    requests++;
    await route.abort();
  });
  const region = page.locator(
    isMobile ? '.mobile-list-container__section--chats' : '.menu'
  );
  await region.locator('.chats-toolbar input').click();
  await region.locator('.chats-toolbar input').fill('Локальный поиск');
  await expect(
    region.locator('.contact-list__item--message-result')
  ).toHaveCount(2, { timeout: 1500 });
  await expect(
    region.locator('[data-testid$="-ContactList-MessageSearchLoading"]')
  ).toHaveCount(0);
  expect(requests).toBe(0);
  expect(errors).toEqual([]);
});

test('удаление во время поиска не возвращается из старого локального снимка или HTTP', async ({
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const errors = await openFixture(page, async route => {
    await gate;
    await route.fulfill({
      json: { data: savedMessages.slice(0, 2), total: 2 }
    });
  });
  const region = page.locator(
    isMobile ? '.mobile-list-container__section--chats' : '.menu'
  );
  try {
    await region.locator('.chats-toolbar input').click();
    await region.locator('.chats-toolbar input').fill('Локальный поиск');
    await expect(
      region.locator('.contact-list__item--message-result')
    ).toHaveCount(2, { timeout: 1500 });
    await page.evaluate(async () => {
      await (window as any).searchFixture.deleteMessageFromLocal(
        'search-topic',
        'search-local-2',
        'search-user'
      );
    });
  } finally {
    release();
  }
  await expect(
    region.locator('.contact-list__item--message-result')
  ).toHaveCount(1);
  await expect(
    region.getByText('Локальный поиск: второе сообщение', { exact: true })
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('медленный ответ поиска сохраняет более свежую локальную правку', async ({
  page,
  isMobile
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const errors = await openFixture(page, async route => {
    await gate;
    await route.fulfill({
      json: { data: savedMessages.slice(0, 2), total: 2 }
    });
  });
  const region = page.locator(
    isMobile ? '.mobile-list-container__section--chats' : '.menu'
  );
  try {
    await region.locator('.chats-toolbar input').click();
    await region.locator('.chats-toolbar input').fill('Локальный поиск');
    await expect(
      region.locator('.contact-list__item--message-result')
    ).toHaveCount(2, { timeout: 1500 });
    await page.evaluate(() => (window as any).searchFixture.editLocalResult());
  } finally {
    release();
  }
  await expect(
    region.getByText('Локальный поиск: новая правка', { exact: true })
  ).toBeVisible();
  await expect(
    region.getByText('Локальный поиск: второе сообщение', { exact: true })
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
