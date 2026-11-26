import { devices, expect, test } from '@playwright/test';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

test.use({
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false
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
