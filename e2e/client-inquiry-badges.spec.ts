import { expect, test, type Page } from './fixtures/ai-history';

async function setCount(
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
      if (!url) throw new Error('Список чатов ещё не загружен');

      const { setTopics } = await import(url);
      setTopics([
        {
          id: 'inquiry-badge',
          type: 'GROUP',
          name: 'Клиент сайта',
          group: {
            id: 'inquiry-group',
            name: 'Клиент сайта',
            description: 'sep-chat:external-inquiry:v1'
          },
          unreadMessageCount: count,
          info: { isMute: muted },
          lastMessage: {
            id: 'guest-message',
            senderUserId: 'guest',
            text: 'Здравствуйте!',
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
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_AUTH_API: url,
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
        token: 'synthetic-inquiry-test',
        user: { id: 'inquiry-test-user', initials: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');
  });
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({
      json: [
        {
          id: 'synthetic-inquiry',
          topic_id: 'inquiry-badge',
          guest_user_id: 'guest',
          name: 'Клиент сайта',
          contacts: {},
          source: { channel: 'widget' },
          manager_ids: [],
          assignee_id: null,
          note: '',
          metadata_version: 0,
          erp_contact_id: null,
          created_at: '2026-10-14T05:30:00.000Z'
        }
      ]
    })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
});

for (const theme of ['light', 'dark']) {
  test(`плашки клиентов ограничены 9+ и остаются круглыми: ${theme}`, async ({
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
    const badge = clients.locator('.menu-bottom-nav__unread-count');

    for (const count of [1, 9, 10, 11242]) {
      await setCount(page, count);
      await expect(badge).toHaveText(count > 9 ? '9+' : String(count));
      await expect(clients).toHaveAttribute(
        'aria-label',
        `Клиенты. Непрочитанных: ${count}`
      );
      const box = await badge.boundingBox();
      expect(box!.height).toBeCloseTo(box!.width, 1);
      expect(box!.width).toBeLessThan(25);
    }

    await clients.click();
    const listBadge = page.locator(
      '[data-testid$="ContactList-Notification1"]:visible'
    );
    await expect(listBadge).toHaveText('9+');
    await nav.screenshot({
      path: testInfo.outputPath(`inquiry-badge-${theme}.png`)
    });
    await setCount(page, 2, true);
    await expect(badge).toHaveClass(/--muted/);
    await setCount(page, 0);
    await expect(badge).toHaveCount(0);
  });
}
