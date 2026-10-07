import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const apiBase = 'http://127.0.0.1:65530';
const userId = 'menu-layout-test-user';
const startupHtml = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
).replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '');

async function seedSession(page: Page, layout: string | null) {
  await page.addInitScript(
    ({ apiBase, userId, layout }) => {
      if (
        localStorage.getItem('chat_auth_session') ||
        sessionStorage.getItem('chat_auth_session')
      )
        return;
      Object.defineProperty(navigator, 'standalone', { value: true });
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'local-ui-test', user: { id: userId } })
      );
      localStorage.setItem('chat_runtime_last_organization', apiBase);
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([
          {
            url: apiBase,
            config: {
              CHAT_AUTH_API: apiBase,
              CHAT_API_DOMAIN: `${apiBase}/`,
              CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
              CHAT_MASTRA_URL: 'http://127.0.0.1:4111'
            }
          }
        ])
      );
      sessionStorage.setItem('menu-collapse', 'false');
      if (layout) localStorage.setItem('chat_menu_layout', layout);
    },
    { apiBase, userId, layout }
  );
}

function response(effective: { client: boolean; ai: boolean }) {
  return { userId, erpRoleId: 7, access: effective, effective };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/menu-startup-check', route =>
    route.fulfill({ contentType: 'text/html', body: startupHtml })
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

for (const flags of [
  { client: false, ai: false },
  { client: true, ai: false },
  { client: false, ai: true },
  { client: true, ai: true }
]) {
  const count = 3 + Number(flags.client) + Number(flags.ai);
  test(`скелетон и меню сохраняют ${count} пунктов: ${JSON.stringify(flags)}`, async ({
    page,
    isMobile
  }) => {
    await seedSession(page, JSON.stringify({ userId, apiBase, count }));
    await page.goto('/menu-startup-check');
    const startupNav = page.locator('.startup-shell__navigation');
    await expect(
      startupNav.locator('.startup-shell__nav-item:visible')
    ).toHaveCount(count);
    const startupBox = await startupNav.boundingBox();

    let releaseAccess!: () => void;
    let releaseManager!: () => void;
    const accessGate = new Promise<void>(resolve => {
      releaseAccess = resolve;
    });
    const managerGate = new Promise<void>(resolve => {
      releaseManager = resolve;
    });
    await page.route('**/users/me/access', async route => {
      await accessGate;
      await route.fulfill({ json: response(flags) });
    });
    await page.route('**/manager/access', async route => {
      await managerGate;
      await route.fulfill({ json: { allowed: true } });
    });
    try {
      await page.goto('/');
      const nav = page.locator('.menu-bottom-nav:visible');
      await expect(nav).toHaveAttribute('aria-busy', 'true');
      await expect(nav.locator('.menu-bottom-nav__skeleton')).toHaveCount(
        count
      );
      await expect(nav.locator('button')).toHaveCount(0);
      const skeletonBox = await nav.boundingBox();
      if (isMobile) expect(skeletonBox).toEqual(startupBox);

      releaseAccess();
      await expect(nav).toHaveAttribute('aria-busy', 'false');
      await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(count);
      expect(await nav.boundingBox()).toEqual(skeletonBox);
      releaseManager();
      await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(count);
      await expect(
        page.locator('[data-testid$="MenuBottomNav-Clients"]')
      ).toHaveCount(Number(flags.client));
      await expect(
        page.locator('[data-testid$="MenuBottomNav-AI"]')
      ).toHaveCount(Number(flags.ai));
    } finally {
      releaseAccess();
      releaseManager();
    }
  });
}

for (const [label, layout] of [
  ['первый вход', null],
  [
    'другой пользователь',
    JSON.stringify({ userId: 'other-user', apiBase, count: 5 })
  ],
  [
    'другая организация',
    JSON.stringify({ userId, apiBase: 'http://other-server/api', count: 5 })
  ],
  ['повреждённый кеш', '{'],
  ['неверное количество', JSON.stringify({ userId, apiBase, count: 99 })]
] as const) {
  test(`нейтральный скелетон: ${label}`, async ({ page }) => {
    await seedSession(page, layout);
    await page.goto('/menu-startup-check');
    await expect(page.locator('.startup-shell__nav-item:visible')).toHaveCount(
      0
    );
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-startup-menu-count'
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/users/me/access', async route => {
      await gate;
      await route.fulfill({ json: response({ client: true, ai: true }) });
    });
    try {
      await page.goto('/');
      const nav = page.locator('.menu-bottom-nav:visible');
      await expect(nav).toHaveAttribute('aria-busy', 'true');
      await expect(
        nav.locator('.menu-bottom-nav__skeleton--neutral')
      ).toHaveCount(1);
      await expect(nav.locator('button')).toHaveCount(0);
      release();
      await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(5);
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem('chat_menu_layout')!)
        )
      ).toEqual({ userId, apiBase, count: 5 });
      await page.goto('/menu-startup-check');
      await expect(
        page.locator('.startup-shell__nav-item:visible')
      ).toHaveCount(5);
    } finally {
      release();
    }
  });
}

test('старый кеш не выдаёт доступ; отказ сервера обновляет раскладку', async ({
  page
}) => {
  await seedSession(page, JSON.stringify({ userId, apiBase, count: 5 }));
  let restrictedRequests = 0;
  await page.route('**/manager/**', route => {
    restrictedRequests++;
    return route.abort();
  });
  await page.route('**/conversations/**', route => {
    restrictedRequests++;
    return route.abort();
  });
  await page.route('**/users/me/access', route =>
    route.fulfill({ json: response({ client: false, ai: false }) })
  );
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toHaveAttribute('aria-busy', 'false');
  await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(3);
  expect(restrictedRequests).toBe(0);
  await page.goto('/menu-startup-check');
  await expect(page.locator('.startup-shell__nav-item:visible')).toHaveCount(3);
});

test('ошибка проверки не оставляет меню в загрузке и не затирает кеш', async ({
  page
}) => {
  const layout = JSON.stringify({ userId, apiBase, count: 5 });
  await seedSession(page, layout);
  await page.route('**/users/me/access', route =>
    route.fulfill({ status: 503, json: {} })
  );
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toHaveAttribute('aria-busy', 'false');
  await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(3);
  expect(
    await page.evaluate(() => localStorage.getItem('chat_menu_layout'))
  ).toBe(layout);
});

test('недоступное хранилище раскладки не мешает проверке прав', async ({
  page
}) => {
  await seedSession(page, null);
  await page.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'chat_menu_layout') throw new Error('Хранилище недоступно');
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'chat_menu_layout') throw new Error('Хранилище недоступно');
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/menu-startup-check');
  await expect(page.locator('.startup-shell__nav-item:visible')).toHaveCount(0);
  await page.route('**/users/me/access', route =>
    route.fulfill({ json: response({ client: true, ai: true }) })
  );
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toHaveAttribute('aria-busy', 'false');
  await expect(nav.locator('.menu-bottom-nav__button')).toHaveCount(5);
});

test('временная сессия восстанавливает скелетон; новый ERP-вход не берёт старую раскладку', async ({
  page
}) => {
  await seedSession(page, JSON.stringify({ userId, apiBase, count: 5 }));
  await page.goto('/menu-startup-check');
  await page.evaluate(() => {
    sessionStorage.setItem(
      'chat_auth_session',
      localStorage.getItem('chat_auth_session')!
    );
    localStorage.removeItem('chat_auth_session');
  });
  await page.goto('/menu-startup-check');
  await expect(page.locator('.startup-shell__nav-item:visible')).toHaveCount(5);
  await page.route('**/menu-startup-check?*', route =>
    route.fulfill({ contentType: 'text/html', body: startupHtml })
  );
  await page.goto('/menu-startup-check?token=new-erp-login');
  await expect(page.locator('.startup-shell__nav-item:visible')).toHaveCount(0);
});
