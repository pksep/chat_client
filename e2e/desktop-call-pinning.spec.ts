import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

test.use({
  viewport: { width: 1500, height: 1000 },
  screen: { width: 1920, height: 1080 },
  isMobile: false,
  hasTouch: false
});
test.setTimeout(60_000);
async function open(
  page: Page,
  mode: { supported: boolean; reject: boolean; linux?: boolean } = {
    supported: true,
    reject: false
  }
) {
  await installTauriCallWindowMock(page);
  await page.addInitScript(mode => {
    Object.assign(window, {
      callPinSupported: mode.supported,
      callPinRejected: mode.reject,
      callLinux: mode.linux
    });
  }, mode);
  await page.route('http://127.0.0.1:5213/report', route =>
    route.fulfill({
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  );
  const popupReady = page.waitForEvent('popup');
  await page.goto(
    '/e2e/fixtures/desktop-call-window.html?review=1&participants=10'
  );
  const popup = await popupReady;
  await expect(popup.getByTestId('DesktopTitleBar')).toBeVisible();
  return popup;
}

test('пин меняет только окно звонка и сохраняется после fullscreen', async ({
  page
}) => {
  const popup = await open(page);
  const pin = popup.getByRole('button', {
    name: 'Закрепить поверх других окон',
    exact: true
  });
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await pin.click();
  await expect(
    popup.getByRole('button', { name: 'Открепить окно звонка' })
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(async () => {
      const { getCurrentWindow } = await import(
        '/node_modules/@tauri-apps/api/window.js'
      );
      return getCurrentWindow().isAlwaysOnTop();
    })
  ).toBe(false);
  await page.evaluate(async () => {
    const context = (window as any).callWindowFixture.host.context;
    await context.setFullscreen(true);
    await context.setFullscreen(false);
  });
  const active = popup.getByRole('button', { name: 'Открепить окно звонка' });
  await expect(active).toHaveAttribute('aria-pressed', 'true');
  await active.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
});

test('не показывает ложный пин при отказе оконной системы', async ({
  page
}) => {
  const popup = await open(page, { supported: true, reject: true });
  const pin = popup.getByRole('button', {
    name: 'Закрепить поверх других окон'
  });
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
  await expect(pin).toBeEnabled();
});

test('X11 восстанавливает пин после подтверждения fullscreen от WM, а не раннего флага Tao', async ({
  page
}) => {
  const popup = await open(page, {
    supported: true,
    reject: false,
    linux: true
  });
  const pin = popup.locator('.desktop-titlebar__pin');
  await pin.click();
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(async () => {
    const context = (window as any).callWindowFixture.host.context;
    await context.setFullscreen(true);
    await context.setFullscreen(false);
  });
  await page.waitForTimeout(250);
  await expect(pin).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() =>
      (
        window as any
      ).callWindowFixture.host.context.nativeWindow.isAlwaysOnTop()
    )
  ).toBe(true);
});

test('новый звонок не использует закрытый именованный контекст WebKit', async ({
  page
}) => {
  const first = await open(page);
  const firstName = await first.evaluate(() => window.name);
  const nextPopup = page.waitForEvent('popup');
  await page.evaluate(async () => {
    const win = window as any;
    win.callRetainClosedTarget = true;
    await win.callWindowFixture.host.context.actions.leaveCall();
    await win.callWindowFixture.open();
  });
  const second = await nextPopup;
  await expect(second.getByTestId('DesktopTitleBar')).toBeVisible();
  expect(await second.evaluate(() => window.name)).not.toBe(firstName);
});

test('закрытие во время запроса состояния не оставляет необработанную ошибку', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.evaluate(async () => {
    const win = window as any;
    const original = win.__TAURI_INTERNALS__.invoke;
    let reject!: (error: Error) => void;
    let started!: () => void;
    const requested = new Promise<void>(resolve => {
      started = resolve;
    });
    const pending = new Promise((_, fail) => {
      reject = fail;
    });
    win.__TAURI_INTERNALS__.invoke = (command: string, args: any) => {
      if (command === 'plugin:window|is_fullscreen' && args.label === 'call') {
        started();
        return pending;
      }
      return original(command, args);
    };
    const host = win.callWindowFixture.host;
    const { LogicalSize } = await import(
      '/node_modules/@tauri-apps/api/dpi.js'
    );
    await host.context.nativeWindow.setSize(new LogicalSize(900, 700));
    await requested;
    await host.dispose();
    reject(new Error('window not found'));
    await new Promise(resolve => setTimeout(resolve, 50));
  });
  expect(errors).toEqual([]);
});

test('в неподдерживаемом Wayland пин отключён с пояснением', async ({
  page
}) => {
  const popup = await open(page, { supported: false, reject: false });
  const pin = popup.getByRole('button', {
    name: 'Закрепление поверх окон недоступно в этой оконной системе'
  });
  await expect(pin).toBeDisabled();
  await expect(pin).toHaveAttribute('aria-pressed', 'false');
});

for (const dark of [false, true]) {
  test(`сетка 6↔9 использует реальную область окна, тема ${dark ? 'тёмная' : 'светлая'}`, async ({
    page
  }) => {
    const popup = await open(page);
    if (dark)
      await page.evaluate(async () => {
        const { useThemeStore } = await import('/src/stores/theme.ts');
        useThemeStore().setTheme(true);
      });
    await popup.setViewportSize({ width: 960, height: 720 });
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(6);
    await popup.locator('.call-modal__pagination-arrow').last().click();
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(4);
    await popup.setViewportSize({ width: 1400, height: 950 });
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(9);
    for (const tile of await popup.locator('.call-modal__remote-tile').all())
      await expect(tile).toBeInViewport();
    await expect(
      popup.getByRole('button', { name: 'Завершить звонок', exact: true })
    ).toBeInViewport();
    await popup.bringToFront();
    // Chromium ждёт FontFaceSet.ready бесконечно в adopted about:blank DOM.
    // Снимаем уже проверенную геометрию непосредственно через compositor.
    const cdp = await popup.context().newCDPSession(popup);
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false
    });
    await writeFile(
      test.info().outputPath('nine-participants.png'),
      Buffer.from(capture.data, 'base64')
    );
    await cdp.detach();
    await popup.setViewportSize({ width: 1400, height: 600 });
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(6);
    await popup.setViewportSize({ width: 900, height: 1100 });
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(6);
    await page.evaluate(() =>
      (window as any).callWindowFixture.showParticipants(9)
    );
    await popup.setViewportSize({ width: 1400, height: 950 });
    await expect(popup.locator('.call-modal__remote-tile')).toHaveCount(9);
    await expect(popup.locator('.call-modal__pagination')).toHaveCount(0);
  });
}
