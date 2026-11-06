import { expect, test, type Page } from '@playwright/test';
import webUpdateInfo from '../public/web-update.json' with { type: 'json' };

const runningVersion = webUpdateInfo.version;

test.use({ timezoneId: 'Asia/Yerevan' });
const initialTime = new Date('2026-11-06T19:59:30Z');
const nextDay = new Date('2026-11-06T20:00:01Z');
const fixtureUrl = '/e2e/fixtures/daily-web-update.html?topic=test#message';

async function openUpdates(page: Page, initialVersion = runningVersion + 1) {
  await page.clock.install({ time: initialTime });
  let version: number | string = initialVersion;
  let requests = 0;
  let htmlAvailable = true;
  let navigations = 0;
  let callModuleRequests = 0;
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      navigations++;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/web-update.json') {
      requests++;
      return route.fulfill({ json: { version } });
    }
    if (url.pathname.includes('/useLiveKit')) {
      callModuleRequests++;
      return route.abort();
    }
    if (url.searchParams.has('_chat_update') && !htmlAvailable) {
      return route.fulfill({ status: 503, body: 'Недоступно' });
    }
    return route.continue();
  });
  await page.goto(fixtureUrl);
  await ready(page);
  return {
    get requests() {
      return requests;
    },
    get navigations() {
      return navigations;
    },
    get callModuleRequests() {
      return callModuleRequests;
    },
    setVersion(value: number | string) {
      version = value;
    },
    setHtmlAvailable(value: boolean) {
      htmlAvailable = value;
    }
  };
}

const ready = (page: Page) =>
  expect
    .poll(
      () =>
        page
          .evaluate(
            () =>
              (window as any).dailyUpdateFixture?.updates.hasCheckedForUpdates
                .value
          )
          .catch(() => false),
      { timeout: 10_000 }
    )
    .toBe(true);

const check = (page: Page) =>
  page.evaluate(() =>
    (window as any).dailyUpdateFixture.updates.checkForUpdates()
  );

async function changeDay(page: Page) {
  await page.clock.setSystemTime(nextDay);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

async function expectReload(page: Page, action: () => Promise<unknown>) {
  await Promise.all([
    page.waitForEvent('framenavigated', frame => frame === page.mainFrame()),
    action()
  ]);
  await ready(page);
  await expect(page).toHaveURL(
    new RegExp('daily-web-update.html\\?topic=test#message$')
  );
}

test('новая версия в тот же день не перезагружает веб и не показывает кнопку', async ({
  page
}) => {
  const state = await openUpdates(page);
  await check(page);
  expect(state.requests).toBe(2);
  expect(state.navigations).toBe(1);
  expect(
    await page.evaluate(() => localStorage.getItem('chat_web_update_day'))
  ).toBe('2026-11-06');
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
});

test('сохранённый в localStorage прошлый день обновляет чат сразу при открытии', async ({
  page
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('chat_web_update_day')) {
      localStorage.setItem('chat_web_update_day', '2026-11-05');
    }
  });
  const state = await openUpdates(page);
  await expect.poll(() => state.navigations).toBe(2);
  await ready(page);
  expect(
    await page.evaluate(() => localStorage.getItem('chat_web_update_day'))
  ).toBe('2026-11-06');
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
});

test('смена локального дня загружает новую версию один раз и сохраняет маршрут', async ({
  page
}) => {
  const state = await openUpdates(page);
  await expectReload(page, () => changeDay(page));
  expect(state.navigations).toBe(2);
  expect(state.callModuleRequests).toBe(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('chat_web_update_reload_attempt')
    )
  ).toContain(String(runningVersion + 1));
  await check(page);
  expect(state.navigations).toBe(2);
  await expect(page.locator('.menu-update-button')).toHaveCount(0);
});

test('новый день без новой версии сохраняет вкладку; позднее обновление применяется', async ({
  page
}) => {
  const state = await openUpdates(page, runningVersion);
  await changeDay(page);
  await expect.poll(() => state.requests).toBe(2);
  await check(page);
  expect(state.navigations).toBe(1);
  state.setVersion(`${runningVersion + 0.5}`);
  await expectReload(page, () => check(page));
  expect(state.navigations).toBe(2);
});

for (const blocked of [
  'hidden',
  'offline',
  'call',
  'upload',
  'editing'
] as const) {
  test(`обновление ждёт завершения состояния ${blocked}`, async ({ page }) => {
    const state = await openUpdates(page);
    await page.evaluate(blocked => {
      const fixture = (window as any).dailyUpdateFixture;
      if (blocked === 'hidden')
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden'
        });
      if (blocked === 'offline')
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          value: false
        });
      if (blocked === 'call') fixture.calls.open.value = true;
      if (blocked === 'upload')
        fixture.release = fixture.deferWebUpdateReload();
      if (blocked === 'editing') {
        const input = document.createElement('textarea');
        input.value = 'Неотправленное сообщение';
        document.body.append(input);
        input.focus();
      }
    }, blocked);
    await changeDay(page);
    await check(page);
    expect(state.navigations).toBe(1);
    await page.evaluate(blocked => {
      const fixture = (window as any).dailyUpdateFixture;
      if (blocked === 'hidden')
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible'
        });
      if (blocked === 'offline')
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          value: true
        });
      if (blocked === 'call') fixture.calls.open.value = false;
      if (blocked === 'upload') fixture.release();
      if (blocked === 'editing') (document.activeElement as HTMLElement).blur();
    }, blocked);
    await expectReload(page, () => check(page));
    expect(state.navigations).toBe(2);
  });
}

test('сбрасывается кэш оболочки, сохраняются история, авторизация и push worker', async ({
  page
}) => {
  await openUpdates(page);
  await page.evaluate(async () => {
    localStorage.setItem('chat_auth_session', 'сохранённая сессия');
    localStorage.setItem('chat_web_seen_update_version', '1000000');
    sessionStorage.setItem('draft', 'черновик');
    for (const name of ['workbox-precache-v2-test', 'chat-media-cache']) {
      const cache = await caches.open(name);
      await cache.put('/cached-data', new Response('данные'));
    }
    Object.defineProperty(navigator.serviceWorker, 'getRegistrations', {
      value: async () =>
        ['/sw.js', '/service-worker.js', '/pending-upload-sw.js'].map(path => ({
          scope: location.origin + '/',
          active: { scriptURL: location.origin + path },
          unregister: async () => {
            sessionStorage.setItem(`unregistered:${path}`, 'true');
            return true;
          }
        }))
    });
  });
  await expectReload(page, () => changeDay(page));
  const state = await page.evaluate(async () => ({
    caches: await caches.keys(),
    session: localStorage.getItem('chat_auth_session'),
    draft: sessionStorage.getItem('draft'),
    appWorker: sessionStorage.getItem('unregistered:/sw.js'),
    pushWorker: sessionStorage.getItem('unregistered:/service-worker.js'),
    uploadWorker: sessionStorage.getItem('unregistered:/pending-upload-sw.js')
  }));
  expect(state.caches).not.toContain('workbox-precache-v2-test');
  expect(state.caches).toContain('chat-media-cache');
  expect(state).toMatchObject({
    session: 'сохранённая сессия',
    draft: 'черновик',
    appWorker: 'true',
    pushWorker: null,
    uploadWorker: null
  });
});

test('ошибка новой страницы сохраняет старую вкладку и кэш до успешного повтора', async ({
  page
}) => {
  const state = await openUpdates(page);
  state.setHtmlAvailable(false);
  await page.evaluate(async () => {
    await caches.open('workbox-precache-v2-test');
  });
  await changeDay(page);
  await check(page);
  expect(state.navigations).toBe(1);
  expect(await page.evaluate(() => caches.keys())).toContain(
    'workbox-precache-v2-test'
  );
  state.setHtmlAvailable(true);
  await expectReload(page, () => check(page));
});

test('перезагрузка обходит старую HTML-оболочку действующего service worker', async ({
  page
}) => {
  await openUpdates(page);
  await page.evaluate(async () => {
    const cache = await caches.open('workbox-precache-v2-old-shell');
    await cache.put(
      location.href,
      new Response('<!doctype html><p>Старая оболочка</p>', {
        headers: { 'content-type': 'text/html' }
      })
    );
    await navigator.serviceWorker.register(
      `/e2e/fixtures/sw.js?version=${(window as any).dailyUpdateFixture.runningVersion + 1}`
    );
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {
          once: true
        })
      );
    }
  });
  await expectReload(page, () => changeDay(page));
  await expect(page.getByText('Старая оболочка')).toHaveCount(0);
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).includes('workbox-precache-v2-old-shell')
    )
  ).toBe(false);
});

for (const version of [
  'некорректно',
  `${runningVersion + 1}broken`,
  runningVersion - 1
]) {
  test(`версия ${version} не вызывает перезагрузку`, async ({ page }) => {
    const state = await openUpdates(page);
    state.setVersion(version);
    await changeDay(page);
    await check(page);
    expect(state.navigations).toBe(1);
  });
}

test('Tauri сохраняет ручное обновление после смены дня', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).isTauri = true;
    localStorage.setItem('chat_web_seen_update_version', '1');
  });
  const state = await openUpdates(page);
  await changeDay(page);
  await check(page);
  expect(state.navigations).toBe(1);
  await expect(page.locator('.menu-update-button')).toBeVisible();
});
