import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';
import { expect, test } from '@playwright/test';
test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
});

test('Tauri: отдельная поверхность, управление окном, быстрый микрофон и завершение', async ({
  page
}) => {
  test.setTimeout(120_000);
  const reports: any[] = [];
  await page.route('http://127.0.0.1:5213/report', async route => {
    const report = JSON.parse(route.request().postData()!);
    reports.push(report);
    if (
      process.env.DESKTOP_CALL_SCREENSHOT &&
      ['compact-incoming', 'context-menu', 'screen-permission'].includes(
        report.step
      )
    ) {
      const popup = page
        .context()
        .pages()
        .filter(item => item !== page && !item.isClosed())
        .at(-1)!;
      await popup.bringToFront();
      const name =
        report.step === 'compact-incoming' ? 'incoming-call' : report.step;
      await popup.screenshot({
        path: test.info().outputPath(`${name}.png`),
        timeout: 15_000,
        animations: 'disabled'
      });
    }
    await route.fulfill({
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  });
  await page.route('http://127.0.0.1:5213/**', route =>
    new URL(route.request().url()).pathname === '/report'
      ? route.fallback()
      : route.fulfill({
          json: [],
          headers: { 'Access-Control-Allow-Origin': '*' }
        })
  );
  await installTauriCallWindowMock(page);
  await page.goto('/e2e/fixtures/desktop-call-window.html?nativeToasts=1');
  await expect
    .poll(
      () =>
        reports.some(item => item.step === 'complete' || item.passed === false),
      { timeout: 90_000 }
    )
    .toBe(true);
  expect(
    reports.find(item => item.step === 'complete' || item.passed === false),
    JSON.stringify(reports)
  ).toMatchObject({ step: 'complete', passed: true });
  expect(
    reports.find(item => item.step === 'immediate-microphone').latencyMs
  ).toBeLessThan(250);
  expect(reports.find(item => item.step === 'compact-incoming')).toMatchObject({
    passed: true,
    size: { width: 700, height: 606 }
  });
  expect(reports.find(item => item.step === 'lifecycle')).toMatchObject({
    endCount: 1,
    sourceTrack: 'live'
  });
  const delivered = await page.evaluate(
    () => (window as any).deliveredCallActivities
  );
  const activities = delivered.filter(
    (toast: any) => JSON.parse(toast.payload).type === 'call_activity'
  );
  const messages = delivered.filter(
    (toast: any) => JSON.parse(toast.payload).type === 'new_message'
  );
  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0].payload).topicId).toBe(
    '4e709627-2338-464f-8cda-ec036b41e815'
  );
  expect(
    reports.find(item => item.step === 'message-visibility-minimized')
  ).toMatchObject({
    activelyVisible: false,
    topicVisible: false,
    native: { minimized: true }
  });
  expect(activities).toHaveLength(6);
  expect(reports.find(item => item.step === 'early-window')).toMatchObject({
    passed: true
  });
  expect(reports.find(item => item.step === 'hand-attention')).toMatchObject({
    passed: true
  });
  const attentionRequests = await page.evaluate(
    () => (window as any).callAttentionRequests
  );
  expect(
    attentionRequests.filter(
      (request: any) =>
        request.label === 'call' && request.value?.type === 'Informational'
    ).length
  ).toBeGreaterThanOrEqual(3);
  for (const toast of activities) {
    expect(toast.tag.length).toBeLessThanOrEqual(16);
    const payload = JSON.parse(toast.payload);
    expect(payload.roomId).toHaveLength(36);
    expect(payload.participantId).toHaveLength(36);
  }
  const popup = page
    .context()
    .pages()
    .filter(item => item !== page && !item.isClosed())
    .at(-1)!;
  await popup.bringToFront();
  await expect(
    popup
      .getByRole('button', { name: 'Включить микрофон', exact: true })
      .first()
  ).toBeVisible();
  if (process.env.DESKTOP_CALL_SCREENSHOT)
    await popup.screenshot({
      path: test.info().outputPath('call-window.png'),
      timeout: 15_000,
      animations: 'disabled'
    });
  await expect(page.locator('.call-modal')).toHaveCount(0);
  await popup.locator('.call-modal').click({ button: 'right' });
  const menu = popup.getByTestId('DesktopCallContextMenu');
  const mic = menu.getByRole('menuitemcheckbox', {
    name: 'Включить микрофон',
    exact: true
  });
  await expect(mic).toHaveAttribute('aria-checked', 'false');
  await mic.click();
  await expect(
    menu.getByRole('menuitemcheckbox', {
      name: 'Выключить микрофон',
      exact: true
    })
  ).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callControlsSnapshots.at(-1))
    )
    .toMatchObject({ microphone: true, enabled: true });
  await menu
    .getByRole('menuitemcheckbox', { name: 'Выключить микрофон', exact: true })
    .click();
  await popup.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(popup.locator('.call-modal')).toBeVisible();
  await popup
    .getByRole('button', { name: 'Закрыть окно', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callWindowFixture.host === null)
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callControlsSnapshots.at(-1))
    )
    .toMatchObject({
      enabled: false,
      microphone: false,
      camera: false,
      screen: false
    });
});
