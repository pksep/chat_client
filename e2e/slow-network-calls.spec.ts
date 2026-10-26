import { expect, test, type Page } from '@playwright/test';

const makeCalls = (page: number) =>
  Array.from({ length: page === 1 ? 50 : 1 }, (_, index) => ({
    id: `history-page-${page}-${index}`,
    topicId: 'history-source',
    callTopicId: 'history-missing-topic',
    topicType: 'DM',
    topicName: `Звонок ${page}-${index}`,
    senderUserId: 'history-peer',
    text: '',
    ex: { type: 'call', call: { event: 'end', durationSec: 15 } },
    createdAt: new Date(
      Date.UTC(2026, 9, 26, 0, 0, -((page - 1) * 50 + index))
    ).toISOString()
  }));

const openFixture = async (
  page: Page,
  beforeTopics: () => Promise<void>,
  options: { offline?: boolean } = {}
) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__call-history') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    }
    if (url.pathname === '/call-history-api/messages/calls/history') {
      if (options.offline) return route.abort('internetdisconnected');
      const currentPage = Number(url.searchParams.get('page')) || 1;
      return route.fulfill({
        json: {
          data: makeCalls(currentPage),
          meta: { currentPage, totalItems: 51, totalPages: 2 }
        }
      });
    }
    if (url.pathname === '/call-history-api/topics') {
      await beforeTopics();
      return route.fulfill({
        json: {
          data: [],
          meta: { currentPage: 1, totalItems: 0, totalPages: 1 }
        }
      });
    }
    if (url.pathname.startsWith('/call-history-api/')) {
      return route.fulfill({ json: [] });
    }
    return route.fallback();
  });
  await page.goto('/__call-history');
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/call-history.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).callHistoryFixture =
      await fixture.initializeCallHistoryFixture();
  });
};

const persistedCallIds = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const opening = indexedDB.open('chat-sync-shadow-db');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('syncMeta', 'readonly');
          const request = tx
            .objectStore('syncMeta')
            .get('call-history-user:calls:history');
          request.onsuccess = () =>
            resolve((request.result?.value || []).map((item: any) => item.id));
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => db.close();
        };
      })
  );

test('история звонков сохраняется и листается до медленного обновления чатов', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let topicRequests = 0;
  await openFixture(page, async () => {
    topicRequests++;
    await gate;
  });
  try {
    await expect(
      page.getByTestId('History-Item-history-page-1-0')
    ).toBeVisible();
    await expect.poll(() => topicRequests).toBeGreaterThan(0);
    await expect
      .poll(() => persistedCallIds(page), { timeout: 1500 })
      .toHaveLength(50);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).callHistoryFixture.useCallHistoryStore()
                .callHistoryState.isLoading
          ),
        { timeout: 1500 }
      )
      .toBe(false);
    await page.locator('.calls-page__list').evaluate(list => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll'));
    });
    await expect(page.getByTestId('History-Item-history-page-2-0')).toBeVisible(
      { timeout: 1500 }
    );
    await expect.poll(() => persistedCallIds(page)).toHaveLength(51);
    await expect(page.locator('.calls-page__loading-more')).toHaveCount(0);
    expect(topicRequests).toBe(1);
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callHistoryFixture.joinedTopics)
    )
    .toEqual(['history-missing-topic']);
  await openFixture(page, async () => {}, { offline: true });
  await expect(page.getByTestId('History-Item-history-page-1-0')).toBeVisible();
  await expect(page.locator('.calls-page__item')).toHaveCount(50);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        ...(window as any).callHistoryFixture.useCallHistoryStore()
          .callHistoryState
      }))
    )
    .toMatchObject({ isLoading: false, errorMessage: '' });
});

test('фоновое обновление чатов звонков не подписывает прежний аккаунт', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let topicRequests = 0;
  await openFixture(page, async () => {
    topicRequests++;
    await gate;
  });
  try {
    await expect.poll(() => topicRequests).toBe(1);
    await expect.poll(() => persistedCallIds(page)).toHaveLength(50);
    await page.evaluate(async () => {
      const fixture = (window as any).callHistoryFixture;
      fixture.authedUser.value = {
        id: 'another-history-user',
        name: 'Другой пользователь'
      };
      await fixture.hydrateCallHistoryCache();
    });
    await expect(page.locator('.calls-page__item')).toHaveCount(0);
  } finally {
    release();
  }
  await page.evaluate(async () => {
    await (window as any).callHistoryFixture.topics.fetchAllTopics();
  });
  expect(
    await page.evaluate(() => (window as any).callHistoryFixture.joinedTopics)
  ).toEqual([]);
});
