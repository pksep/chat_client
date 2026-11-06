import { expect, test, type Page } from '@playwright/test';

const topicId = 'c8490ca4-47e9-4b24-a5ba-c2b0b4023bd7';
const messageId = 'e7a46d0d-6035-4826-a4bd-e54ca78922c2';
const payload = {
  topicId,
  messageId,
  action: 'CHAT_SYNC',
  title: 'Сообщение',
  body: 'Текст'
};

const workerScript = `
self.clients = { matchAll: async () => [], claim: async () => {} };
let shown = 0, retries = 0;
self.registration = {
  showNotification: async () => { shown++; self.postMessage({ notificationShown: true }); },
  getNotifications: async () => [],
  sync: { register: async () => { retries++; } }
};
importScripts('/service-worker.js');
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'push') {
      const pending = [];
      const event = new Event('push');
      event.data = { json: () => data.payload };
      event.waitUntil = promise => pending.push(promise);
      self.dispatchEvent(event);
      await Promise.all(pending);
    } else if (data.type === 'sync') {
      const pending = [];
      const event = new Event('sync');
      event.tag = 'chat-background-sync';
      event.waitUntil = promise => pending.push(promise);
      self.dispatchEvent(event);
      await Promise.all(pending);
    } else {
      await self.chatBackgroundSync.flushPushDeliveries();
    }
    self.postMessage({ shown, retries });
  } catch (error) { self.postMessage({ error: String(error) }); }
};`;

async function setSession(page: Page, userId = 'recipient') {
  await page.evaluate(async userId => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chat-web-background-sync-db', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('kv', { keyPath: 'key' });
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({
          key: 'session',
          value: {
            userId,
            token: 'limited-sync-token',
            apiUrl: `${location.origin}/delivery-api`
          }
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, userId);
}

async function startWorker(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.pushWorker?.terminate();
    w.pushWorker = new Worker('/__push-delivery-worker.js');
    w.notificationsShown = 0;
    w.runPushWorker = (data: unknown) =>
      new Promise(resolve => {
        w.pushWorker.onmessage = ({ data }: MessageEvent) => {
          if (data.notificationShown) w.notificationsShown++;
          else resolve(data);
        };
        w.pushWorker.postMessage(data);
      });
  });
}

async function prepare(page: Page) {
  const state = {
    status: 200,
    receipts: [] as { body: any; authorization: string | undefined }[]
  };
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__push-delivery')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html>'
      });
    if (url.pathname === '/__push-delivery-worker.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: workerScript
      });
    if (url.pathname === '/delivery-api/messages/delivery') {
      state.receipts.push({
        body: route.request().postDataJSON(),
        authorization: route.request().headers().authorization
      });
      return route.fulfill({
        status: state.status,
        json: { success: state.status === 200 }
      });
    }
    if (url.pathname.startsWith('/delivery-api/'))
      return route.fulfill({
        json: url.pathname.endsWith('/sync/pts') ? { events: [] } : []
      });
    return route.fallback();
  });
  await page.goto('/__push-delivery');
  await setSession(page);
  await startWorker(page);
  return state;
}

const push = (page: Page, data: object = payload) =>
  page.evaluate(
    data => (window as any).runPushWorker({ type: 'push', payload: data }),
    data
  );
const flush = (page: Page) =>
  page.evaluate(() => (window as any).runPushWorker({ type: 'flush' }));

test('Background Sync сообщает браузеру о сбое для следующей попытки', async ({
  page
}) => {
  const state = await prepare(page);
  state.status = 503;
  await push(page);
  const failed = await page.evaluate(() =>
    (window as any).runPushWorker({ type: 'sync' })
  );
  expect(failed.error).toContain('повторной попытки');
  state.status = 200;
  const recovered = await page.evaluate(() =>
    (window as any).runPushWorker({ type: 'sync' })
  );
  expect(recovered.error).toBeUndefined();
});

test('PWA подтверждает реальное получение push без открытого чата', async ({
  page
}) => {
  const state = await prepare(page);
  const result = await push(page);
  expect(result).toEqual({ shown: 1, retries: 0 });
  expect(state.receipts).toEqual([
    {
      body: { topicId, messageIds: [messageId] },
      authorization: 'Bearer limited-sync-token'
    }
  ]);
});

test('подтверждение сохраняется после сбоя сети и перезапуска service worker', async ({
  page
}) => {
  const state = await prepare(page);
  state.status = 503;
  const failed = await push(page);
  expect(failed.shown).toBe(1);
  expect(failed.retries).toBeGreaterThan(0);
  state.status = 200;
  state.receipts.length = 0;
  await startWorker(page);
  await flush(page);
  expect(state.receipts.map(receipt => receipt.body)).toEqual([
    { topicId, messageIds: [messageId] }
  ]);
  await flush(page);
  expect(state.receipts).toHaveLength(1);
});

test('после смены аккаунта очередь не подтверждает доставку от нового пользователя', async ({
  page
}) => {
  const state = await prepare(page);
  state.status = 503;
  await push(page);
  state.receipts.length = 0;
  state.status = 200;
  await setSession(page, 'another-user');
  await startWorker(page);
  await flush(page);
  expect(state.receipts).toHaveLength(0);
});

test('истёкший sync-токен сохраняет подтверждение до обновления сессии', async ({
  page
}) => {
  const state = await prepare(page);
  state.status = 401;
  await push(page);
  state.status = 200;
  state.receipts.length = 0;
  await setSession(page);
  await startWorker(page);
  await flush(page);
  expect(state.receipts.map(receipt => receipt.body)).toEqual([
    { topicId, messageIds: [messageId] }
  ]);
});

test('уведомление показывается, пока подтверждение доставки ожидает сеть', async ({
  page
}) => {
  await prepare(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/delivery-api/messages/delivery', async route => {
    await gate;
    return route.fallback();
  });
  const result = push(page);
  try {
    await expect
      .poll(() => page.evaluate(() => (window as any).notificationsShown))
      .toBe(1);
  } finally {
    release();
  }
  expect((await result).shown).toBe(1);
});

test('звонок, очистка уведомлений и ID провайдера не подтверждают сообщение', async ({
  page
}) => {
  const state = await prepare(page);
  await push(page, { ...payload, type: 'incoming_call', roomId: topicId });
  await push(page, { ...payload, action: 'CLEAR_CHAT_NOTIFICATIONS' });
  await push(page, {
    ...payload,
    action: 'DISMISS_INCOMING_CALL',
    roomId: topicId
  });
  await push(page, { ...payload, messageId: 'firebase-provider-id' });
  expect(state.receipts).toHaveLength(0);
});
