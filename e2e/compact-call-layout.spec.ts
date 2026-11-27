import { devices, expect, test } from '@playwright/test';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

test.use({
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false
});

test('тесное окно показывает 2×2 без обрезания, просторное — шесть или девять участников', async ({
  page,
  browserName
}, testInfo) => {
  test.setTimeout(90_000);
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (url.port === '5213' || url.pathname.startsWith('/call-fixture-api/'))
      return route.fulfill({
        json: [],
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    return route.continue();
  });
  await installTauriCallWindowMock(page);
  const opened = page.waitForEvent('popup');
  await page.goto(
    '/e2e/fixtures/desktop-call-window.html?review=1&participants=8'
  );
  const popup = await opened;
  await popup.bringToFront();
  const tiles = popup.locator('.call-modal__remote-tile');
  const names = () =>
    tiles.locator('.call-modal__remote-name > span').allTextContents();
  const check = async (
    width: number,
    height: number,
    count: number,
    columns: number
  ) => {
    await popup.setViewportSize({ width, height });
    await expect(tiles).toHaveCount(count);
    await expect
      .poll(async () => {
        const boxes = await tiles.evaluateAll(elements =>
          elements.map(element => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width, height: box.height };
          })
        );
        return boxes.every(
          (box, index) =>
            box.width >= 50 &&
            box.height >= 40 &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= width + 1 &&
            box.y + box.height <= height + 1 &&
            (index < columns
              ? Math.abs(box.y - boxes[0].y) < 1
              : box.y > boxes[0].y)
        );
      })
      .toBe(true);
    for (const tile of await tiles.all()) {
      const box = (await tile.boundingBox())!;
      const name = (await tile
        .locator('.call-modal__remote-name')
        .boundingBox())!;
      expect(name.x).toBeGreaterThanOrEqual(box.x);
      expect(name.x + name.width).toBeLessThanOrEqual(box.x + box.width + 1);
      const avatar = (await tile.locator('.call-modal__avatar').boundingBox())!;
      expect(avatar.y).toBeGreaterThanOrEqual(box.y);
      expect(avatar.y + avatar.height).toBeLessThanOrEqual(name.y + 1);
      const quality = (await tile
        .locator('.call-modal__connection-quality')
        .boundingBox())!;
      expect(
        avatar.x + avatar.width <= quality.x ||
          avatar.y >= quality.y + quality.height ||
          avatar.y + avatar.height <= quality.y
      ).toBe(true);
    }
    for (const button of await popup
      .locator('.call-modal__controls button')
      .all())
      await expect(button).toBeInViewport();
    for (const button of await popup
      .locator('.desktop-titlebar__controls button')
      .all())
      await expect(button).toBeInViewport();
    await expect(
      popup.locator('.desktop-titlebar__brand .chat-icon')
    ).toBeVisible();
  };
  await check(960, 720, 6, 3);
  for (const theme of ['light', 'dark']) {
    await popup.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await check(900, 400, 4, 2);
    const first = await names();
    await popup.locator('.call-modal__pagination-arrow').last().click();
    await expect.poll(names).not.toEqual(first);
    const second = await names();
    expect(new Set([...first, ...second]).size).toBe(8);
    await popup.locator('.call-modal__pagination-arrow').first().click();
    await expect.poll(names).toEqual(first);
    if (browserName === 'webkit')
      await popup.screenshot({
        path: testInfo.outputPath(`small-call-${theme}.png`),
        animations: 'disabled',
        timeout: 15_000
      });
    await check(330, 400, 4, 2);
    await check(900, 330, 4, 2);
    await check(220, 330, 4, 2);
    if (browserName === 'webkit')
      await popup.screenshot({
        path: testInfo.outputPath(`tiny-call-${theme}.png`),
        animations: 'disabled',
        timeout: 15_000
      });
    await check(1280, 980, 8, 3);
    await expect(popup.locator('.call-modal__pagination')).toHaveCount(0);
  }
  await page.evaluate(() =>
    (window as any).callWindowFixture.showParticipants(100)
  );
  await check(220, 330, 4, 2);
  const dots = popup.locator('.call-modal__pagination-dot');
  await expect(dots).toHaveCount(5);
  for (let index = 0; index < 3; index++)
    await popup
      .getByRole('button', { name: 'Следующие участники', exact: true })
      .click();
  await expect(
    popup.locator('.call-modal__pagination-dot[aria-current="page"]')
  ).toHaveAttribute('aria-label', 'Страница участников 4 из 25');
  for (const button of await popup
    .locator('.call-modal__pagination button')
    .all())
    await expect(button).toBeInViewport();
  await page.evaluate(() =>
    (window as any).callWindowFixture.showParticipants(8)
  );
  await check(960, 720, 6, 3);
});

test('два участника и быстрые действия адаптируются к размеру окна звонка', async ({
  page
}) => {
  test.setTimeout(90_000);
  let recordingRequests = 0;
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (url.pathname.startsWith('/call-fixture-api/')) {
      if (route.request().method() === 'POST') {
        recordingRequests++;
        return route.fulfill({
          json: {
            id: 'local-summary',
            roomId: 'e641f474-1b51-4cec-ac54-b9c752de8ed6',
            topicId: 'local-call-topic',
            recorderUserId: 'local-preview',
            status: url.pathname.endsWith('/stop') ? 'PROCESSING' : 'RECORDING',
            videoStatus: 'RECORDING',
            videoAvailable: false,
            createdAt: new Date().toISOString()
          }
        });
      }
      return route.fulfill({ json: [] });
    }
    if (url.port === '5213')
      return route.fulfill({
        json: [],
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    return route.continue();
  });
  await installTauriCallWindowMock(page);
  await page.addInitScript(() => {
    if (!navigator.mediaDevices.getDisplayMedia)
      Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
        value: async () => new MediaStream()
      });
  });
  const popupPromise = page.waitForEvent('popup');
  await page.goto(
    '/e2e/fixtures/desktop-call-window.html?review=1&participants=2'
  );
  const popup = await popupPromise;
  await popup.bringToFront();
  await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(2);
  const tiles = popup.locator('.call-modal__remote-tile');
  for (const theme of ['light', 'dark']) {
    await popup.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    await popup.setViewportSize({ width: 330, height: 330 });
    const share = popup
      .getByTestId('CallModal-CallControls-ScreenShareTooltip')
      .getByRole('button');
    const record = popup
      .getByTestId('CallModal-CallControls-RecordingTooltip')
      .getByRole('button');
    await expect(share).toBeVisible();
    await expect(record).toBeVisible();
    await expect
      .poll(async () => {
        const a = await tiles.nth(0).boundingBox();
        const b = await tiles.nth(1).boundingBox();
        return Math.abs(a!.y - b!.y) < 1 && a!.x + a!.width <= b!.x + 1;
      })
      .toBe(true);
    for (const button of await popup
      .locator('.call-modal__controls button')
      .all()) {
      await expect(button).toBeInViewport();
      const rect = await button.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(40);
    }
    await share.click();
    await expect(share).toHaveAttribute(
      'aria-label',
      'Выключить демонстрацию экрана'
    );
    await share.click();
    await expect(share).toHaveAttribute(
      'aria-label',
      'Включить демонстрацию экрана'
    );
    await record.click();
    await expect(record).toHaveClass(/call-modal__control-button--recording/);
    await record.click();
    await expect(record).not.toHaveClass(
      /call-modal__control-button--recording/
    );
  }
  expect(recordingRequests).toBe(4);
  await popup.setViewportSize({ width: 270, height: 330 });
  await expect(
    popup.getByTestId('CallModal-CallControls-RecordingTooltip')
  ).toHaveCount(0);
  await expect(
    popup.getByTestId('CallModal-CallControls-ScreenShareTooltip')
  ).toHaveCount(0);
  await popup
    .getByRole('button', { name: 'Открыть меню звонка', exact: true })
    .click();
  await expect(popup.locator('.call-modal__mobile-actions-menu')).toBeVisible();
  await expect(
    popup
      .locator('.call-modal__mobile-actions-menu')
      .getByText('Записать звонок', { exact: true })
  ).toBeVisible();
  await popup
    .locator('.call-modal__mobile-actions-menu')
    .getByText('Включить демонстрацию', { exact: true })
    .click();
  await expect(popup.locator('.call-modal__mobile-actions-menu')).toHaveCount(
    0
  );
  for (const [width, height] of [
    [391, 800],
    [900, 1400],
    [220, 440]
  ]) {
    await popup.setViewportSize({ width, height });
    await expect
      .poll(async () => {
        const a = await tiles.nth(0).boundingBox();
        const b = await tiles.nth(1).boundingBox();
        return Math.abs(a!.x - b!.x) < 1 && a!.y + a!.height <= b!.y + 1;
      })
      .toBe(true);
    for (const tile of await tiles.all()) await expect(tile).toBeInViewport();
    for (const button of await popup
      .locator('.call-modal__controls button')
      .all())
      await expect(button).toBeInViewport();
  }
});
