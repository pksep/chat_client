import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);
const fixture = '/e2e/fixtures/desktop-app-download.html';
const website = 'https://pksep.ru/chat/#contacts';
const device = async (
  page: Page,
  platform: string,
  userAgent = platform,
  maxTouchPoints = 0
) => {
  await page.addInitScript(
    ({ platform, userAgent, maxTouchPoints }) => {
      for (const [name, value] of Object.entries({
        platform,
        userAgent,
        maxTouchPoints
      }))
        Object.defineProperty(navigator, name, { configurable: true, value });
    },
    { platform, userAgent, maxTouchPoints }
  );
};

test('desktop удаляет старую PWA-оболочку, сохраняя уведомления и кеш файлов', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.addInitScript(() => {
    const win = window as any;
    win.retiredWorkers = [];
    win.retiredCaches = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: async () =>
          [
            'sw.js',
            'service-worker.js',
            'pending-upload-service-worker.js'
          ].map(script => ({
            scope: location.origin + '/',
            active: { scriptURL: location.origin + '/' + script },
            unregister: async () => {
              win.retiredWorkers.push(script);
              return true;
            }
          }))
      }
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['workbox-precache-v2-test', 'chat-media-cache'],
        delete: async (name: string) => {
          win.retiredCaches.push(name);
          return true;
        }
      }
    });
  });
  await page.goto(fixture);
  await expect
    .poll(() => page.evaluate(() => (window as any).retiredWorkers))
    .toEqual(['sw.js']);
  expect(await page.evaluate(() => (window as any).retiredCaches)).toEqual([
    'workbox-precache-v2-test'
  ]);
});

test('одна кнопка сразу запускает чат; уход со страницы отменяет открытие сайта', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.clock.install();
  await page.goto(fixture);
  const action = page.getByRole('button', { name: 'Открыть приложение' });
  await expect(
    page.getByTestId('Fixture-DesktopApp').getByRole('button')
  ).toHaveCount(1);
  await expect(action).toHaveAttribute('href', 'sepchat://open');
  await action.click();
  await expect(action).toHaveAttribute('aria-busy', 'true');
  await expect(action).toContainText('Открываем приложение…');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(10_000);
  expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
    'sepchat://open'
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.clock.fastForward(3000);
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('ожидание видно сразу, повторные клики не запускают протокол и Escape отменяет ожидание', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.clock.install();
  await page.goto(fixture);
  const action = page.getByRole('button', { name: 'Открыть приложение' });
  const before = await action.boundingBox();
  await action.click();
  await expect(action).toHaveAttribute('aria-busy', 'true');
  await expect(action).toHaveAttribute('aria-disabled', 'true');
  await expect(action.getByRole('status')).toHaveText('Открываем приложение…');
  await expect(action.locator('.menu-native-app__spinner')).toBeVisible();
  expect(await action.boundingBox()).toEqual(before);
  await action.dispatchEvent('click');
  expect(await page.evaluate(() => (window as any).selectedAppLinks)).toEqual([
    'sepchat://open'
  ]);
  await page.keyboard.press('Escape');
  await expect(action).toHaveAttribute('aria-busy', 'false');
  await expect(action).toHaveAttribute('aria-disabled', 'false');
  await page.clock.fastForward(3000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await action.click();
  await page.clock.fastForward(2000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
    website
  );
  await expect(action).toHaveAttribute('aria-busy', 'false');
  await expect(action.locator('.menu-native-app__spinner')).toHaveCount(0);
});

for (const promptDuration of [500, 10_000])
  test(`после окна Windows без обработчика (${promptDuration} мс) открывается сайт в новой вкладке`, async ({
    page
  }) => {
    await device(page, 'Win32');
    await page.clock.install();
    await page.goto(fixture);
    const action = page.getByRole('button', { name: 'Открыть приложение' });
    await action.focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
      'sepchat://open'
    );
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', {
        configurable: true,
        value: () => false
      });
      window.dispatchEvent(new Event('blur'));
    });
    await page.clock.fastForward(promptDuration);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', {
        configurable: true,
        value: () => true
      });
      window.dispatchEvent(new Event('focus'));
    });
    await page.clock.fastForward(2000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
      website
    );
    expect(
      await page.evaluate(() => (window as any).selectedAppTargets)
    ).toEqual(['', '_blank']);
    await expect(action).toHaveAttribute('aria-busy', 'false');
    await expect(
      page.getByTestId('Fixture-DesktopApp').getByRole('button')
    ).toHaveCount(1);
  });

for (const [platform, userAgent, touch, manifest] of [
  ['Win32', 'Windows', 0, false],
  ['MacIntel', 'Mac Safari', 0, false],
  ['Linux x86_64', 'Linux', 0, false],
  ['Linux', 'Android', 5, false],
  ['iPhone', 'iPhone Safari', 5, true],
  ['MacIntel', 'Safari', 5, true]
] as const) {
  test(`PWA доступна только iOS: ${userAgent}/${platform}`, async ({
    page
  }) => {
    await device(page, platform, userAgent, touch);
    await page.goto(fixture);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(
      manifest ? 1 : 0
    );
    if (manifest) {
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
        'href',
        '/manifest.webmanifest'
      );
      const response = await page.request.get('/manifest.webmanifest');
      expect(await response.json()).toMatchObject({
        name: 'СЭП Чат',
        display: 'standalone',
        start_url: '/'
      });
    }
  });
}

for (const platform of ['Win32', 'MacIntel', 'Linux x86_64']) {
  test(`переход на сайт без выбора установщиков и установки PWA: ${platform}`, async ({
    page
  }) => {
    await device(page, platform);
    await page.goto(fixture);
    const prevented = await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      (event as any).prompt = () => {
        throw new Error('PWA installation was invoked');
      };
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await page.getByRole('button', { name: 'Открыть приложение' }).click();
    expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
      'sepchat://open'
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).selectedAppLink))
      .toBe(website);
    expect(
      await page.evaluate(() => (window as any).selectedAppTargets)
    ).toEqual(['', '_blank']);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('сайт открывается отдельной вкладкой, исходный чат остаётся открытым', async ({
  page,
  context
}) => {
  await device(page, 'Win32');
  await page.clock.install();
  await context.route('https://pksep.ru/chat/', route =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<meta charset="utf-8"><h1>Скачать СЭП Чат</h1>'
    })
  );
  await page.goto(fixture + '?allow-navigation');
  await page.getByRole('button', { name: 'Открыть приложение' }).click();
  const opening = page.waitForEvent('popup');
  await page.clock.fastForward(2000);
  const popup = await opening;
  await expect(popup).toHaveURL(website);
  await expect(popup.getByRole('heading')).toHaveText('Скачать СЭП Чат');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(page.url()).toContain(fixture);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Открыть приложение' })
  ).toBeVisible();
  await popup.close();
});

for (const theme of ['light', 'dark'])
  for (const collapsed of [false, true]) {
    test(`native-кнопки: ${theme}, свёрнутое меню ${collapsed}`, async ({
      page
    }, info) => {
      await device(page, 'MacIntel');
      await page.clock.install();
      await page.setViewportSize({ width: 280, height: 640 });
      await page.goto(
        `${fixture}?theme=${theme}${collapsed ? '&collapsed' : ''}`
      );
      const button = page.getByTestId('Fixture-DesktopApp-Action');
      await expect(
        page.getByRole('button', { name: 'Открыть приложение' })
      ).toBeVisible();
      await button.click();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await page.screenshot({
        path: info.outputPath(`desktop-launch-${theme}-${collapsed}.png`),
        animations: 'disabled'
      });
      await page.clock.fastForward(2000);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(280);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
      await page.screenshot({
        path: info.outputPath(`desktop-idle-${theme}-${collapsed}.png`),
        animations: 'disabled'
      });
      await expect(button).toHaveAttribute('aria-busy', 'false');
    });
  }

test('Tauri и мобильные браузеры не предлагают desktop-установщик', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.addInitScript(() => {
    (window as any).isTauri = true;
  });
  await page.goto(fixture);
  await expect(page.getByTestId('Fixture-DesktopApp')).toHaveCount(0);
});
for (const [platform, userAgent, touch] of [
  ['Linux', 'Android', 1],
  ['MacIntel', 'Safari', 5],
  ['iPhone', 'iPhone', 1]
] as const) {
  test(`desktop-кнопки скрыты на ${userAgent}/${platform}`, async ({
    page
  }) => {
    await device(page, platform, userAgent, touch);
    await page.goto(fixture);
    await expect(page.getByTestId('Fixture-DesktopApp')).toHaveCount(0);
  });
}

test('установленная PWA предлагает перейти в desktop-приложение', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query =>
      query === '(display-mode: standalone)'
        ? { ...original(query), matches: true }
        : original(query);
  });
  await page.goto(fixture);
  await expect(
    page.getByRole('button', { name: 'Открыть приложение' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Скачать приложение' })
  ).toHaveCount(0);
});
