import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
test.beforeAll(async () => {
  fixture = await createAndroidPerformanceServer({
    port: 5194,
    userCount: 4000,
    messagesPerTopic: 20
  });
});
test.afterAll(() => fixture.close());

for (const empty of [false, true]) {
  test(`первый список ${empty ? 'пустой' : 'с чатами'} не ждёт создания Избранного`, async ({
    page,
    isMobile
  }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseFavorite!: () => void;
    let releaseUsers!: () => void;
    const favoriteGate = new Promise<void>(resolve => {
      releaseFavorite = resolve;
    });
    const usersGate = new Promise<void>(resolve => {
      releaseUsers = resolve;
    });
    let favoriteCreated = false;
    let creations = 0;
    let topicsRequests = 0;
    let contentReadyAtCreation: boolean | undefined;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname))
        return route.abort();
      if (url.pathname === '/api/users') await usersGate;
      if (
        url.pathname === '/api/groups' &&
        route.request().method() === 'POST'
      ) {
        creations++;
        contentReadyAtCreation = await page.evaluate(
          () =>
            performance.getEntriesByName('chat-startup:content-ready').length >
            0
        );
        await favoriteGate;
        favoriteCreated = true;
        return route.fulfill({ json: { topicId: fixture.topics[0].id } });
      }
      if (url.pathname === '/api/topics') {
        topicsRequests++;
        const topics = empty ? [] : fixture.topics.slice(1);
        const data = favoriteCreated ? [fixture.topics[0], ...topics] : topics;
        return route.fulfill({
          json: { data, total: data.length, page: 1, limit: 999 }
        });
      }
      return route.continue();
    });
    await page.addInitScript(
      ({ origin, config, user }) => {
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
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
        );
      },
      { origin: fixture.origin, config: fixture.config, user: fixture.user }
    );
    try {
      await page.goto('/');
      await expect.poll(() => creations, { timeout: 30_000 }).toBe(1);
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 2000
      });
      expect(contentReadyAtCreation).toBe(true);
      expect(topicsRequests).toBe(1);
      await expect(page.locator('.contact-list__skeleton-row')).toHaveCount(0);
      if (isMobile)
        await page.getByRole('button', { name: 'Остаться в браузере' }).click();
      if (!empty) {
        const row = page
          .locator('[data-testid*="-ContactList-Item"]:visible')
          .filter({ hasText: fixture.topics[1].user.initials })
          .first();
        await expect(row).toBeVisible();
        await row.click();
        await expect(page.locator('[data-message-id]').first()).toBeVisible();
      }
      releaseFavorite();
      await expect.poll(() => topicsRequests).toBe(2);
      if (isMobile && !empty) {
        await page.locator('[data-testid$="-Header-BackButton"]').click();
      }
      await expect(
        page
          .locator('[data-testid*="-ContactList-Item"]:visible')
          .filter({ hasText: 'Избранное' })
          .first()
      ).toBeVisible();
      expect(creations).toBe(1);
      releaseUsers();
      expect(errors).toEqual([]);
    } finally {
      releaseFavorite();
      releaseUsers();
    }
  });
}
