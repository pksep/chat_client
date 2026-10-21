import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;

test.beforeAll(async ({}, workerInfo) => {
  fixture = await createAndroidPerformanceServer({
    port: 5290 + workerInfo.workerIndex,
    topicCount: 3,
    userCount: 5,
    messagesPerTopic: 20
  });
  Object.assign(fixture.topics[0], {
    type: 'GROUP',
    members: [fixture.user],
    group: { title: 'Избранное', description: 'sep-chat:favorite-messages:v1' }
  });
});

test.afterAll(async () => {
  await fixture.close();
});

for (const cached of [true, false]) {
  test(`обновление Избранного снимает стартовый скелетон ${cached ? 'с кешем' : 'без кеша'}`, async ({
    page
  }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/api/users/*/access', route =>
      route.fulfill({ json: { client: false, ai: false } })
    );
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    );
    await page.addInitScript(
      ({ origin, config, user, topics, cached }) => {
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'favorite-refresh-fixture', user })
        );
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        if (cached)
          localStorage.setItem(
            `chat-offline-fast-topics-v1:${user.id}`,
            JSON.stringify(topics)
          );
        localStorage.setItem(
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
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
    await page.goto(`/favorites/${fixture.topics[0].id}`);
    for (let refresh = 0; refresh < 2; refresh++) {
      if (refresh) await page.reload();
      await expect(page.locator('#startup-shell')).toHaveCount(0, {
        timeout: 15_000
      });
      await expect(
        page.locator(`[data-message-id="${fixture.topics[0].lastMessage.id}"]`)
      ).toBeVisible();
      await expect(
        page.locator('[data-testid$="-MessageList-Skeleton"]')
      ).toHaveCount(0);
      await expect(page.locator('[contenteditable="true"]')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
