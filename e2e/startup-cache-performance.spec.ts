import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

test('60 одновременных восстановлений длинной истории читают IndexedDB один раз', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const { saveCachedTopicMessages } = await import(
        '/src/services/useTopicMessagesCache.ts'
      );
      const { messages } = (window as any).topicPerformance;
      await saveCachedTopicMessages('performance-1', rows, 'performance-user');
      const originalGet = IDBObjectStore.prototype.get;
      let reads = 0;
      IDBObjectStore.prototype.get = function (...args) {
        if (this.name === 'topicMessages') reads++;
        return originalGet.apply(this, args);
      };
      try {
        await Promise.all(
          Array.from({ length: 60 }, (_, index) =>
            messages.hydrateMessagesFromCache(
              'performance-1',
              'performance-user',
              { visibleLimit: index % 2 ? 72 : 48 }
            )
          )
        );
        const history = messages.getFullMessagesByTopicId('performance-1');
        return {
          reads,
          total: history.length,
          unique: new Set(history.map(row => row.id)).size,
          last: history.at(-1)?.id,
          visible: messages.getMessagesByTopicId('performance-1').length
        };
      } finally {
        IDBObjectStore.prototype.get = originalGet;
      }
    },
    makeMessages('performance-1', 5000)
  );
  expect(result).toEqual({
    reads: 1,
    total: 5000,
    unique: 5000,
    last: 'performance-1-message-4999',
    visible: 72
  });
  expect(errors).toEqual([]);
});

test('восстановление сессии во время загрузки 5000 сообщений не читает историю повторно', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const { saveCachedTopicMessages } = await import(
        '/src/services/useTopicMessagesCache.ts'
      );
      const authUrl = performance
        .getEntriesByType('resource')
        .find(
          row => new URL(row.name).pathname === '/src/composables/useAuth.ts'
        )!.name;
      const { authedUser, saveChatAuthSession } = await import(authUrl);
      const user = authedUser.value!;
      saveChatAuthSession({ token: 'performance-test', user });
      await saveCachedTopicMessages('performance-1', rows, user.id);
      const { messages } = (window as any).topicPerformance;
      const originalGet = IDBObjectStore.prototype.get;
      let reads = 0;
      IDBObjectStore.prototype.get = function (...args) {
        if (this.name === 'topicMessages') reads++;
        return originalGet.apply(this, args);
      };
      try {
        authedUser.value = null;
        const earlyHydration = messages.hydrateMessagesFromCache(
          'performance-1',
          undefined,
          { visibleLimit: 48 }
        );
        authedUser.value = user;
        await Promise.all([
          earlyHydration,
          messages.hydrateMessagesFromCache('performance-1', user.id, {
            visibleLimit: 72
          })
        ]);
        const history = messages.getFullMessagesByTopicId('performance-1');
        return {
          reads,
          total: history.length,
          unique: new Set(history.map(row => row.id)).size,
          visible: messages.getMessagesByTopicId('performance-1').length
        };
      } finally {
        IDBObjectStore.prototype.get = originalGet;
      }
    },
    makeMessages('performance-1', 5000)
  );
  expect(result).toEqual({ reads: 1, total: 5000, unique: 5000, visible: 72 });
  expect(errors).toEqual([]);
});
