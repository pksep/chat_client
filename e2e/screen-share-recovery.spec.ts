import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function openFixture(page: Page) {
  await page.route('**/src/services/useLiveKit.ts*', async route => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain('new Room({');
    await route.fulfill({
      response,
      body: source.replace('new Room({', 'window.__createScreenTestRoom({')
    });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__screen-share')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      });
    if (url.pathname.startsWith('/screen-share-api/'))
      return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto('/__screen-share');
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/screen-share-recovery.ts';
    const { initializeScreenShareRecoveryFixture } = await import(
      /* @vite-ignore */ path
    );
    (window as any).screenFixture =
      await initializeScreenShareRecoveryFixture();
  });
}

const snapshot = (page: Page) =>
  page.evaluate(() => (window as any).screenFixture.snapshot());

test('демонстрация переживает сигнальные переподключения и замену комнаты без нового захвата', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(() =>
    (window as any).screenFixture.calls.toggleScreenShare()
  );
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) (window as any).screenFixture.signalReconnect();
  });
  expect(await snapshot(page)).toMatchObject({
    captureCount: 1,
    roomCount: 1,
    screenActive: true
  });
  await page.evaluate(() => (window as any).screenFixture.replaceRoom());
  expect(await snapshot(page)).toMatchObject({
    captureCount: 1,
    roomCount: 2,
    publishCount: 2,
    screenActive: true
  });
  expect((await snapshot(page)).tracks[0].readyState).toBe('live');
  expect((await snapshot(page)).tracks[0].contentHint).toBe('detail');
  await page.evaluate(() => (window as any).screenFixture.calls.cleanup());
  expect((await snapshot(page)).tracks[0].readyState).toBe('ended');
});

test('повторные нажатия во время публикации не останавливают захват', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(() => {
    const fixture = (window as any).screenFixture;
    fixture.setDelayPublication();
    fixture.pending = fixture.calls.toggleScreenShare();
  });
  await expect.poll(async () => (await snapshot(page)).publishCount).toBe(1);
  await page.evaluate(() => {
    const fixture = (window as any).screenFixture;
    for (let i = 0; i < 6; i++) void fixture.calls.toggleScreenShare();
    fixture.releasePublication();
    return fixture.pending;
  });
  expect(await snapshot(page)).toMatchObject({
    captureCount: 1,
    publishCount: 1,
    screenActive: true
  });
  await page.evaluate(() =>
    (window as any).screenFixture.calls.toggleScreenShare()
  );
  expect((await snapshot(page)).tracks[0].readyState).toBe('ended');
});

test('завершение звонка закрывает захват, полученный из запоздавшего диалога выбора экрана', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(() => {
    const fixture = (window as any).screenFixture;
    fixture.setDelayCapture();
    fixture.pending = fixture.calls.toggleScreenShare();
  });
  await expect.poll(async () => (await snapshot(page)).captureCount).toBe(1);
  await page.evaluate(async () => {
    const fixture = (window as any).screenFixture;
    fixture.calls.cleanup();
    fixture.releaseCapture();
    await fixture.pending;
  });
  expect(await snapshot(page)).toMatchObject({
    publishCount: 0,
    screenActive: false
  });
  expect((await snapshot(page)).tracks[0].readyState).toBe('ended');
});

test('таймаут публикации восстанавливает тот же захват без повторного выбора экрана', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    const fixture = (window as any).screenFixture;
    fixture.failNextPublication();
    await fixture.calls.toggleScreenShare();
  });
  await expect.poll(async () => (await snapshot(page)).publishCount).toBe(2);
  expect(await snapshot(page)).toMatchObject({
    captureCount: 1,
    screenActive: true
  });
});

test('демонстрацию можно остановить во время переподключения', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    const fixture = (window as any).screenFixture;
    await fixture.calls.toggleScreenShare();
    fixture.setReconnecting();
    await fixture.calls.toggleScreenShare();
  });
  expect(await snapshot(page)).toMatchObject({ screenActive: false });
  expect((await snapshot(page)).tracks[0].readyState).toBe('ended');
});

test('запоздавшая публикация после выхода не возвращает демонстрацию', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(() => {
    const fixture = (window as any).screenFixture;
    fixture.setDelayPublication();
    fixture.pending = fixture.calls.toggleScreenShare();
  });
  await expect.poll(async () => (await snapshot(page)).publishCount).toBe(1);
  await page.evaluate(async () => {
    const fixture = (window as any).screenFixture;
    fixture.calls.cleanup();
    fixture.releasePublication();
    await fixture.pending;
  });
  expect(await snapshot(page)).toMatchObject({ screenActive: false });
  expect((await snapshot(page)).tracks[0].readyState).toBe('ended');
});

test('переход на TURN не считается подтверждённым без relay candidate pair', async ({
  page
}) => {
  const events: any[] = [];
  await page.context().addInitScript(() => {
    document.cookie = 'authToken=isolated-test;path=/';
  });
  await page.clock.install();
  await openFixture(page);
  await page.route('**/screen-share-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: true } });
  });
  await page.evaluate(async () => {
    const fixture = (window as any).screenFixture;
    await fixture.calls.toggleScreenShare();
    fixture.simulateHighRtt();
  });
  await page.clock.runFor(46_000);
  await expect.poll(async () => (await snapshot(page)).roomCount).toBe(2);
  await page.evaluate(async () => {
    const path = '/src/services/useTelemetry.ts';
    const telemetry = await import(/* @vite-ignore */ path);
    await telemetry.flushTelemetryEvents();
  });
  expect(
    events.some(event => event.name === 'call.turn_relay_recovery.unverified')
  ).toBe(true);
  expect(
    events.some(event => event.name === 'call.turn_relay_recovery.completed')
  ).toBe(false);
  expect(await snapshot(page)).toMatchObject({
    captureCount: 1,
    screenActive: true
  });
});
