import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);

test('кнопка открывает Tauri и при неудаче страницу загрузки вместо установки PWA', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'В мобильном браузере desktop-кнопка скрыта');
  await openMenu(page, 2);
  const open = page.getByRole('button', { name: 'Открыть приложение' });
  await expect(open).toHaveAttribute('href', 'sepchat://open');
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      event => {
        const link = (event.target as Element).closest('a');
        if (!link) return;
        if (link.href === 'https://pksep.ru/chat/#contacts') {
          (window as any).menuWebsiteLink = {
            href: link.href,
            target: link.target
          };
          event.preventDefault();
        } else if (link.protocol === 'sepchat:') event.preventDefault();
      },
      true
    )
  );
  await open.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).menuWebsiteLink))
    .toEqual({
      href: 'https://pksep.ru/chat/#contacts',
      target: '_blank'
    });
  await expect(page.locator('.desktop-app-downloads')).toHaveCount(0);
  const box = (await open.boundingBox())!;
  const nav = (await page.locator('.menu-bottom-nav:visible').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
});

async function openMenu(
  page: Page,
  seenVersion: number,
  availableVersion: number | string = 2,
  standalone = true
) {
  await page.addInitScript(
    ({ seenVersion, standalone }) => {
      const url = 'http://127.0.0.1:65530';
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: standalone
      });
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([
          {
            url,
            config: {
              CHAT_API_DOMAIN: url,
              CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
              CHAT_MASTRA_URL: 'http://127.0.0.1:4111'
            }
          }
        ])
      );
      localStorage.setItem('chat_runtime_last_organization', url);
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({
          token: 'local-ui-test',
          user: { id: 'menu-update-test-user' }
        })
      );
      sessionStorage.setItem('menu-collapse', 'false');
      if (!localStorage.getItem('chat_web_seen_update_version')) {
        localStorage.setItem(
          'chat_web_seen_update_version',
          String(seenVersion)
        );
      }
    },
    { seenVersion, standalone }
  );
  await page.route('**/web-update.json', route =>
    route.fulfill({ json: { version: availableVersion } })
  );
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.locator('.menu-bottom-nav:visible')).toBeVisible({
    timeout: 60_000
  });
}

test('Android открывает установленный чат, а при отсутствии пакета направляет в RuStore', async ({
  page
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36'
    });
  });
  await page.setViewportSize({ width: 393, height: 851 });
  await openMenu(page, 2, 2, false);
  await page.evaluate(() =>
    document.addEventListener(
      'click',
      event => {
        const link = (event.target as Element).closest('a[href^="intent:"]');
        if (!link) return;
        event.preventDefault();
        (window as any).androidAppIntent = (link as HTMLAnchorElement).href;
      },
      true
    )
  );
  await expect(
    page.getByRole('button', { name: 'Загрузить на Android' })
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Открыть приложение', exact: true })
    .click();
  const intent = await page.evaluate(
    () => (window as any).androidAppIntent as string
  );
  expect(intent).toContain(
    'intent://chat.pksep.ru/#Intent;scheme=https;package=sep.pksep.app;'
  );
  expect(
    decodeURIComponent(
      intent.split('S.browser_fallback_url=')[1].split(';end')[0]
    )
  ).toBe('https://www.rustore.ru/catalog/app/sep.pksep.app');
});

test('Новая веб-версия не показывает кнопку ручного обновления', async ({
  page
}) => {
  await openMenu(page, 1);
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
  const navigation = page.locator('.menu-bottom-nav:visible');
  const navBefore = (await navigation.boundingBox())!;
  expect(navBefore.y + navBefore.height).toBeGreaterThan(
    page.viewportSize()!.height - 30
  );
});

test('При актуальной версии кнопка обновления не занимает место в меню', async ({
  page
}) => {
  const checked = page.waitForResponse('**/web-update.json');
  await openMenu(page, 2);
  await checked;
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
  await expect(page.locator('.menu-bottom-nav:visible')).toBeVisible();
});

for (const seenVersion of [79, 79.4]) {
  test(`Дробное обновление ${seenVersion} → 79.5 не показывает веб-кнопку`, async ({
    page
  }) => {
    await openMenu(page, seenVersion, '79.5');
    await expect(page.locator('.menu-bottom-nav:visible')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('.menu-update-button')).toHaveCount(0);
  });
}

test('Актуальная дробная версия не предлагает повторное обновление', async ({
  page
}) => {
  const checked = page.waitForResponse('**/web-update.json');
  await openMenu(page, 79.5, 79.5);
  await checked;
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
});

test('В свернутом веб-меню нет кнопки ручного обновления', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Сворачивание меню доступно на desktop');
  await openMenu(page, 1);
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
  await page.locator('[data-testid$="Menu-ChatsToolbar-CollapseIcon"]').click();
  await expect(page.locator('.menu--collapse')).toBeVisible();
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
});
