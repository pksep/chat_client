import { devices, expect, test } from '@playwright/test';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

test.use({
  viewport: { width: 1280, height: 800 },
  screen: { width: 1280, height: 800 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false,
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
});

for (const separate of [false, true]) {
  test(`первый диалоговый звонок: один клик включает волну без серверного speaking — ${separate ? 'отдельное окно' : 'главное окно'}`, async ({
    page,
    context
  }) => {
    test.setTimeout(60_000);
    test.skip(
      !(await page.evaluate(
        () =>
          typeof AudioContext === 'function' &&
          typeof MediaStream === 'function'
      )),
      'В этой сборке браузера нет Web Audio/MediaStream; сценарий выполняется в Chromium и WebKit macOS'
    );
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname))
        return route.abort();
      if (url.pathname.startsWith('/mic-fixture-api/'))
        return route.fulfill({ json: [] });
      return route.continue();
    });
    let captures = 0;
    await page.exposeFunction('unexpectedMicCapture', () => {
      captures++;
    });
    await page.addInitScript(() => {
      if (navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async () => {
          await (window as any).unexpectedMicCapture();
          throw new Error('Индикатор не должен запрашивать захват');
        };
    });
    if (separate) await installTauriCallWindowMock(page);
    const opened = separate ? page.waitForEvent('popup') : null;
    await page.goto(
      `/e2e/fixtures/first-call-microphone.html${separate ? '?separate' : ''}`,
      { waitUntil: 'domcontentloaded' }
    );
    const target = opened ? await opened : page;
    await target.bringToFront();
    const enabled = target.getByRole('button', {
      name: 'Выключить микрофон',
      exact: true
    });
    const wave = enabled.locator('.mic-icon__audio-wave');
    for (let attempt = 0; attempt < 3; attempt++) {
      await target
        .getByRole('button', { name: 'Включить микрофон', exact: true })
        .click();
      await expect(enabled).toBeVisible();
      await expect(wave).toHaveAttribute('opacity', '1');
      expect(
        await page.evaluate(
          () => (window as any).firstMicFixture.state.audioLevel
        )
      ).toBe(0);
      expect(
        await page.evaluate(
          () => (window as any).firstMicFixture.state.isSpeaking
        )
      ).toBe(false);
      const shape = await wave.getAttribute('d');
      await expect.poll(() => wave.getAttribute('d')).not.toBe(shape);
      if (separate) {
        const blank = await context.newPage();
        await blank.bringToFront();
        await target.bringToFront();
        await blank.close();
        await expect(wave).toHaveAttribute('opacity', '1');
      }
      await enabled.click();
      await expect(wave).toHaveCount(0);
    }
    expect(captures).toBe(0);
    expect(
      await page.evaluate(() => (window as any).firstMicFixture.stop())
    ).toBe('live');
    await page.evaluate(() => (window as any).firstMicFixture.cleanup());
  });
}
