import { type Page } from '@playwright/test';

export const makeMessages = (topicId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${topicId}-message-${index}`,
    topicId,
    text: `Сообщение ${index} в ${topicId}`,
    type: 'TEXT',
    senderUserId: `peer-${topicId.split('-').at(-1)}`,
    senderUser: { id: `peer-${topicId.split('-').at(-1)}`, name: 'Собеседник' },
    createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
    status: 'READ',
    media: [],
    reactions: [],
    messageRead: [],
    isReadByMe: true
  }));

export async function openFixture(
  page: Page,
  options: {
    count?: number;
    delay?: number;
    topicCount?: number;
    shell?: boolean;
    unreadCount?: number;
    pinOutsideHistory?: boolean;
    backgroundSync?: boolean;
  } = {}
) {
  const requests: string[] = [];
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      failures.push(`${route.request().method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    if (url.pathname.startsWith('/performance-api/')) {
      requests.push(`${route.request().method()} ${url.pathname}${url.search}`);
      if (options.delay)
        await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.backgroundSync && url.pathname.endsWith('/sync/token')) {
        return route.fulfill({
          json: { syncToken: 'isolated-background-sync-token' }
        });
      }
      const match = url.pathname.match(
        /\/messages\/topic\/([^/]+)(\/pinned)?$/
      );
      if (match) {
        const rows = match[2]
          ? options.pinOutsideHistory
            ? [{ ...makeMessages(match[1], 1)[0], isPin: true }]
            : []
          : makeMessages(match[1], options.count ?? 20);
        return route.fulfill({
          json: rows.slice(-Number(url.searchParams.get('limit') || 48))
        });
      }
      const around = url.pathname.match(
        /\/messages\/(performance-\d+)-message-\d+\/around$/
      );
      if (around) {
        return route.fulfill({ json: makeMessages(around[1], 30) });
      }
      return route.fulfill({ json: [] });
    }
    if (url.pathname === '/__topic-performance') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    }
    return route.fallback();
  });
  await page.goto('/__topic-performance');
  await page.evaluate(async options => {
    const path = '/e2e/fixtures/topic-performance-harness.ts';
    const fixture = await import(/* @vite-ignore */ path);
    (window as any).topicPerformance =
      await fixture.initializeTopicPerformanceFixture(
        options.topicCount ?? 4,
        options.shell,
        options.unreadCount
      );
  }, options);
  return { requests, failures, errors };
}

export const openTopic = (page: Page, index: number) =>
  page.getByTestId(`open-performance-${index}`).click();
export const message = (page: Page, index: number, last = 19) =>
  page
    .locator(`[data-message-id="performance-${index}-message-${last}"]`)
    .first();
export const resetMetrics = (page: Page) =>
  page.evaluate(() => (window as any).topicPerformance.resetMetrics());
export const metrics = (page: Page) =>
  page.evaluate(() => ({ ...(window as any).topicPerformance.metrics }));
