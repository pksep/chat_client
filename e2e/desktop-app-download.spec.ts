import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);
const fixture = '/e2e/fixtures/desktop-app-download.html';
const base = 'https://chat-server-prod.pksep.ru/api/downloads/desktop/';
const links = {
  Windows: 'windows-x64',
  'Mac Apple Silicon': 'macos-arm64',
  'Mac Intel': 'macos-x64',
  Linux: 'linux-x64'
};
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

test('одна кнопка: переход в приложение не показывает отдельное скачивание', async ({
  page
}) => {
  await device(page, 'Win32');
  await page.clock.install();
  await page.goto(fixture);
  const action = page.getByRole('button', { name: 'Открыть приложение' });
  await expect(
    page.getByTestId('Fixture-DesktopApp').getByRole('button')
  ).toHaveCount(1);
  await action.click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.clock.fastForward(10_000);
  await expect(action).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Скачать приложение' })
  ).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
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

for (const [platform, first] of [
  ['Win32', 'Windows'],
  ['MacIntel', 'Mac Apple Silicon'],
  ['Linux x86_64', 'Linux']
]) {
  test(`native-установщики: ${platform}, выбор и отсутствие установки PWA`, async ({
    page
  }) => {
    await device(page, platform);
    await page.goto(fixture);
    await expect(
      page.getByRole('button', { name: 'Открыть приложение' })
    ).toHaveAttribute('href', 'sepchat://open');
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
    const panel = page.getByRole('dialog', { name: 'Скачать СЭП Чат' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link').first()).toHaveText(first);
    for (const [label, path] of Object.entries(links)) {
      await expect(
        panel.getByRole('link', { name: label, exact: true })
      ).toHaveAttribute('href', base + path);
      await expect(
        panel.getByRole('link', { name: label, exact: true })
      ).toHaveAttribute('target', '_blank');
    }
    await panel.getByRole('link', { name: first, exact: true }).click();
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => (window as any).selectedAppLink)).toBe(
      base + links[first]
    );
  });
}

for (const theme of ['light', 'dark'])
  for (const collapsed of [false, true]) {
    test(`native-кнопки: ${theme}, свёрнутое меню ${collapsed}`, async ({
      page
    }, info) => {
      await device(page, 'Win32');
      await page.setViewportSize({ width: 280, height: 640 });
      await page.goto(
        `${fixture}?theme=${theme}${collapsed ? '&collapsed' : ''}`
      );
      const button = page.getByTestId('Fixture-DesktopApp-Action');
      await expect(
        page.getByRole('button', { name: 'Открыть приложение' })
      ).toBeVisible();
      await button.click();
      const panel = page.getByRole('dialog');
      await expect(panel).toBeFocused();
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(280);
      expect(box.y + box.height).toBeLessThanOrEqual(640);
      await page.screenshot({
        path: info.outputPath(`desktop-download-${theme}-${collapsed}.png`)
      });
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(button).toBeFocused();
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
