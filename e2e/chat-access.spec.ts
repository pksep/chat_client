import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_AUTH_API: url,
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
            CHAT_ERP_URL: 'http://127.0.0.1:5000'
          }
        }
      ])
    );
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-ui-test',
        user: { id: 'local-ui-test-user', initials: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');
  });
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
  await page.route('**/automations', route =>
    route.fulfill({ json: { automations: [] } })
  );
});

test('до проверки прав меню показывает скелетон, после отказа — три пункта', async ({
  page
}, testInfo) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/users/me/access', async route => {
    await gate;
    await route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        erpRoleId: 7,
        access: { client: false, ai: false },
        effective: { client: false, ai: false }
      }
    });
  });
  let aiRequests = 0;
  await page.route('**/conversations/**', route => {
    aiRequests++;
    return route.abort();
  });
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute('aria-busy', 'true');
  await expect(nav.locator('button')).toHaveCount(0);
  await expect(nav.locator('.menu-bottom-nav__skeleton--neutral')).toHaveCount(
    1
  );
  await expect(page.locator('[data-testid$="MenuBottomNav-AI"]')).toHaveCount(
    0
  );
  await expect(
    page.locator('[data-testid$="MenuBottomNav-Clients"]')
  ).toHaveCount(0);
  release();
  await expect(nav).toHaveAttribute('aria-busy', 'false');
  await expect(nav.locator('button')).toHaveCount(3);
  if (testInfo.project.name === 'chromium-desktop') {
    const columns = await nav.evaluate(
      el => getComputedStyle(el).gridTemplateColumns.split(' ').length
    );
    expect(columns).toBe(3);
  }
  await page.goto('/ai');
  await expect(page).toHaveURL(/\/$/);
  expect(aiRequests).toBe(0);
});

test('выдача и отзыв доступа обновляют разделы и закрывают экран ИИ', async ({
  page
}) => {
  let flags = { client: false, ai: false };
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        erpRoleId: 7,
        access: flags,
        effective: flags
      }
    })
  );
  await page.goto('/');
  const ai = page.locator('[data-testid$="MenuBottomNav-AI"]');
  const clients = page.locator('[data-testid$="MenuBottomNav-Clients"]');
  await expect(ai).toHaveCount(0);
  flags = { client: true, ai: true };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(ai).toBeVisible();
  await expect(clients).toBeVisible();
  await ai.click();
  await expect(page).toHaveURL(/\/(ai|assistant)$/);
  flags = { client: false, ai: false };
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(ai).toHaveCount(0);
  await expect(clients).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});
