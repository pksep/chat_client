import { expect, test, type Page } from './fixtures/ai-history';

async function openMenu(
  page: Page,
  seenVersion: number,
  availableVersion: number | string = 2
) {
  await page.addInitScript(
    ({ seenVersion }) => {
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
    { seenVersion }
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
    timeout: 30_000
  });
}

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
