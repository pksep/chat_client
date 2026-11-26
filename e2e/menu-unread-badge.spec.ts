import { expect, test, type Page } from '@playwright/test';

async function setUnreadCount(
  page: Page,
  count: number,
  muted = false
): Promise<void> {
  await page.evaluate(
    async ({ count, muted }): Promise<void> => {
      const url = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/composables/useTopics.ts');

      if (!url) throw new Error('Модуль списка чатов ещё не загружен');

      const { setTopics } = await import(url);
      setTopics([
        {
          id: 'badge-client-topic',
          type: 'GROUP',
          name: 'Тестовая поддержка',
          group: {
            id: 'badge-client-group',
            name: 'Тестовая поддержка',
            description: 'sep-chat:external-inquiry:v1'
          },
          unreadMessageCount: count,
          info: { isMute: muted },
          lastMessage: {
            id: 'synthetic-guest-message',
            senderUserId: 'synthetic-guest',
            text: 'Тест',
            isSystem: false
          }
        }
      ]);
    },
    { count, muted }
  );
}

test.beforeEach(async ({ page }): Promise<void> => {
  await page.addInitScript((): void => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', { value: true });
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: url
          }
        }
      ])
    );
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'synthetic-badge-token',
        user: { id: 'badge-test-user', initials: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');
  });
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'badge-test-user',
        effective: { client: true, ai: true }
      }
    })
  );
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

for (const theme of ['light', 'dark'] as const) {
  test(`круглый счётчик поддержки сохраняет число и размер меню: ${theme}`, async ({
    page
  }, testInfo): Promise<void> => {
    await page.goto('/');
    const nav = page.locator('.menu-bottom-nav:visible');
    const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
    await expect(clients).toBeVisible({ timeout: 30000 });
    await page.evaluate((theme: string): void => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle('theme-dark', theme === 'dark');
      document.documentElement.classList.toggle(
        'theme-light',
        theme === 'light'
      );
    }, theme);
    const navBox = await nav.boundingBox();
    const badge = clients.locator('.menu-bottom-nav__unread-count');

    for (const count of [1, 9, 10, 99, 100, 999, 1000]) {
      await setUnreadCount(page, count);
      await expect(badge).toHaveText(count > 9 ? '9+' : String(count));
      await expect(clients).toHaveAttribute(
        'aria-label',
        `Клиенты. Непрочитанных: ${count}`
      );
      const box = await badge.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(18);
      expect(box!.height).toBeCloseTo(box!.width, 1);
      const fits = await badge.evaluate(
        (element: HTMLElement): boolean =>
          element.scrollWidth <= element.clientWidth &&
          element.scrollHeight <= element.clientHeight
      );
      expect(fits).toBe(true);
      const updatedNavBox = await nav.boundingBox();
      expect(updatedNavBox!.width).toBe(navBox!.width);
      expect(updatedNavBox!.height).toBe(navBox!.height);
    }

    await setUnreadCount(page, 2, true);
    await expect(badge).toHaveClass(/menu-bottom-nav__unread-count--muted/);
    const mutedBox = await badge.boundingBox();
    expect(mutedBox!.height).toBeCloseTo(mutedBox!.width, 1);
    await setUnreadCount(page, 2);
    await nav.screenshot({
      path: testInfo.outputPath('support-unread-circle.png')
    });
    await setUnreadCount(page, 0);
    await expect(badge).toHaveCount(0);
  });
}
