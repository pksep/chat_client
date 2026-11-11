import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);
const telemetryByPage = new WeakMap<Page, Array<any>>();

const getUpdateTelemetry = async (page: Page) => {
  await page.evaluate(async () => {
    const telemetry = await import('/src/services/useTelemetry.ts');
    await telemetry.flushTelemetryEvents();
  });
  return (telemetryByPage.get(page) || []).filter(event =>
    event.name.startsWith('app.update.')
  );
};

async function openNativeMenu(
  page: Page,
  initialStatus = 0,
  initialAvailability = 2
) {
  const events: any[] = [];
  telemetryByPage.set(page, events);
  await page.addInitScript(
    ({ initialStatus, initialAvailability }) => {
      (window as any).androidBridge = {};
      document.cookie = 'authToken=rustore-test;path=/';
      const bridge = ((window as any).ruStoreBridge = {
        info: {
          updateAvailability: initialAvailability,
          installStatus: initialStatus,
          availableVersionCode: 200
        },
        calls: [] as string[],
        listeners: [] as Array<(payload: any) => void>,
        failInfo: false,
        failStart: false,
        failComplete: false,
        startResultCode: -1,
        holdStart: false,
        holdComplete: true,
        releaseStart: () => {},
        releaseComplete: () => {},
        emit(payload: any) {
          bridge.info.installStatus = payload.installStatus;
          bridge.listeners.forEach(listener => listener(payload));
        }
      });
      (window as any).Capacitor = {
        PluginHeaders: [
          {
            name: 'RuStoreUpdate',
            methods: [
              { name: 'getAppUpdateInfo', rtype: 'promise' },
              { name: 'startFlexibleUpdate', rtype: 'promise' },
              { name: 'completeFlexibleUpdate', rtype: 'promise' },
              { name: 'addListener' },
              { name: 'removeListener', rtype: 'promise' }
            ]
          },
          {
            name: 'App',
            methods: [
              { name: 'getInfo', rtype: 'promise' },
              { name: 'getState', rtype: 'promise' },
              { name: 'addListener' },
              { name: 'removeListener', rtype: 'promise' }
            ]
          }
        ],
        async nativePromise(plugin: string, method: string) {
          if (plugin === 'App') return { version: '1.6.6', isActive: true };
          bridge.calls.push(method);
          if (method === 'getAppUpdateInfo') {
            if (bridge.failInfo) throw new Error('Проверка недоступна');
            return { ...bridge.info };
          }
          if (method === 'startFlexibleUpdate') {
            if (bridge.holdStart)
              await new Promise<void>(resolve => {
                bridge.releaseStart = resolve;
              });
            if (bridge.failStart) throw new Error('Загрузка недоступна');
            return { resultCode: bridge.startResultCode };
          }
          if (method === 'completeFlexibleUpdate') {
            if (bridge.holdComplete)
              await new Promise<void>(resolve => {
                bridge.releaseComplete = resolve;
              });
            if (bridge.failComplete) throw new Error('Установка недоступна');
            return;
          }
        },
        async nativeCallback(
          plugin: string,
          method: string,
          options: { eventName: string },
          listener: (payload: any) => void
        ) {
          if (plugin === 'RuStoreUpdate' && method === 'addListener') {
            bridge.calls.push('addListener');
            bridge.listeners.push(listener);
          }
          return `${plugin}:${options.eventName}`;
        }
      };
      sessionStorage.setItem('menu-collapse', 'false');
    },
    { initialStatus, initialAvailability }
  );
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname.startsWith('/rustore-test-api/')) {
      if (url.pathname.endsWith('/telemetry/events')) {
        events.push(...(route.request().postDataJSON()?.events || []));
        return route.fulfill({ json: { accepted: events.length } });
      }
      if (url.pathname.endsWith('/users/me/access'))
        return route.fulfill({
          json: {
            userId: 'rustore-user',
            access: { client: false, ai: false },
            effective: { client: false, ai: false }
          }
        });
      if (url.pathname.endsWith('/manager/access'))
        return route.fulfill({ json: { allowed: false } });
      return route.fulfill({ json: [] });
    }
    if (url.pathname === '/__rustore-update')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div>'
      });
    return route.continue();
  });
  await page.goto('/__rustore-update');
  await page.evaluate(async () => {
    const { mountRuStoreUpdateFixture } = await import(
      '/e2e/fixtures/rustore-update-harness.ts'
    );
    (window as any).ruStoreFixture = await mountRuStoreUpdateFixture();
  });
  await expect(page.locator('.menu-bottom-nav:visible')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as any).ruStoreFixture.updates.hasCheckedForUpdates.value
      )
    )
    .toBe(true);
  return errors;
}

const menuButton = (page: Page) => page.locator('.menu-update-button:visible');
const emitState = (page: Page, status: number, percent?: number) =>
  page.evaluate(
    ({ status, percent }) =>
      (window as any).ruStoreBridge.emit({
        installStatus: status,
        bytesDownloaded: percent,
        totalBytesToDownload: 100
      }),
    { status, percent }
  );

test('RuStore: смена дня не включает автоматическое веб-обновление', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-11-06T10:00:00Z') });
  let webChecks = 0;
  await page.route('**/web-update.json*', route => {
    webChecks++;
    return route.fulfill({ json: { version: 1000000 } });
  });
  await openNativeMenu(page);
  await page.clock.setSystemTime(new Date('2026-11-07T10:00:00Z'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(menuButton(page)).toBeVisible();
  expect(webChecks).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem('chat_web_update_day'))
  ).toBeNull();
});

test('RuStore: кнопка обновления проходит загрузку и перезапуск без баннера в сообщениях', async ({
  page,
  isMobile
}) => {
  const errors = await openNativeMenu(page);
  await expect(menuButton(page)).toHaveText('Обновить чат');
  const buttonBox = (await menuButton(page).boundingBox())!;
  const navBox = (await page
    .locator('.menu-bottom-nav:visible')
    .boundingBox())!;
  expect(buttonBox.width).toBe(231);
  expect(buttonBox.height).toBe(40);
  expect(navBox.y - buttonBox.y - buttonBox.height).toBeCloseTo(10, 0);
  if (isMobile)
    await page.screenshot({
      path: test.info().outputPath('menu-available.png')
    });
  await page.evaluate(() => {
    (window as any).ruStoreBridge.holdStart = true;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('0%');
  await expect(menuButton(page)).toBeDisabled();
  await page.evaluate(() =>
    (window as any).ruStoreFixture.updates.handleUpdateClick()
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).ruStoreBridge.calls.filter(
          (call: string) => call === 'startFlexibleUpdate'
        ).length
    )
  ).toBe(1);
  await emitState(page, 5);
  await page.evaluate(() => (window as any).ruStoreBridge.releaseStart());
  await emitState(page, 2, 15);
  await expect(menuButton(page)).toHaveText('15%');
  await expect(menuButton(page)).toBeDisabled();
  if (isMobile)
    await page.screenshot({
      path: test.info().outputPath('menu-downloading.png')
    });
  await page.evaluate(() => (window as any).ruStoreFixture.openTopic());
  await expect(page.locator('.chat__message-wrapper')).toBeVisible();
  await expect(page.locator('.chat-update-banner')).toHaveCount(0);
  if (isMobile)
    await page.evaluate(() => (window as any).ruStoreFixture.back());
  await expect(menuButton(page)).toHaveText('15%');
  await expect(menuButton(page)).toBeDisabled();
  await emitState(page, 2, 100);
  await expect(menuButton(page)).toHaveText('100%');
  await emitState(page, 1);
  await expect(menuButton(page)).toHaveText('Перезапустить');
  await expect(menuButton(page)).toBeEnabled();
  if (isMobile)
    await page.screenshot({
      path: test.info().outputPath('menu-downloaded.png')
    });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('Установлено');
  await expect(menuButton(page)).toBeDisabled();
  await expect(
    menuButton(page).locator('.menu-update-button__progress')
  ).toHaveCount(0);
  if (isMobile)
    await page.screenshot({
      path: test.info().outputPath('menu-installed.png')
    });
  await page.evaluate(() =>
    (window as any).ruStoreFixture.updates.handleUpdateClick()
  );
  if (isMobile)
    await page.evaluate(() => (window as any).ruStoreFixture.openTopic());
  await expect(page.locator('.chat__message-wrapper')).toBeVisible();
  await expect(page.locator('.chat-update-banner')).toHaveCount(0);
  await page.evaluate(() => (window as any).ruStoreBridge.releaseComplete());
  if (isMobile)
    await page.evaluate(() => (window as any).ruStoreFixture.back());
  await expect(page.locator('.menu-update')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as any).ruStoreBridge.calls.filter(
          (call: string) => call === 'completeFlexibleUpdate'
        ).length
    )
  ).toBe(1);
  expect(errors).toEqual([]);
});

for (const status of [3, 6]) {
  test(`RuStore: после сбоя ${status} можно повторить загрузку`, async ({
    page
  }) => {
    await openNativeMenu(page, 2);
    await emitState(page, 2, 40);
    await emitState(page, status);
    await expect(menuButton(page)).toHaveText('Обновить чат');
    await expect(menuButton(page)).toBeEnabled();
    await menuButton(page).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).ruStoreBridge.calls))
      .toContain('startFlexibleUpdate');
  });
}

test('RuStore: отказ запуска загрузки сохраняет возможность повторить обновление', async ({
  page
}) => {
  await openNativeMenu(page);
  await page.evaluate(() => {
    (window as any).ruStoreBridge.failStart = true;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('Обновить чат');
  await expect(menuButton(page)).toBeEnabled();
  const failed = (await getUpdateTelemetry(page)).find(
    event => event.name === 'app.update.failed'
  );
  expect(failed).toMatchObject({
    payload: { step: 'start', errorMessage: 'Загрузка недоступна' }
  });
  expect(failed.traceId).toBeTruthy();
  await page.evaluate(() => {
    const bridge = (window as any).ruStoreBridge;
    bridge.failStart = false;
    bridge.holdStart = true;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('0%');
  await expect(menuButton(page)).toBeDisabled();
});

test('RuStore: ошибка установки возвращает кнопку перезапуска', async ({
  page
}) => {
  await openNativeMenu(page, 1);
  await page.evaluate(() => {
    const bridge = (window as any).ruStoreBridge;
    bridge.holdComplete = false;
    bridge.failComplete = true;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('Перезапустить');
  await expect(menuButton(page)).toBeEnabled();
  await page.evaluate(() => {
    (window as any).ruStoreBridge.failComplete = false;
  });
  await menuButton(page).click();
  await expect(page.locator('.menu-update')).toHaveCount(0);
});

test('RuStore: повторная проверка сохраняет кнопку при ошибке и учитывает готовый пакет', async ({
  page
}) => {
  await openNativeMenu(page);
  await page.evaluate(() => {
    (window as any).ruStoreBridge.failInfo = true;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('Обновить чат');
  await expect(menuButton(page)).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).ruStoreBridge.calls)
  ).not.toContain('startFlexibleUpdate');
  expect(await getUpdateTelemetry(page)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'app.update.check.failed' }),
      expect.objectContaining({
        name: 'app.update.start.skipped',
        payload: expect.objectContaining({ reason: 'check_failed' })
      })
    ])
  );
  await page.evaluate(() => {
    const bridge = (window as any).ruStoreBridge;
    bridge.failInfo = false;
    bridge.info.installStatus = 1;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toHaveText('Установлено');
  expect(
    await page.evaluate(() => (window as any).ruStoreBridge.calls)
  ).toContain('completeFlexibleUpdate');
  expect(
    await page.evaluate(() => (window as any).ruStoreBridge.calls)
  ).not.toContain('startFlexibleUpdate');
});

test('RuStore: если обновление исчезло, кнопка скрывается без запуска загрузки', async ({
  page
}) => {
  await openNativeMenu(page);
  await page.evaluate(() => {
    (window as any).ruStoreBridge.info.updateAvailability = 1;
  });
  await menuButton(page).click();
  await expect(page.locator('.menu-update')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).ruStoreBridge.calls)
  ).not.toContain('startFlexibleUpdate');
});

for (const status of [1, 2, 4, 5]) {
  test(`RuStore: восстановление состояния ${status} после запуска приложения`, async ({
    page
  }) => {
    await openNativeMenu(page, status, 3);
    await expect(menuButton(page)).toHaveText(
      status === 1 ? 'Перезапустить' : status === 4 ? 'Установлено' : '0%'
    );
    if (status === 1) await expect(menuButton(page)).toBeEnabled();
    else await expect(menuButton(page)).toBeDisabled();
  });
}

test('RuStore: сохраняет код отмены и не считает его началом загрузки', async ({
  page
}) => {
  await openNativeMenu(page);
  await page.evaluate(() => {
    (window as any).ruStoreBridge.startResultCode = 0;
  });
  await menuButton(page).click();
  await expect(menuButton(page)).toBeEnabled();
  await expect
    .poll(() => getUpdateTelemetry(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app.update.start.result',
          level: 'warn',
          payload: expect.objectContaining({ resultCode: 0 })
        })
      ])
    );
});

test('RuStore: успешный ответ без прогресса сохраняет диагностический таймаут', async ({
  page
}) => {
  await openNativeMenu(page);
  await page.clock.install();
  await menuButton(page).click();
  await expect(menuButton(page)).toBeEnabled();
  await page.clock.runFor(60_001);
  await expect
    .poll(() => getUpdateTelemetry(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'app.update.start.result',
          payload: expect.objectContaining({ resultCode: -1 })
        }),
        expect.objectContaining({
          name: 'app.update.progress_timeout',
          payload: expect.objectContaining({
            stage: 'awaiting_download_progress'
          })
        })
      ])
    );
});
