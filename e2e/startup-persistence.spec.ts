import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

test('сообщения после ухода в фон сохраняются без ожидания первого кадра', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const { messages } = (window as any).topicPerformance;
      (window as any).releaseMessagePersistence =
        messages.deferMessagePersistsUntil(new Promise(() => {}));
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user'
      );
      await new Promise(resolve => setTimeout(resolve, 200));
      // Событие ухода уже прошло: новая запись должна сохраниться сама.
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden'
      });
      const put = IDBObjectStore.prototype.put;
      (window as any).snapshotWrites = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'topicSnapshots') (window as any).snapshotWrites++;
        return put.apply(this, args);
      };
      const history = messages.getFullMessagesByTopicId('performance-1');
      messages.saveMessagesToLocal(
        'performance-1',
        [
          ...history,
          {
            ...history.at(-1),
            id: 'background-message',
            createdAt: new Date(Date.UTC(2026, 8, 2))
          }
        ],
        { syncLastMessage: false }
      );
    },
    makeMessages('performance-1', 100)
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const shadow = await import('/src/services/useShadowChatSync.ts');
        return (
          await shadow.loadShadowTopicSnapshot(
            'performance-1',
            'performance-user'
          )
        ).length;
      })
    )
    .toBe(101);
  expect(
    await page.evaluate(async () => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      Reflect.deleteProperty(document, 'visibilityState');
      (window as any).releaseMessagePersistence();
      await new Promise(resolve => setTimeout(resolve, 250));
      return {
        writes: (window as any).snapshotWrites,
        legacy: (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length
      };
    })
  ).toEqual({ writes: 1, legacy: 0 });
});

test('5000 сообщений появляются до переноса кеша; 60 изменений объединяются в одну запись', async ({
  page
}) => {
  await openFixture(page);
  const before = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const { messages } = (window as any).topicPerformance;
      messages.deferMessagePersistsUntil(
        new Promise<void>(resolve => {
          (window as any).releaseMessagePersistence = resolve;
        })
      );
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      const put = IDBObjectStore.prototype.put;
      (window as any).snapshotWrites = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'topicSnapshots') (window as any).snapshotWrites++;
        return put.apply(this, args);
      };
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user',
        { visibleLimit: 48 }
      );
      for (let i = 1; i <= 60; i++) {
        const current = messages.getFullMessagesByTopicId('performance-1');
        messages.saveMessagesToLocal(
          'performance-1',
          [
            ...current.slice(0, -1),
            {
              ...current.at(-1),
              text: `Правка ${i}`,
              updatedAt: new Date(Date.UTC(2026, 8, 2, 0, 0, i))
            }
          ],
          { syncLastMessage: false, visibleLimit: 48 }
        );
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      return {
        writes: (window as any).snapshotWrites,
        full: messages.getFullMessagesByTopicId('performance-1').length,
        visible: messages.getMessagesByTopicId('performance-1').length,
        legacy: (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length
      };
    },
    makeMessages('performance-1', 5000)
  );
  expect(before).toEqual({ writes: 0, full: 5000, visible: 48, legacy: 5000 });
  await page.evaluate(() => (window as any).releaseMessagePersistence());
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await import('/src/services/useTopicMessagesCache.ts');
        return (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length;
      })
    )
    .toBe(0);
  const after = await page.evaluate(async () => {
    const shadow = await import('/src/services/useShadowChatSync.ts');
    const rows = await shadow.loadShadowTopicSnapshot(
      'performance-1',
      'performance-user'
    );
    return {
      writes: (window as any).snapshotWrites,
      count: rows.length,
      last: rows.at(-1)?.text
    };
  });
  expect(after).toEqual({ writes: 1, count: 5000, last: 'Правка 60' });
});

test('отмена транзакции после успешного put сохраняет старый кеш после перезагрузки', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const { messages } = (window as any).topicPerformance;
      messages.deferMessagePersistsUntil(new Promise(() => {}));
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      const put = IDBObjectStore.prototype.put;
      let requestSucceeded = false;
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (this.name === 'topicSnapshots') {
          request.addEventListener('success', () => {
            requestSucceeded = true;
            this.transaction.abort();
          });
        }
        return request;
      };
      try {
        await messages.hydrateMessagesFromCache(
          'performance-1',
          'performance-user'
        );
        await messages.flushPendingMessagePersists();
        const successful = await shadow.saveShadowTopicSnapshot(
          'performance-2',
          rows,
          'local',
          'performance-user',
          { replace: true }
        );
        return {
          requestSucceeded,
          successful,
          legacy: (
            await cache.loadCachedTopicMessages(
              'performance-1',
              'performance-user'
            )
          ).length,
          shadow: (
            await shadow.loadShadowTopicSnapshot(
              'performance-1',
              'performance-user'
            )
          ).length
        };
      } finally {
        IDBObjectStore.prototype.put = put;
      }
    },
    makeMessages('performance-1', 100)
  );
  expect(result).toEqual({
    requestSucceeded: true,
    successful: false,
    legacy: 100,
    shadow: 0
  });
  await page.reload();
  expect(
    await page.evaluate(async () => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      return (
        await cache.loadCachedTopicMessages('performance-1', 'performance-user')
      ).length;
    })
  ).toBe(100);
});

test('отключённый shadow-кеш не удаляет сохранённую историю', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const { messages } = (window as any).topicPerformance;
      localStorage.setItem('chat.shadowSync.enabled', 'false');
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user'
      );
      await messages.flushPendingMessagePersists();
      return {
        visible: messages.getMessagesByTopicId('performance-1').length,
        legacy: (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length
      };
    },
    makeMessages('performance-1', 50)
  );
  expect(result).toEqual({ visible: 50, legacy: 50 });
});

test('pagehide сохраняет новые данные даже до первого кадра и не запускает вторую запись после него', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const { messages } = (window as any).topicPerformance;
      messages.deferMessagePersistsUntil(
        new Promise<void>(resolve => {
          (window as any).releaseMessagePersistence = resolve;
        })
      );
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user'
      );
      const history = messages.getFullMessagesByTopicId('performance-1');
      messages.saveMessagesToLocal(
        'performance-1',
        [
          ...history,
          {
            ...history.at(-1),
            id: 'new-message',
            createdAt: new Date(Date.UTC(2026, 8, 2)),
            text: 'Перед уходом в фон'
          }
        ],
        { syncLastMessage: false }
      );
      const put = IDBObjectStore.prototype.put;
      (window as any).snapshotWrites = 0;
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === 'topicSnapshots') (window as any).snapshotWrites++;
        return put.apply(this, args);
      };
      await new Promise(resolve => setTimeout(resolve, 200));
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    },
    makeMessages('performance-1', 100)
  );
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await import('/src/services/useTopicMessagesCache.ts');
        return (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length;
      })
    )
    .toBe(0);
  await page.evaluate(async () => {
    (window as any).releaseMessagePersistence();
    await new Promise(resolve => setTimeout(resolve, 250));
  });
  expect(
    await page.evaluate(async () => {
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const rows = await shadow.loadShadowTopicSnapshot(
        'performance-1',
        'performance-user'
      );
      return {
        count: rows.length,
        last: rows.at(-1)?.id,
        writes: (window as any).snapshotWrites
      };
    })
  ).toEqual({ count: 101, last: 'new-message', writes: 1 });
});

test('очистка истории до первого кадра не восстанавливает старые сообщения отложенной записью', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const { messages } = (window as any).topicPerformance;
      let release!: () => void;
      messages.deferMessagePersistsUntil(
        new Promise<void>(resolve => {
          release = resolve;
        })
      );
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user'
      );
      messages.clearMessagesForTopic('performance-1', {
        syncLastMessage: false
      });
      release();
      await messages.flushPendingMessagePersists();
      return {
        memory: messages.getFullMessagesByTopicId('performance-1').length,
        legacy: (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length,
        shadow: (
          await shadow.loadShadowTopicSnapshot(
            'performance-1',
            'performance-user'
          )
        ).length
      };
    },
    makeMessages('performance-1', 100)
  );
  expect(result).toEqual({ memory: 0, legacy: 0, shadow: 0 });
});

test('отложенная запись использует пользователя, для которого была поставлена в очередь', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const authUrl = performance
        .getEntriesByType('resource')
        .find(
          row => new URL(row.name).pathname === '/src/composables/useAuth.ts'
        )!.name;
      const { authedUser } = await import(authUrl);
      const { messages } = (window as any).topicPerformance;
      messages.deferMessagePersistsUntil(new Promise(() => {}));
      await cache.saveCachedTopicMessages(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user'
      );
      authedUser.value = { ...authedUser.value, id: 'another-user' };
      await messages.flushPendingMessagePersists();
      return {
        own: (
          await shadow.loadShadowTopicSnapshot(
            'performance-1',
            'performance-user'
          )
        ).length,
        foreign: (
          await shadow.loadShadowTopicSnapshot('performance-1', 'another-user')
        ).length,
        legacy: (
          await cache.loadCachedTopicMessages(
            'performance-1',
            'performance-user'
          )
        ).length
      };
    },
    makeMessages('performance-1', 100)
  );
  expect(result).toEqual({ own: 100, foreign: 0, legacy: 0 });
});
