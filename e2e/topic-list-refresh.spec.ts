import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.setTimeout(60_000);
let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
// eslint-disable-next-line no-empty-pattern
test.beforeAll(async ({}, workerInfo) => {
  fixture = await createAndroidPerformanceServer({
    port: 5570 + workerInfo.workerIndex,
    topicCount: 4,
    userCount: 5,
    messagesPerTopic: 2
  });
});
test.afterAll(async () => fixture.close());

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.addInitScript(
    ({ origin, config, user, topics }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'topic-list-refresh', user })
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
      if (
        (
          performance.getEntriesByType(
            'navigation'
          )[0] as PerformanceNavigationTiming
        )?.type !== 'reload'
      )
        return;
      localStorage.setItem(
        `chat-offline-fast-topics-v1:${user.id}`,
        JSON.stringify(
          topics.map((topic, index) => ({
            ...topic,
            lastMessage: {
              ...topic.lastMessage,
              id: topic.lastMessage.id.replace('29410000', '29420000'),
              text: `Старое превью ${index}`,
              createdAt: `2026-11-12T${index === 1 ? '12:26' : '11:00'}:00Z`
            }
          }))
        )
      );
      localStorage.setItem(
        `chat-topic-preview-v1:${origin}/api:${user.id}`,
        String(Date.now())
      );
      (window as any).__firstRefreshedList = null;
      const capture = () => {
        const rows = [
          ...document.querySelectorAll<HTMLElement>('[data-topic-id]')
        ];
        if (!document.getElementById('startup-shell') && rows.length) {
          (window as any).__firstRefreshedList = rows.map(row => ({
            id: row.dataset.topicId,
            text: row.innerText
          }));
        } else requestAnimationFrame(capture);
      };
      requestAnimationFrame(capture);
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      topics: fixture.topics
    }
  );
});

for (const openConversation of [false, true]) {
  test(`обновление страницы сразу показывает свежий порядок и превью: ${openConversation ? 'переписка' : 'список'}`, async ({
    page,
    isMobile
  }) => {
    test.skip(openConversation && isMobile, 'Боковой список виден на десктопе');
    let refreshed = false;
    let requested = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const freshTopics = fixture.topics.map((topic, index) => ({
      ...topic,
      lastMessage: {
        ...topic.lastMessage,
        text: `Актуальное превью ${index}`,
        createdAt: `2026-11-12T${['10:00', '14:23', '15:41', '15:47'][index]}:00Z`
      }
    }));
    freshTopics.forEach(topic => {
      const messages = fixture.histories.get(topic.id)!;
      fixture.histories.set(topic.id, [
        ...messages.slice(0, -1),
        topic.lastMessage
      ]);
    });
    await page.route('**/api/topics?*', async route => {
      if (refreshed) {
        requested = true;
        await gate;
      }
      return route.fulfill({
        json: { data: freshTopics, total: freshTopics.length }
      });
    });
    await page.goto(
      openConversation ? `/dialogs/${fixture.topics[1].id}` : '/'
    );
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 20_000
    });
    refreshed = true;
    try {
      await page.reload();
      await expect.poll(() => requested).toBe(true);
      if (openConversation) {
        await expect(page.locator('.chat__input .ProseMirror')).toBeVisible();
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        await expect(
          page.locator('[data-testid$="-ContactList-Skeleton1"]')
        ).toBeVisible();
      } else {
        await page.waitForTimeout(500);
        await expect(page.locator('#startup-shell')).toHaveCount(1);
      }
      expect(
        await page.evaluate(() => (window as any).__firstRefreshedList)
      ).toBeNull();
      release();
      await expect(page.locator('#startup-shell')).toHaveCount(0);
      await expect
        .poll(() => page.evaluate(() => (window as any).__firstRefreshedList))
        .not.toBeNull();
      const first = await page.evaluate(
        () =>
          (window as any).__firstRefreshedList as Array<{
            id: string;
            text: string;
          }>
      );
      expect(first.map(row => row.id)).toEqual([
        fixture.topics[3].id,
        fixture.topics[2].id,
        fixture.topics[1].id,
        fixture.topics[0].id
      ]);
      for (const [index, row] of first.entries()) {
        expect(row.text).toContain(`Актуальное превью ${3 - index}`);
        expect(row.text).not.toContain('Старое превью');
      }
      await expect(
        page.locator(`[data-topic-id="${fixture.topics[1].id}"]`)
      ).toBeVisible();
    } finally {
      release();
    }
  });
}

for (const failure of ['offline', 'unavailable', 'stalled'] as const) {
  test(`обновление страницы сохраняет доступ к кешу: ${failure}`, async ({
    page
  }) => {
    await page.goto('/');
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 20_000
    });
    if (failure === 'offline') {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'onLine', { get: () => false });
      });
    }
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/api/topics?*', async route => {
      if (failure === 'stalled') await gate;
      await route
        .fulfill({ status: 503, json: { message: 'Тестовая недоступность' } })
        .catch(() => undefined);
    });
    try {
      await page.reload();
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 8_000
      });
      const row = page.locator(`[data-topic-id="${fixture.topics[1].id}"]`);
      await expect(row).toContainText('Старое превью 1');
      await expect(row).toBeVisible();
      await expect(page.locator('.connection-status:visible')).toContainText(
        failure === 'offline' ? 'Нет сети' : 'Не удалось обновить'
      );
      await expect(
        page.locator('[data-testid$="-ContactList-Skeleton1"]')
      ).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
    }
  });
}
