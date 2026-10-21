import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;

test.beforeAll(async () => {
  fixture = await createAndroidPerformanceServer({
    port: 5194,
    topicCount: 4,
    messagesPerTopic: 20,
    userCount: 40
  });
  const topic = fixture.topics[1];
  const messages = fixture.histories.get(topic.id)!;
  const sender = {
    ...fixture.users[1],
    initials: 'Кэш Автор',
    avatarUrl: '/cached-message-avatar.svg'
  };
  for (const message of messages) message.senderUser = sender;
  messages.at(-1)!.reactions = [
    {
      id: '29430000-0000-4000-8000-000000000001',
      text: '👍',
      senderUserId: fixture.user.id,
      messageId: messages.at(-1)!.id,
      createdAt: messages.at(-1)!.createdAt,
      updatedAt: messages.at(-1)!.updatedAt,
      deletedAt: null
    }
  ];
  const {
    senderUser: _senderUser,
    reactions: _reactions,
    ...lastMessage
  } = messages.at(-1)!;
  Object.assign(topic, {
    type: 'GROUP',
    name: 'Группа быстрого кеша',
    members: [fixture.user, sender],
    user: undefined,
    group: {
      id: '29440000-0000-4000-8000-000000000001',
      topicId: topic.id,
      title: 'Группа быстрого кеша',
      description: '',
      avatarUrl: '',
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      deletedAt: null
    },
    lastMessage
  });
});

test.afterAll(async () => {
  await fixture.close();
});

test('видимая группа прогревает только IndexedDB и открывается полным первым кадром', async ({
  page
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  const getTopicHistoryRequests = () =>
    requests.filter(
      url =>
        new URL(url).pathname === `/api/messages/topic/${fixture.topics[1].id}`
    );
  const getAvatarRequests = () =>
    requests.filter(
      url => new URL(url).pathname === '/cached-message-avatar.svg'
    );
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/__cache-seed') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">'
      });
    }
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto('/__cache-seed');
  await page.evaluate(
    async ({ origin, config, user, topics, topicId, messages }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'chat-294-local-fixture', user })
      );
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([{ url: origin, config }])
      );
      localStorage.setItem('chat_runtime_last_organization', origin);
      localStorage.setItem(
        `chat-offline-fast-topics-v1:${user.id}`,
        JSON.stringify(topics)
      );
      localStorage.setItem(
        'chat.indexeddb.reset.done',
        'chat-client-indexeddb-reset-2026-04-29-v1'
      );
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('chat-sync-shadow-db', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const [name, keyPath] of [
            ['eventLog', 'id'],
            ['topicSnapshots', 'cacheKey'],
            ['readStates', 'cacheKey'],
            ['syncMeta', 'key']
          ]) {
            if (!db.objectStoreNames.contains(name))
              db.createObjectStore(name, { keyPath });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('topicSnapshots', 'readwrite');
          transaction.objectStore('topicSnapshots').put({
            cacheKey: `${user.id}:${topicId}`,
            userId: user.id,
            topicId,
            messages,
            updatedAt: new Date().toISOString(),
            source: 'local'
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('chat-media-blob-cache-db', 2);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('mediaBlobs')) {
            const store = db.createObjectStore('mediaBlobs', {
              keyPath: 'key'
            });
            store.createIndex('accessedAt', 'accessedAt', { unique: false });
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('mediaBlobs', 'readwrite');
          const now = new Date().toISOString();
          const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>';
          transaction.objectStore('mediaBlobs').put({
            key: '/cached-message-avatar.svg',
            path: '/cached-message-avatar.svg',
            blob: new Blob([svg], { type: 'image/svg+xml' }),
            mimeType: 'image/svg+xml',
            size: svg.length,
            createdAt: now,
            accessedAt: now
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      topics: fixture.topics,
      topicId: fixture.topics[1].id,
      messages: fixture.histories.get(fixture.topics[1].id)!
    }
  );

  await page.goto('/');
  const topic = page
    .locator('.contact-list__item:visible')
    .filter({ hasText: 'Группа быстрого кеша' })
    .first();
  await expect(topic).toBeVisible({ timeout: 30_000 });
  expect(getTopicHistoryRequests()).toEqual([]);
  expect(getAvatarRequests()).toEqual([]);

  const frame = await page.evaluate(
    async ({ topicId, lastMessageId }) => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>('.contact-list__item')
      ).find(item => {
        const rect = item.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          item.textContent?.includes('Группа быстрого кеша')
        );
      })!;
      return new Promise<{
        ids: string[];
        reaction: boolean;
        avatar: boolean;
        avatarFallback: boolean;
      }>(resolve => {
        element.addEventListener(
          'click',
          () => {
            const captureFirstTopicFrame = () => {
              if (!location.pathname.endsWith(topicId)) {
                requestAnimationFrame(captureFirstTopicFrame);
                return;
              }
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const avatarImage = document.querySelector<HTMLImageElement>(
                    '.message-group__avatar img[src^="blob:"]'
                  );
                  const avatarFallback = document.querySelector<HTMLElement>(
                    '.message-group__avatar .avatar-yui-kit__fallback'
                  );
                  resolve({
                    ids: Array.from(
                      document.querySelectorAll<HTMLElement>(
                        '[data-message-id]'
                      )
                    )
                      .map(item => item.dataset.messageId || '')
                      .filter(Boolean),
                    reaction: Boolean(
                      document.querySelector(
                        `[data-message-id="${lastMessageId}"] .message-reactions-row`
                      )
                    ),
                    avatar: Boolean(
                      avatarImage?.complete &&
                        avatarImage.naturalWidth > 0 &&
                        getComputedStyle(avatarImage).opacity === '1'
                    ),
                    avatarFallback: Boolean(
                      avatarFallback &&
                        getComputedStyle(avatarFallback).display !== 'none'
                    )
                  });
                })
              );
            };
            requestAnimationFrame(captureFirstTopicFrame);
          },
          { capture: true, once: true }
        );
        element.click();
      });
    },
    {
      topicId: fixture.topics[1].id,
      lastMessageId: fixture.histories.get(fixture.topics[1].id)!.at(-1)!.id
    }
  );
  expect(frame.ids).toHaveLength(20);
  expect(frame.ids.every(id => id.startsWith('29410000'))).toBe(true);
  expect(frame.reaction).toBe(true);
  expect(frame.avatar).toBe(true);
  expect(frame.avatarFallback).toBe(false);
  expect(getAvatarRequests()).toEqual([]);
  await page.waitForTimeout(600);
  const stableAvatar = page
    .locator('.message-group__avatar.cached-avatar:visible')
    .first();
  await expect(stableAvatar).toHaveClass(/cached-avatar--image-ready/);
  await expect(stableAvatar.locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(stableAvatar.locator('.avatar-yui-kit__fallback')).toBeHidden();
  await expect(
    page.locator(
      `[data-message-id="${fixture.histories.get(fixture.topics[1].id)!.at(-1)!.id}"] .message-reactions-row`
    )
  ).toBeVisible();
  await expect.poll(() => getTopicHistoryRequests().length).toBe(1);
  expect(errors).toEqual([]);
});
