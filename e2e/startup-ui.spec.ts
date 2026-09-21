import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
test.beforeAll(async () => {
  fixture = await createAndroidPerformanceServer({
    port: 5191,
    topicCount: 36,
    userCount: 80,
    messagesPerTopic: 20
  });
});
test.afterAll(async () => {
  await fixture.close();
});

test('запуск не монтирует скрытое меню и окна создания; окна открываются по запросу', async ({
  page,
  isMobile
}) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  const errors: string[] = [];
  const automationRequests: boolean[] = [];
  const updateRequests: boolean[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.route('**/ai/automations', async route => {
    automationRequests.push(
      await page.evaluate(
        () =>
          !document.getElementById('startup-shell') &&
          performance.getEntriesByName('chat-startup:content-painted').length >
            0
      )
    );
    await route.fulfill({ json: { automations: [] } });
  });
  await page.route('**/web-update.json', async route => {
    updateRequests.push(
      await page.evaluate(
        () =>
          !document.getElementById('startup-shell') &&
          performance.getEntriesByName('chat-startup:content-painted').length >
            0
      )
    );
    await route.fulfill({ json: { version: 1 } });
  });
  await page.addInitScript(
    ({ origin, config, user, topics }) => {
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
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      topics: fixture.topics
    }
  );
  await page.goto('/');
  await expect(
    page.locator('[data-testid*="-ContactList-Item"]:visible').first()
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0);
  await expect.poll(() => automationRequests).toEqual([true]);
  await expect.poll(() => updateRequests).toEqual([true]);
  await expect(page.locator('[data-topic-id]')).toHaveCount(
    fixture.topics.length
  );
  await expect(page.locator('.chat__menu')).toHaveCount(isMobile ? 0 : 1);
  expect(
    requests.filter(url =>
      /\/NewChat\/(NewContactModal|NewBotModal|NewGroupModal)\.vue/.test(url)
    )
  ).toEqual([]);
  expect(
    requests.filter(url =>
      /\/(MenuInfo|UserInfoPanel|BotInfoPanel|MobileChatInfo|ProfileAttachmentsPanel)\.vue/.test(
        url
      )
    )
  ).toEqual([]);
  if (isMobile) {
    await page.getByRole('button', { name: 'Остаться в браузере' }).click();
  }
  await page
    .locator(`[data-topic-id="${fixture.topics[1].id}"]:visible`)
    .click();
  for (let open = 0; open < 2; open++) {
    await page.locator('.chat__header-main:visible').click();
    const profile = page.locator('.user-info-panel:visible');
    await expect(profile).toBeVisible();
    await expect(profile.locator('.user-info-panel__name')).toHaveText(
      fixture.topics[1].user.initials
    );
    if (isMobile) {
      await page
        .locator('[data-testid$="-MobileModal-CloseButton"]:visible')
        .click();
    } else {
      await profile.locator('[data-testid$="-CloseButton"]').click();
    }
    await expect(profile).toHaveCount(0);
  }
  expect(
    requests.filter(url => {
      const request = new URL(url);
      return (
        request.pathname.endsWith('/UserInfoPanel.vue') &&
        !request.searchParams.has('type')
      );
    })
  ).toHaveLength(1);
  if (isMobile) {
    await page.locator('[data-testid$="-Header-BackButton"]:visible').click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.chat__menu')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.chat__menu')).toHaveCount(0);
    await expect(
      page.locator('[data-testid*="-ContactList-Item"]:visible').first()
    ).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }
  for (const [action, modal, close] of [
    ['Chat', 'NewContactModal', '.new-contact__button-close'],
    ['Bot', 'NewBotModal', '.new-contact__button-close'],
    ['Group', 'NewGroupModal', '.new-group__button-close']
  ]) {
    for (let open = 0; open < 2; open++) {
      await page
        .locator('.chat__menu [data-testid$="-ChatsToolbar-CreateButton"]')
        .click();
      await page
        .locator(`[data-testid$="-ChatsToolbar-Create${action}Button"]:visible`)
        .click();
      const dialog = page.locator(
        `[data-testid$="-${modal}-Container"]:visible`
      );
      await expect(dialog).toBeVisible();
      await dialog.locator(close).click();
      await expect(dialog).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});
