import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const createWorker = (userAgent = '') => {
  const handlers = new Map<string, (event: any) => void>();
  const notifications: { title: string; options: any }[] = [];
  const clients: any[] = [];
  let sync: Promise<unknown> = Promise.resolve({ ok: true });
  const self = {
    addEventListener: (name: string, handler: (event: any) => void) =>
      handlers.set(name, handler),
    location: { origin: 'https://chat.example.test' },
    navigator: { userAgent },
    clients: {
      matchAll: async () => clients,
      claim: async () => {}
    },
    registration: {
      getNotifications: async () => [],
      showNotification: async (title: string, options: any) => {
        notifications.push({ title, options });
      }
    },
    chatBackgroundSync: { runChatBackgroundSync: () => sync }
  };
  runInNewContext(readFileSync('public/service-worker.js', 'utf8'), {
    self,
    clients: self.clients,
    URL,
    console: { warn() {} },
    importScripts() {}
  });
  const context = (id: string, focused = true, topicId = 'topic') =>
    handlers.get('message')!({
      source: { id },
      data: { type: 'APP_CONTEXT', focused, topicId }
    });
  const push = (data: any = {}) => {
    const pending: Promise<unknown>[] = [];
    handlers.get('push')!({
      data: {
        json: () => ({
          title: 'Сообщение',
          body: 'Текст',
          topicId: 'topic',
          ...data
        })
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise)
    });
    return { pending, visible: pending.at(-1)! };
  };
  return {
    notifications,
    clients,
    context,
    push,
    stallSync: () => {
      let release!: (value: unknown) => void;
      sync = new Promise(resolve => {
        release = resolve;
      });
      return () => release({ ok: true });
    }
  };
};

test('свёрнутая и закрытая PWA показывают push, даже если последний APP_CONTEXT был focused', async () => {
  for (const closed of [false, true]) {
    const worker = createWorker();
    worker.context('pwa');
    if (!closed)
      worker.clients.push({
        id: 'pwa',
        visibilityState: 'hidden',
        focused: false
      });
    await worker.push().visible;
    expect(worker.notifications).toHaveLength(1);
  }
});

test('проверяется контекст именно видимой вкладки, а не последней скрытой', async () => {
  const worker = createWorker();
  worker.context('visible');
  worker.context('hidden', false, 'other');
  worker.clients.push(
    { id: 'visible', visibilityState: 'visible', focused: true },
    { id: 'hidden', visibilityState: 'hidden', focused: false }
  );
  await worker.push().visible;
  expect(worker.notifications).toHaveLength(0);
  worker.context('visible', true, 'other');
  await worker.push().visible;
  expect(worker.notifications).toHaveLength(1);
});

test('показ push не ждёт зависшую фоновую синхронизацию', async () => {
  const worker = createWorker();
  const release = worker.stallSync();
  const push = worker.push({ action: 'CHAT_SYNC', messageId: 'message' });
  await push.visible;
  expect(worker.notifications).toHaveLength(1);
  expect(push.pending).toHaveLength(2);
  release();
  await Promise.all(push.pending);
});

test('Apple получает видимое уведомление даже в открытом чате, чтобы сохранить подписку', async () => {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
  ]) {
    const worker = createWorker(userAgent);
    worker.context('pwa');
    worker.clients.push({
      id: 'pwa',
      visibilityState: 'visible',
      focused: true
    });
    await worker.push().visible;
    expect(worker.notifications).toHaveLength(1);
  }
});
