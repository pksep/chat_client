import { expect, test, type Page } from '@playwright/test';

async function initializeChat(page: Page, native: boolean) {
  await page.addInitScript(native => {
    const calls = ((window as any).callDismissalFixture = {
      dismissals: [] as unknown[],
      cleanup: [] as string[]
    });
    if (!native) return;
    (window as any).androidBridge = {};
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'CallScreen',
          methods: [
            { name: 'dismissIncomingCall', rtype: 'promise' },
            { name: 'consumePendingCallAction', rtype: 'promise' },
            { name: 'addListener' },
            { name: 'removeListener', rtype: 'promise' }
          ]
        }
      ],
      async nativePromise(plugin: string, method: string, options: unknown) {
        if (plugin === 'CallScreen' && method === 'dismissIncomingCall')
          calls.dismissals.push(options);
        return {};
      },
      nativeCallback(_plugin: string, _method: string, options: any) {
        return options.eventName;
      }
    };
  }, native);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__call-dismissal')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      });
    if (url.pathname.startsWith('/call-dismissal-api/'))
      return route.fulfill({ json: [] });
    return route.fallback();
  });
  await page.goto('/__call-dismissal');
  await page.evaluate(async () => {
    const { setConfig } = await import('/src/services/useConfig.ts');
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/call-dismissal-api` });
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    await initializeChat({
      userId: 'answered-on-desktop-user',
      token: 'isolated-call-test',
      apiUrl: `${location.origin}/call-dismissal-api`,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    (window as any).callDismissalFixture.emit = (type: string) =>
      (getChatSDK() as any).ws.handleWebSocketEvent({
        type,
        payload: {
          userId: 'answered-on-desktop-user',
          roomId: 'answered-on-desktop',
          topicId: 'direct-call-topic'
        }
      });
  });
}

for (const event of ['callAnswered', 'dismissIncomingCall']) {
  test(`Android: ${event} убирает входящий звонок до загрузки модуля звонков`, async ({
    page
  }) => {
    test.setTimeout(90_000);
    await initializeChat(page, true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/src/services/useCalls.ts*', async route => {
      await gate;
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          export const dismissIncomingCall = (roomId) => window.callDismissalFixture.cleanup.push(roomId);
          export const handleCallAnswered = () => {};
        `
      });
    });
    try {
      await page.evaluate(event => {
        (window as any).callDismissalFixture.emit(event);
      }, event);
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).callDismissalFixture.dismissals)
        )
        .toEqual([{ roomId: 'answered-on-desktop' }]);
      expect(
        await page.evaluate(() => (window as any).callDismissalFixture.cleanup)
      ).toEqual([]);
    } finally {
      release();
    }
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).callDismissalFixture.cleanup)
      )
      .toEqual(['answered-on-desktop']);
  });
}

test('веб: отмена входящего звонка продолжает очищать состояние без нативного плагина', async ({
  page
}) => {
  test.setTimeout(90_000);
  await initializeChat(page, false);
  await page.route('**/src/services/useCalls.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export const dismissIncomingCall = (roomId) => window.callDismissalFixture.cleanup.push(roomId);
        export const handleCallAnswered = () => {};
      `
    })
  );
  for (const event of ['callAnswered', 'dismissIncomingCall']) {
    await page.evaluate(event => {
      (window as any).callDismissalFixture.emit(event);
    }, event);
  }
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callDismissalFixture.cleanup)
    )
    .toEqual(['answered-on-desktop', 'answered-on-desktop']);
  expect(
    await page.evaluate(() => (window as any).callDismissalFixture.dismissals)
  ).toEqual([]);
});
