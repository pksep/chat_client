import { expect, test, type Page } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

const prepare = async (
  page: Page,
  options: {
    standalone?: boolean;
    permission?: string;
    existing?: boolean;
    fail?: boolean;
    unsupported?: boolean;
    delayedWorker?: boolean;
    ios?: boolean;
  } = {}
) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests: any[] = [];
  let failing = options.fail || false;
  await page.addInitScript(options => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        options.ios === false
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36'
          : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
    });
    Object.defineProperty(navigator, 'standalone', {
      value: options.standalone !== false
    });
    const fixture = ((window as any).webPushFixture = {
      permission: options.permission || 'default',
      requests: 0,
      gestures: [] as boolean[],
      subscriptions: 0,
      unsubscribes: 0
    });
    const notification = {
      get permission() {
        return fixture.permission;
      },
      requestPermission() {
        fixture.requests++;
        fixture.gestures.push(navigator.userActivation?.isActive === true);
        fixture.permission = 'granted';
        return Promise.resolve('granted');
      }
    };
    Object.defineProperty(window, 'Notification', {
      value: notification,
      configurable: true
    });
    Object.defineProperty(window, 'PushManager', {
      value: class {},
      configurable: true
    });
    if (options.unsupported) Reflect.deleteProperty(window, 'Notification');
    const subscription = {
      endpoint: 'https://web.push.apple.com/isolated-test',
      options: {},
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'test-key', auth: 'test-auth' }
        };
      },
      async unsubscribe() {
        fixture.unsubscribes++;
        return true;
      }
    };
    let existing = options.existing ? subscription : null;
    const worker = Object.assign(new EventTarget(), {
      scriptURL: `${location.origin}/service-worker.js`,
      state: options.delayedWorker ? 'activating' : 'activated',
      postMessage() {}
    });
    const registration = {
      active: options.delayedWorker ? null : worker,
      installing: options.delayedWorker ? worker : null,
      update: async () => {
        if (options.delayedWorker)
          setTimeout(() => {
            worker.state = 'activated';
            registration.active = worker;
            worker.dispatchEvent(new Event('statechange'));
          }, 60);
      },
      pushManager: {
        getSubscription: async () => existing,
        subscribe: async () => {
          if (!registration.active)
            throw new Error('Нет активного service worker');
          fixture.subscriptions++;
          existing = subscription;
          return subscription;
        }
      },
      getNotifications: async () => []
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        addEventListener() {},
        ready: Promise.resolve(registration)
      }
    });
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'isolated-web-push',
        user: { id: 'performance-user' }
      })
    );
  }, options);
  const state = await openFixture(page, { shell: true });
  await page.route('**/performance-api/push/*', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('public-key'))
      return route.fulfill({ json: { publicKey: 'AQIDBA' } });
    if (path.endsWith('/subscribe')) {
      requests.push(route.request().postDataJSON());
      return route.fulfill({
        status: failing ? 503 : 200,
        json: { success: !failing }
      });
    }
    return route.fulfill({ json: { success: true } });
  });
  await page.evaluate(async () => {
    const push = await import('/src/services/usePushNotifications.ts');
    (window as any).pushModule = push;
    await push.initPushNotifications().catch(() => {});
  });
  return {
    state,
    requests,
    restore: () => {
      failing = false;
    }
  };
};

test('iPhone запрашивает разрешение только по кнопке и регистрирует Apple push', async ({
  page
}, testInfo) => {
  const fixture = await prepare(page);
  const prompt = page.getByTestId('IosPushNotificationPrompt');
  await expect(prompt).toBeVisible();
  const modal = page.locator('dialog.ios-push-modal');
  await expect(modal).toBeVisible();
  expect(
    await prompt.evaluate(el => !!el.closest('dialog.mobile__modal'))
  ).toBe(true);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.requests)
  ).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath('ios-notifications.png')
  });
  await prompt.getByRole('button', { name: 'Включить', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  expect(fixture.requests).toHaveLength(1);
  expect(fixture.requests[0].browser).toBe('safari');
  expect(
    await page.evaluate(() => (window as any).webPushFixture.gestures)
  ).toEqual([true]);
  expect(fixture.state.errors).toEqual([]);
});

test('существующая Apple-подписка сохраняется и повторно привязывается без отписки', async ({
  page
}) => {
  const fixture = await prepare(page, {
    permission: 'granted',
    existing: true
  });
  expect(fixture.requests).toHaveLength(1);
  expect(
    await page.evaluate(() => {
      const fixture = (window as any).webPushFixture;
      return [fixture.requests, fixture.subscriptions, fixture.unsubscribes];
    })
  ).toEqual([0, 0, 0]);
  await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`окно уведомлений соответствует макету и учитывает safe area: ${theme}`, async ({
    page
  }, testInfo) => {
    await prepare(page);
    await page.evaluate(theme => {
      document.documentElement.classList.add('chat-ios-pwa');
      document.documentElement.classList.remove('theme-light', 'theme-dark');
      document.documentElement.classList.add(`theme-${theme}`);
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    const prompt = page.getByTestId('IosPushNotificationPrompt');
    const modal = page.locator('dialog.ios-push-modal');
    const heading = prompt.getByRole('heading', {
      name: 'Включить уведомления чата',
      exact: true
    });
    await expect(heading).toHaveCSS('font-size', '20px');
    await expect(heading).toHaveCSS('font-weight', '700');
    await expect(prompt).toHaveCSS('text-align', 'center');
    await expect(prompt.locator('p')).toHaveText(
      'Получайте уведомления о новых сообщениях, даже когда чат свёрнут или закрыт'
    );
    await expect(prompt.locator('p')).toHaveCSS('font-size', '14px');
    await expect(prompt.locator('p')).toHaveCSS('font-weight', '700');
    await expect
      .poll(async () => {
        const box = (await modal.boundingBox())!;
        return Math.round(box.y + box.height);
      })
      .toBe(844);
    const modalBox = (await modal.boundingBox())!;
    expect(modalBox.x).toBe(0);
    expect(modalBox.width).toBe(390);
    for (const label of ['Включить', 'Настроить позже']) {
      const button = prompt.getByRole('button', { name: label, exact: true });
      await expect(button).toHaveCSS('font-size', '20px');
      const box = (await button.boundingBox())!;
      expect(box.height).toBe(50);
      expect(box.x).toBe(15);
      expect(box.width).toBe(360);
      expect(box.y + box.height).toBeLessThanOrEqual(844 - 34);
    }
    await page.screenshot({
      path: testInfo.outputPath(`ios-notifications-${theme}.png`),
      animations: 'disabled'
    });
    await prompt.getByRole('button', { name: 'Настроить позже' }).click();
    await expect(prompt).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).webPushFixture.requests)
    ).toBe(0);
  });
}

test('подписка восстанавливается после ошибки сети, одновременные попытки объединяются', async ({
  page
}) => {
  const fixture = await prepare(page, { permission: 'granted', fail: true });
  await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
  fixture.restore();
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('online'));
    await Promise.all(
      Array.from({ length: 3 }, () =>
        (window as any).pushModule.initPushNotifications()
      )
    );
  });
  await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
  expect(fixture.requests).toHaveLength(2);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.subscriptions)
  ).toBe(1);
  expect(fixture.state.errors).toEqual([]);
});

test('фоновая регистрация при возврате в PWA не открывает окно уведомлений', async ({
  page
}) => {
  const fixture = await prepare(page, {
    permission: 'granted',
    existing: true
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/performance-api/push/subscribe', async route => {
    await pending;
    await route.fulfill({ json: { success: true } });
  });
  await page.evaluate(() => {
    const fixture = (window as any).webPushFixture;
    fixture.promptAppearances = 0;
    new MutationObserver(records => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node instanceof Element &&
            (node.matches('.ios-push-modal') ||
              node.querySelector('.ios-push-modal'))
          )
            fixture.promptAppearances++;
    }).observe(document.body, { childList: true, subtree: true });
    const now = Date.now();
    Date.now = () => now + 6 * 60_000;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { webPushStatus } = await import(
            '/src/services/web-push-status.ts'
          );
          return webPushStatus.value;
        })
      )
      .toBe('registering');
    await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).pushModule.initPushNotifications());
  expect(
    await page.evaluate(() => {
      const fixture = (window as any).webPushFixture;
      return [
        fixture.promptAppearances,
        fixture.requests,
        fixture.subscriptions,
        fixture.unsubscribes
      ];
    })
  ).toEqual([0, 0, 0, 0]);
  expect(fixture.state.errors).toEqual([]);
});

test('ошибка после кнопки включения остаётся видимой и допускает повтор', async ({
  page
}) => {
  const fixture = await prepare(page, { fail: true });
  const prompt = page.getByTestId('IosPushNotificationPrompt');
  await prompt.getByRole('button', { name: 'Включить', exact: true }).click();
  await expect(prompt).toContainText('Не удалось');
  fixture.restore();
  await prompt.getByRole('button', { name: 'Включить', exact: true }).click();
  await expect(prompt).toHaveCount(0);
  expect(fixture.requests).toHaveLength(2);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.requests)
  ).toBe(1);
});

for (const permission of ['default', 'denied']) {
  test(`Safari вне PWA объясняет установку без запроса разрешения: ${permission}`, async ({
    page
  }) => {
    const fixture = await prepare(page, { standalone: false, permission });
    const prompt = page.getByTestId('IosPushNotificationPrompt');
    await expect(prompt).toContainText('экран «Домой»');
    await prompt.getByRole('button', { name: 'Как установить' }).click();
    await expect(
      page.getByRole('heading', { name: 'Установка на iPhone' })
    ).toBeVisible();
    expect(fixture.requests).toHaveLength(0);
    expect(
      await page.evaluate(() => (window as any).webPushFixture.requests)
    ).toBe(0);
  });
}

test('отказанное разрешение объясняет настройки и не запрашивается повторно', async ({
  page
}) => {
  await prepare(page, { permission: 'denied' });
  await expect(page.getByTestId('IosPushNotificationPrompt')).toContainText(
    'настройках iPhone'
  );
  await expect(
    page.getByRole('button', { name: 'Включить', exact: true })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.requests)
  ).toBe(0);
});

test('iOS без Notification API не падает и объясняет необходимую версию', async ({
  page
}) => {
  const fixture = await prepare(page, { unsupported: true });
  await expect(page.getByTestId('IosPushNotificationPrompt')).toContainText(
    '16.4'
  );
  expect(fixture.state.errors).toEqual([]);
});

test('первая подписка дожидается активации service worker', async ({
  page
}) => {
  const fixture = await prepare(page, {
    permission: 'granted',
    delayedWorker: true
  });
  expect(fixture.requests).toHaveLength(1);
  await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
  expect(fixture.state.errors).toEqual([]);
});

test('обычный браузер сохраняет автоматическую регистрацию и не показывает подсказку iPhone', async ({
  page
}) => {
  const fixture = await prepare(page, { ios: false });
  expect(fixture.requests).toHaveLength(1);
  expect(fixture.requests[0].browser).toBe('chrome');
  await expect(page.getByTestId('IosPushNotificationPrompt')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.requests)
  ).toBe(1);
  expect(fixture.state.errors).toEqual([]);
});

test('после выхода восстановление сети не регистрирует push старого пользователя', async ({
  page
}) => {
  const fixture = await prepare(page, { permission: 'granted' });
  expect(fixture.requests).toHaveLength(1);
  await page.evaluate(async () => {
    await (window as any).pushModule.cleanupPushNotificationsOnLogout();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(fixture.requests).toHaveLength(1);
  expect(
    await page.evaluate(() => (window as any).webPushFixture.unsubscribes)
  ).toBe(1);
});
