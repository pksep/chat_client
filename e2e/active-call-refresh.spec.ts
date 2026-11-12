import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.setTimeout(60_000);
let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, workerInfo) => {
  fixture = await createAndroidPerformanceServer({
    port: 5560 + workerInfo.workerIndex,
    topicCount: 3,
    userCount: 5,
    messagesPerTopic: 2
  });
});
test.afterAll(async () => fixture.close());

for (const result of ['ended', 'active', 'unavailable'] as const) {
  test(`обновление страницы: ${result}, индикатор ждёт подтверждения звонка`, async ({
    page,
    isMobile
  }) => {
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    );
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.addInitScript(
      ({ origin, config, user }) => {
        performance.setResourceTimingBufferSize(5000);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'active-call-refresh', user })
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
      },
      { origin: fixture.origin, config: fixture.config, user: fixture.user }
    );
    const topic = fixture.topics[1];
    const call = {
      roomId: 'refresh-old-call',
      callType: 'livekit',
      startTime: Date.now() - 3 * 60 * 60_000,
      participantCount: 2,
      groupMode: false
    };
    let refreshed = false;
    let releasePages!: () => void;
    const pagesGate = new Promise<void>(resolve => (releasePages = resolve));
    await page.route('**/api/topics?*', async route => {
      const currentPage =
        Number(new URL(route.request().url()).searchParams.get('page')) || 1;
      const paginated = refreshed && result === 'active';
      if (paginated && currentPage > 1) await pagesGate;
      return route.fulfill({
        json: {
          data: (currentPage === 1 ? fixture.topics : []).map(item =>
            refreshed && item.id === topic.id
              ? { ...item, activeCall: call }
              : item
          ),
          meta: { totalItems: 3, totalPages: paginated ? 2 : 1, currentPage }
        }
      });
    });
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    let statusRequests = 0;
    await page.route('**/api/calls/status?*', async route => {
      statusRequests++;
      await gate;
      if (result === 'unavailable') return route.abort('failed');
      return route.fulfill({
        json: { ...call, topicId: topic.id, active: result === 'active' }
      });
    });
    await page.goto(`/dialogs/${topic.id}`);
    await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
      timeout: 20_000
    });
    refreshed = true;
    try {
      await page.reload();
      await expect
        .poll(() => statusRequests, { timeout: 20_000 })
        .toBeGreaterThan(0);
      await expect(page.locator('#startup-shell')).toHaveCount(0);
      await expect(page.locator('.contact-list__call-indicator')).toHaveCount(
        0
      );
      await expect(page.locator('.chat__header-active-call')).toHaveCount(0);
    } finally {
      release();
      releasePages();
    }
    await expect
      .poll(() =>
        page.evaluate(async topicId => {
          const moduleUrl = performance
            .getEntriesByType('resource')
            .find(entry =>
              /\/src\/composables\/useTopics\.ts(?:\?|$)/.test(entry.name)
            )!.name;
          const { getSelectedTopic } = await import(
            /* @vite-ignore */ moduleUrl
          );
          return getSelectedTopic(topicId)?.activeCall;
        }, topic.id)
      )
      .toEqual(result === 'active' ? expect.objectContaining(call) : null);
    await expect(page.locator('.chat__header-active-call')).toHaveCount(
      result === 'active' ? 1 : 0
    );
    if (isMobile) {
      const prompt = page.getByRole('button', { name: 'Остаться в браузере' });
      if (await prompt.isVisible()) await prompt.click();
      await page.getByRole('button', { name: 'Назад', exact: true }).click();
    }
    const row = page.locator(`[data-topic-id="${topic.id}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('.contact-list__call-indicator')).toHaveCount(
      result === 'active' ? 1 : 0
    );
    if (result === 'active') {
      await page.route('**/api/calls/status?*', route => route.abort('failed'));
      await page.evaluate(
        async call => {
          const moduleUrl = performance
            .getEntriesByType('resource')
            .find(entry =>
              /\/src\/services\/useCalls\.ts(?:\?|$)/.test(entry.name)
            )!.name;
          const { syncServerActiveCalls } = await import(
            /* @vite-ignore */ moduleUrl
          );
          await syncServerActiveCalls([call]);
        },
        { ...call, topicId: topic.id }
      );
      await expect(row.locator('.contact-list__call-indicator')).toHaveCount(1);
    }
  });
}
