import { expect, test, type Page } from '@playwright/test';

test.setTimeout(30000);

async function backgroundSync(page: Page) {
  const state = { status: 503, requests: 0 };
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__network-background') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div></div>'
      });
    }
    if (url.pathname.startsWith('/network-api/')) {
      state.requests++;
      return route.fulfill({
        status: state.status,
        json: url.pathname.endsWith('/sync/pts')
          ? { lastPts: '20', events: [] }
          : url.pathname.includes('/messages/topic/')
            ? [{ id: 'message-1' }]
            : []
      });
    }
    return route.fallback();
  });
  await page.goto('/__network-background');
  await page.addScriptTag({ url: '/chat-background-sync-sw.js' });
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chat-web-background-sync-db', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('kv', { keyPath: 'key' });
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('kv', 'readwrite');
        transaction.objectStore('kv').put({
          key: 'session',
          value: {
            token: 'limited-test-token',
            userId: 'network-user',
            apiUrl: `${location.origin}/network-api`
          }
        });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  return state;
}

test('ошибка фоновой синхронизации не создаёт бесконечный цикл запросов', async ({
  page
}) => {
  const state = await backgroundSync(page);
  await page.evaluate(() => {
    (window as any).syncResult = null;
    void (window as any).chatBackgroundSync
      .runChatBackgroundSync({ topicId: 'topic-1', reason: 'network-test' })
      .then((result: any) => {
        (window as any).syncResult = result;
      });
  });
  await expect
    .poll(
      async () => ({
        requests: state.requests,
        ok: await page.evaluate(() => (window as any).syncResult?.ok)
      }),
      { timeout: 2000 }
    )
    .toEqual({ requests: 1, ok: false });
  expect(state.requests).toBe(1);
  state.status = 200;
  const result = await page.evaluate(() =>
    (window as any).chatBackgroundSync.runChatBackgroundSync({
      reason: 'retry-after-recovery'
    })
  );
  expect(result.ok).toBe(true);
  expect(result.snapshot.lastPts).toBe('20');
  expect(Object.keys(result.snapshot.messagesByTopic)).toEqual(['topic-1']);
});

test('параллельные сигналы синхронизации сохраняют все чаты и последнюю позицию', async ({
  page
}) => {
  await backgroundSync(page);
  const hints = await page.evaluate(async () => {
    const sync = (window as any).chatBackgroundSync;
    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        sync.appendPendingHint({
          topicId: `topic-${index}`,
          pts: String(index + 1)
        })
      )
    );
    return sync.consumePendingHints();
  });
  expect(hints.topicIds.sort()).toEqual(
    Array.from({ length: 30 }, (_, index) => `topic-${index}`).sort()
  );
  expect(hints.pts).toBe('30');
});

test('ошибка запроса не стирает новые задания, добавленные во время ожидания', async ({
  page
}) => {
  const state = await backgroundSync(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let started = false;
  await page.route('**/network-api/sync/pts*', async route => {
    if (!started) {
      started = true;
      await gate;
    }
    return route.fallback();
  });
  try {
    await page.evaluate(() => {
      (window as any).syncResult = null;
      void (window as any).chatBackgroundSync
        .runChatBackgroundSync({ topicId: 'topic-1' })
        .then((result: any) => {
          (window as any).syncResult = result;
        });
    });
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() =>
      (window as any).chatBackgroundSync.appendPendingHint({
        topicId: 'topic-2',
        pts: '50'
      })
    );
    release();
    await expect
      .poll(() => page.evaluate(() => (window as any).syncResult?.retryable))
      .toBe(true);
    state.status = 200;
    const result = await page.evaluate(() =>
      (window as any).chatBackgroundSync.runChatBackgroundSync({
        reason: 'network-restored'
      })
    );
    expect(result.ok).toBe(true);
    expect(result.snapshot.lastPts).toBe('50');
    expect(Object.keys(result.snapshot.messagesByTopic).sort()).toEqual([
      'topic-1',
      'topic-2'
    ]);
  } finally {
    release();
  }
});

test('зависший ответ синхронизации завершается и не блокирует восстановление', async ({
  page
}) => {
  const state = await backgroundSync(page);
  state.status = 200;
  await page.clock.install();
  await page.evaluate(() => {
    const fetchBefore = window.fetch.bind(window);
    (window as any).restoreFetch = () => {
      window.fetch = fetchBefore;
    };
    (window as any).stalledFetchStarted = false;
    window.fetch = async (...args) => {
      if (!String(args[0]).includes('/network-api/'))
        return fetchBefore(...args);
      (window as any).stalledFetchStarted = true;
      return new Response(new ReadableStream({ start() {} }));
    };
    (window as any).syncResult = null;
    void (window as any).chatBackgroundSync
      .runChatBackgroundSync({ topicId: 'topic-1' })
      .then((result: any) => {
        (window as any).syncResult = result;
      });
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).stalledFetchStarted))
    .toBe(true);
  await page.clock.runFor(10100);
  await expect
    .poll(() => page.evaluate(() => (window as any).syncResult?.retryable))
    .toBe(true);
  await page.evaluate(() => (window as any).restoreFetch());
  const result = await page.evaluate(() =>
    (window as any).chatBackgroundSync.runChatBackgroundSync({
      reason: 'network-restored'
    })
  );
  expect(result.ok).toBe(true);
  expect(Object.keys(result.snapshot.messagesByTopic)).toEqual(['topic-1']);
});

test('зависший Android HTTP-мост ограничен общим временем ожидания', async ({
  page
}) => {
  await backgroundSync(page);
  await page.clock.install();
  await page.evaluate(async () => {
    (window as any).CapacitorCustomPlatform = { name: 'android' };
    (window as any).nativeCalls = 0;
    (window as any).nativeReady = false;
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'CapacitorHttp',
          methods: [{ name: 'request', rtype: 'promise' }]
        }
      ],
      nativePromise: () => {
        (window as any).nativeCalls++;
        return (window as any).nativeReady
          ? Promise.resolve({ status: 200, data: { token: 'recovered' } })
          : new Promise(() => {});
      }
    };
    const path = '/src/utils/auth-http.ts';
    const auth = await import(/* @vite-ignore */ path);
    (window as any).fetchNativeAuth = auth.fetchAuthWithCookies;
    void auth
      .fetchAuthWithCookies('https://chat.test/auth/refresh', 'POST')
      .catch((error: Error) => {
        (window as any).nativeError = error.name;
      });
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeCalls))
    .toBe(1);
  await page.clock.runFor(4100);
  expect(await page.evaluate(() => (window as any).nativeError)).toBe(
    'TimeoutError'
  );
  const body = await page.evaluate(async () => {
    (window as any).nativeReady = true;
    const response = await (window as any).fetchNativeAuth(
      'https://chat.test/auth/refresh',
      'POST'
    );
    return response.json();
  });
  expect(body).toEqual({ token: 'recovered' });
});

for (const provider of ['worker', 'direct']) {
  test(`ошибка истории сообщений не отмечается как успешная синхронизация (${provider})`, async ({
    page
  }) => {
    const state = await backgroundSync(page);
    state.status = 200;
    let messageStatus = 503;
    await page.route('**/network-api/messages/topic/**', route =>
      route.fulfill({ status: messageStatus, json: [{ id: 'message-1' }] })
    );
    const run = () =>
      page.evaluate(async provider => {
        if (provider === 'worker')
          return (window as any).chatBackgroundSync.runChatBackgroundSync({
            topicId: 'topic-1'
          });
        const path = '/src/services/useWebChatBackgroundSync.ts';
        const sync = await import(/* @vite-ignore */ path);
        await sync.requestWebChatBackgroundSync({
          topicId: 'topic-1',
          reason: 'network-test'
        });
        const snapshot = await sync.getWebChatBackgroundSyncSnapshot();
        return { ok: snapshot.status?.state === 'completed', snapshot };
      }, provider);
    expect((await run()).ok).toBe(false);
    expect(
      await page.evaluate(() => (window as any).chatBackgroundSync.getLastPts())
    ).toBe('');
    messageStatus = 200;
    const recovered = await run();
    expect(recovered.ok).toBe(true);
    expect(recovered.snapshot.lastPts).toBe('20');
    expect(Object.keys(recovered.snapshot.messagesByTopic)).toEqual([
      'topic-1'
    ]);
  });
}

for (const nextAction of ['logout', 'new-session']) {
  test(`запоздавший токен синхронизации не восстанавливает прежнюю сессию (${nextAction})`, async ({
    page
  }) => {
    await backgroundSync(page);
    let releaseOldRequest!: () => void;
    const oldRequestGate = new Promise<void>(resolve => {
      releaseOldRequest = resolve;
    });
    let oldRequestStarted = false;
    await page.route('**/network-api/sync/token', async route => {
      const isOld =
        route.request().headers().authorization === 'Bearer old-access';
      if (isOld) {
        oldRequestStarted = true;
        await oldRequestGate;
      }
      await route.fulfill({
        json: { syncToken: isOld ? 'old-sync' : 'new-sync' }
      });
    });
    try {
      await page.evaluate(async () => {
        const path = '/src/services/useWebChatBackgroundSync.ts';
        const sync = await import(/* @vite-ignore */ path);
        (window as any).webSync = sync;
        await sync.clearWebChatBackgroundSyncSession();
        (window as any).oldSessionSave = sync.saveWebChatBackgroundSyncSession({
          token: 'old-access',
          userId: 'old-user',
          apiUrl: `${location.origin}/network-api`
        });
      });
      await expect.poll(() => oldRequestStarted).toBe(true);
      await page.evaluate(async nextAction => {
        const sync = (window as any).webSync;
        if (nextAction === 'logout') {
          await sync.clearWebChatBackgroundSyncSession();
        } else {
          await sync.saveWebChatBackgroundSyncSession({
            token: 'new-access',
            userId: 'new-user',
            apiUrl: `${location.origin}/network-api`
          });
        }
      }, nextAction);
      releaseOldRequest();
      await page.evaluate(() => (window as any).oldSessionSave);
      const session = await page.evaluate(() =>
        (window as any).chatBackgroundSync.getSession()
      );
      if (nextAction === 'logout') expect(session).toBeNull();
      else
        expect(session).toMatchObject({
          userId: 'new-user',
          token: 'new-sync'
        });
    } finally {
      releaseOldRequest();
    }
  });
}
