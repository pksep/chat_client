import { expect, test, type Page } from '@playwright/test';

async function refreshAccess(page: Page): Promise<void> {
  await page.evaluate(async (): Promise<void> => {
    const moduleUrl = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(
        url => new URL(url).pathname === '/src/composables/useChatAccess.ts'
      );

    if (!moduleUrl) throw new Error('Модуль проверки прав ещё не загружен');

    const { refreshChatAccess } = await import(moduleUrl);
    await refreshChatAccess();
  });
}

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
  await expect(nav).toBeVisible({ timeout: 30000 });
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

for (const failure of ['server', 'network'] as const) {
  test(`сбой ${failure} не скрывает меню и не сбрасывает выбранных клиентов`, async ({
    page
  }): Promise<void> => {
    let mode: 'allowed' | 'failure' | 'denied' = 'allowed';
    await page.route('**/users/me/access', async route => {
      if (mode === 'failure') {
        if (failure === 'network') return route.abort('failed');

        return route.fulfill({ status: 503, json: {} });
      }

      return route.fulfill({
        json: {
          userId: 'local-ui-test-user',
          effective: { client: mode === 'allowed', ai: mode === 'allowed' }
        }
      });
    });
    await page.goto('/');
    const nav = page.locator('.menu-bottom-nav:visible');
    const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
    const ai = nav.locator('[data-testid$="MenuBottomNav-AI"]');
    await expect(clients).toBeVisible();
    await expect(ai).toBeVisible();
    await clients.click();
    await expect(clients).toHaveClass(/menu-bottom-nav__button--active/);

    mode = 'failure';
    await refreshAccess(page);
    await expect(clients).toBeVisible();
    await expect(ai).toBeVisible();
    await expect(clients).toHaveClass(/menu-bottom-nav__button--active/);
    await expect(nav).toHaveAttribute('aria-busy', 'false');

    mode = 'allowed';
    await refreshAccess(page);
    await expect(clients).toHaveClass(/menu-bottom-nav__button--active/);

    mode = 'denied';
    await refreshAccess(page);
    await expect(clients).toHaveCount(0);
    await expect(ai).toHaveCount(0);
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Chats"]')
    ).toHaveClass(/menu-bottom-nav__button--active/);
  });
}

test('обновление роли того же профиля при сбое проверки не скрывает разделы', async ({
  page
}): Promise<void> => {
  let unavailable = false;
  await page.route('**/users/me/access', route =>
    route.fulfill(
      unavailable
        ? { status: 503, json: {} }
        : {
            json: {
              userId: 'local-ui-test-user',
              effective: { client: true, ai: true }
            }
          }
    )
  );
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
  const ai = nav.locator('[data-testid$="MenuBottomNav-AI"]');
  await expect(clients).toBeVisible();
  await expect(ai).toBeVisible();
  unavailable = true;
  await page.evaluate(async (): Promise<void> => {
    const moduleUrl = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(url => new URL(url).pathname === '/src/composables/useAuth.ts');

    if (!moduleUrl) throw new Error('Модуль профиля ещё не загружен');

    const { getAuthUser, setAuthUser } = await import(moduleUrl);
    setAuthUser({
      ...getAuthUser(),
      ex: { erpRoleId: 7, erpRole: 'Менеджер' }
    });
  });
  await refreshAccess(page);

  await expect(clients).toBeVisible();
  await expect(ai).toBeVisible();
  await expect(nav).toHaveAttribute('aria-busy', 'false');
});

test('уведомление открывает клиентский чат, отказ отдельного запроса не выбрасывает из раздела', async ({
  page,
  isMobile
}): Promise<void> => {
  const inquiry = {
    id: 'synthetic-inquiry',
    topic_id: 'synthetic-client-topic',
    name: 'Тестовый клиент',
    contacts: {},
    source: { channel: 'widget' },
    manager_ids: [],
    metadata_version: 1
  };
  let unavailable = false;
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        effective: { client: true, ai: true }
      }
    })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill(unavailable ? { status: 403, json: {} } : { json: [inquiry] })
  );
  await page.goto('/');
  const nav = page
    .locator(isMobile ? '.mobile-list-container' : '.menu')
    .locator('.menu-bottom-nav');
  const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
  await expect(clients).toBeVisible();
  await page.evaluate(async (): Promise<void> => {
    const moduleUrl = (path: string): string => {
      const url = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === path);

      if (!url) throw new Error(`Модуль ${path} ещё не загружен`);

      return url;
    };
    const { refreshManagerInquiries } = await import(
      moduleUrl('/src/composables/useManagerInquiries.ts')
    );
    await refreshManagerInquiries();
    const { setTopics } = await import(
      moduleUrl('/src/composables/useTopics.ts')
    );
    setTopics([
      {
        id: 'synthetic-client-topic',
        type: 'GROUP',
        name: 'Тестовый клиент',
        group: {
          id: 'synthetic-client-group',
          name: 'Тестовый клиент',
          description: 'sep-chat:external-inquiry:v1'
        },
        info: {},
        unreadMessageCount: 1
      }
    ]);
    const { navigateToNotificationTarget } = await import(
      moduleUrl('/src/services/useNotificationNavigation.ts')
    );
    navigateToNotificationTarget({
      topicId: 'synthetic-client-topic',
      topicType: 'GROUP'
    });
  });
  await expect(page).toHaveURL(/\/group\/synthetic-client-topic$/);
  await expect(clients).toHaveClass(/menu-bottom-nav__button--active/);

  unavailable = true;
  await page.evaluate(async (): Promise<void> => {
    const url = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(
        url =>
          new URL(url).pathname === '/src/composables/useManagerInquiries.ts'
      );

    if (!url) throw new Error('Модуль обращений ещё не загружен');

    const { refreshManagerInquiries } = await import(url);
    await refreshManagerInquiries();
  });
  await expect(page).toHaveURL(/\/group\/synthetic-client-topic$/);
  await expect(clients).toHaveClass(/menu-bottom-nav__button--active/);
});

test('ожидание первой проверки прав не сбрасывает клиентский чат из уведомления', async ({
  page
}): Promise<void> => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/users/me/access', async route => {
    await gate;
    await route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        effective: { client: true, ai: true }
      }
    });
  });

  try {
    await page.goto('/');
    await expect(page.locator('.menu-bottom-nav:visible')).toBeVisible({
      timeout: 30000
    });
    await page.evaluate(async (): Promise<void> => {
      const moduleUrl = (path: string): string => {
        const url = performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .find(url => new URL(url).pathname === path);

        if (!url) throw new Error(`Модуль ${path} ещё не загружен`);

        return url;
      };
      const { setTopics } = await import(
        moduleUrl('/src/composables/useTopics.ts')
      );
      setTopics([
        {
          id: 'synthetic-client-topic',
          type: 'GROUP',
          name: 'Тестовый клиент',
          group: {
            id: 'synthetic-client-group',
            name: 'Тестовый клиент',
            description: 'sep-chat:external-inquiry:v1'
          },
          info: {},
          unreadMessageCount: 1
        }
      ]);
      const { navigateToNotificationTarget } = await import(
        moduleUrl('/src/services/useNotificationNavigation.ts')
      );
      navigateToNotificationTarget({
        topicId: 'synthetic-client-topic',
        topicType: 'GROUP'
      });
    });
    await expect(page).toHaveURL(/\/group\/synthetic-client-topic$/);
    release();
    await refreshAccess(page);
    await expect(page).toHaveURL(/\/group\/synthetic-client-topic$/);
  } finally {
    release();
  }
});
