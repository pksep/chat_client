import { expect, test, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

async function attachMetric(info: TestInfo, name: string, result: unknown) {
  const path = info.outputPath(name);
  await writeFile(path, JSON.stringify(result, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}

test('фоновый прогрев читает компактное окно без полной истории топика', async ({
  page
}, testInfo) => {
  await openFixture(page);
  await page.evaluate(
    async rows => {
      const shadow = await import('/src/services/useShadowChatSync.ts');
      await shadow.saveShadowTopicSnapshot(
        'performance-1',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
    },
    makeMessages('performance-1', 5000)
  );
  await page.reload();
  const result = await page.evaluate(async () => {
    const fixture = await import('/e2e/fixtures/topic-performance-harness.ts');
    const { messages } = await fixture.initializeTopicPerformanceFixture();
    const reads: Record<string, number> = {};
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      reads[this.name] = (reads[this.name] || 0) + 1;
      return get.apply(this, args);
    };
    try {
      const startedAt = performance.now();
      const preview = await messages.hydrateMessagePreviewFromCache(
        'performance-1',
        'performance-user',
        48
      );
      return {
        reads,
        elapsedMs: performance.now() - startedAt,
        previewCount: preview.length,
        fullCount: messages.getFullMessagesByTopicId('performance-1').length,
        visibleCount: messages.getMessagesByTopicId('performance-1').length,
        first: preview[0]?.id,
        last: preview.at(-1)?.id
      };
    } finally {
      IDBObjectStore.prototype.get = get;
    }
  });
  await attachMetric(testInfo, 'topic-preview-read.json', result);
  expect(result.reads.topicPreviews).toBe(1);
  expect(result.reads.topicSnapshots).toBeUndefined();
  expect(result).toMatchObject({
    previewCount: 48,
    fullCount: 48,
    visibleCount: 48,
    first: 'performance-1-message-4952',
    last: 'performance-1-message-4999'
  });
});

test('холодный shadow-кеш: 60 восстановлений, одно чтение прочтений и параллельные метаданные', async ({
  page
}, testInfo) => {
  await openFixture(page);
  await page.evaluate(
    async rows => {
      const shadow = await import('/src/services/useShadowChatSync.ts');
      await shadow.saveShadowTopicSnapshot(
        'performance-1',
        rows.map(row => ({
          ...row,
          isReadByMe: false,
          isRead: false,
          status: 'DELIVERED'
        })),
        'local',
        'performance-user'
      );
      await shadow.saveShadowReadState(
        'performance-1',
        rows[2499].id,
        rows[2499].createdAt,
        'local',
        'performance-user'
      );
    },
    makeMessages('performance-1', 5000)
  );
  await page.reload();
  const result = await page.evaluate(async () => {
    const fixture = await import('/e2e/fixtures/topic-performance-harness.ts');
    const { messages } = await fixture.initializeTopicPerformanceFixture();
    const reads: Record<string, number> = {};
    let pendingFinished = false;
    let readStatesStartedWithPending = false;
    const get = IDBObjectStore.prototype.get;
    const getAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.get = function (...args) {
      reads[this.name] = (reads[this.name] || 0) + 1;
      if (this.name === 'readStates')
        readStatesStartedWithPending = !pendingFinished;
      return get.apply(this, args);
    };
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = getAll.apply(this, args);
      if (this.name === 'pendingUploadMeta') {
        reads[this.name] = (reads[this.name] || 0) + 1;
        Object.defineProperty(request, 'onsuccess', {
          set(handler) {
            request.addEventListener('success', event =>
              setTimeout(() => {
                pendingFinished = true;
                handler.call(request, event);
              }, 120)
            );
          }
        });
      }
      return request;
    };
    try {
      const start = performance.now();
      await Promise.all(
        Array.from({ length: 60 }, () =>
          messages.hydrateMessagesFromCache(
            'performance-1',
            'performance-user',
            { visibleLimit: 72 }
          )
        )
      );
      const rows = messages.getFullMessagesByTopicId('performance-1');
      return {
        reads,
        readStatesStartedWithPending,
        elapsedMs: performance.now() - start,
        total: rows.length,
        readCount: rows.filter(row => row.isReadByMe).length,
        visible: messages.getMessagesByTopicId('performance-1').length,
        last: rows.at(-1)?.id
      };
    } finally {
      IDBObjectStore.prototype.get = get;
      IDBObjectStore.prototype.getAll = getAll;
    }
  });
  await attachMetric(testInfo, 'cache-reads.json', result);
  expect(result.reads.readStates).toBe(1);
  expect(result.reads.topicSnapshots).toBe(1);
  expect(result.reads.pendingUploadMeta).toBe(1);
  expect(result.readStatesStartedWithPending).toBe(true);
  expect(result).toMatchObject({
    total: 5000,
    readCount: 2500,
    visible: 72,
    last: 'performance-1-message-4999'
  });
});

test('5000 чужих незавершённых вложений не читаются при открытии топика', async ({
  page
}, testInfo) => {
  await openFixture(page);
  const result = await page.evaluate(async row => {
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    await cache.savePendingUploadMeta({
      topicId: 'performance-1',
      messageId: 'first',
      message: row,
      userId: 'performance-user',
      forwardMessageIds: []
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chat-topic-messages-db');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pendingUploadMeta', 'readwrite');
      const store = tx.objectStore('pendingUploadMeta');
      for (let index = 0; index < 5000; index++) {
        const userId = index % 2 ? 'another-user' : 'performance-user';
        const topicId = index % 2 ? 'performance-1' : 'performance-1-neighbor';
        store.put({
          cacheKey: `${userId}:${topicId}:${index}`,
          topicId,
          message: { ...row, id: `unrelated-${index}`, text: 'x'.repeat(1024) }
        });
      }
      store.put({
        cacheKey: 'performance-user:performance-1:\uffff-end',
        topicId: 'performance-1',
        message: { ...row, id: 'unicode' }
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const getAll = IDBObjectStore.prototype.getAll;
    let transferredRecords = 0;
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = getAll.apply(this, args);
      if (this.name === 'pendingUploadMeta')
        request.addEventListener('success', () => {
          transferredRecords += request.result.length;
        });
      return request;
    };
    try {
      const start = performance.now();
      const restored = await cache.loadPendingUploadMessages(
        'performance-1',
        'performance-user'
      );
      return {
        transferredRecords,
        elapsedMs: performance.now() - start,
        ids: restored.map(row => row.id).sort()
      };
    } finally {
      IDBObjectStore.prototype.getAll = getAll;
    }
  }, makeMessages('performance-1', 1)[0]);
  await attachMetric(testInfo, 'pending-reads.json', result);
  expect(result.transferredRecords).toBe(2);
  expect(result.ids).toEqual(['performance-1-message-0', 'unicode']);
});

for (const withMetadata of [false, true]) {
  test(`сортировка 5000 сообщений ${withMetadata ? 'с JSON' : 'без JSON'} сохраняет порядок: парный замер`, async ({
    page
  }, testInfo) => {
    await openFixture(page);
    const result = await page.evaluate(
      async ({ rows, withMetadata }) => {
        const { compareMessages } = await import('/src/utils/messageOrder.ts');
        const { compareMessagesBefore } = await import(
          '/e2e/fixtures/message-order-reference.ts'
        );
        const samples: { before: number; after: number }[] = [];
        let identical = true;
        let seed = 294;
        const shuffled = rows.map((row, index) => ({
          ...row,
          createdAt: new Date(row.createdAt),
          ex: withMetadata
            ? JSON.stringify({
                clientId: `client-${index}`,
                replyQuoteText: 'Цитата '.repeat(10)
              })
            : ''
        }));
        for (let index = shuffled.length - 1; index > 0; index--) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          const swap = seed % (index + 1);
          [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
        }
        for (let round = 0; round < 10; round++) {
          const sample = { before: 0, after: 0 };
          const outputs: Record<string, string[]> = {};
          for (const kind of round % 2
            ? (['after', 'before'] as const)
            : (['before', 'after'] as const)) {
            const input = shuffled.map(row => ({ ...row }));
            const start = performance.now();
            input.sort(
              kind === 'before' ? compareMessagesBefore : compareMessages
            );
            sample[kind] = performance.now() - start;
            outputs[kind] = input.map(row => row.id);
          }
          identical &&= outputs.before.every(
            (id, index) => id === outputs.after[index]
          );
          samples.push(sample);
        }
        const median = (kind: 'before' | 'after') =>
          samples.map(row => row[kind]).sort((a, b) => a - b)[5];
        return {
          withMetadata,
          identical,
          samples,
          beforeMedianMs: median('before'),
          afterMedianMs: median('after')
        };
      },
      { rows: makeMessages('order', 5000), withMetadata }
    );
    await attachMetric(testInfo, 'message-order.json', result);
    expect(result.identical).toBe(true);
  });
}

for (const duringHydration of [false, true]) {
  test(`прочтения ${duringHydration ? 'обновляются во время чтения истории' : 'обновлены другим клиентом при старом кеше в памяти'}`, async ({
    page
  }) => {
    await openFixture(page);
    const result = await page.evaluate(
      async ({ rows, duringHydration }) => {
        const shadowUrl = performance
          .getEntriesByType('resource')
          .find(
            row =>
              new URL(row.name).pathname ===
              '/src/services/useShadowChatSync.ts'
          )!.name;
        const shadow = await import(shadowUrl);
        const { messages } = (window as any).topicPerformance;
        await shadow.saveShadowTopicSnapshot(
          'performance-1',
          rows.map(row => ({ ...row, isReadByMe: false, isRead: false })),
          'local',
          'performance-user'
        );
        await shadow.saveShadowReadState(
          'performance-1',
          rows[9].id,
          rows[9].createdAt,
          'local',
          'performance-user'
        );
        const db = await new Promise<IDBDatabase>(resolve => {
          const request = indexedDB.open('chat-sync-shadow-db');
          request.onsuccess = () => resolve(request.result);
        });
        await new Promise<void>(resolve => {
          const tx = db.transaction('readStates', 'readwrite');
          tx.objectStore('readStates').put({
            cacheKey: 'performance-user:performance-1',
            topicId: 'performance-1',
            userId: 'performance-user',
            lastReadMessageId: rows[29].id,
            lastReadAt: rows[29].createdAt
          });
          tx.oncomplete = () => resolve();
        });
        db.close();
        const get = IDBObjectStore.prototype.get;
        let readStateReads = 0;
        IDBObjectStore.prototype.get = function (...args) {
          const request = get.apply(this, args);
          if (this.name === 'readStates') readStateReads++;
          if (duringHydration && this.name === 'topicSnapshots') {
            Object.defineProperty(request, 'onsuccess', {
              set(handler) {
                request.addEventListener('success', async event => {
                  await shadow.saveShadowReadState(
                    'performance-1',
                    rows[49].id,
                    rows[49].createdAt,
                    'ws',
                    'performance-user'
                  );
                  handler.call(request, event);
                });
              }
            });
          }
          return request;
        };
        try {
          await messages.hydrateMessagesFromCache(
            'performance-1',
            'performance-user'
          );
          return {
            readStateReads,
            readCount: messages
              .getFullMessagesByTopicId('performance-1')
              .filter(row => row.isReadByMe).length
          };
        } finally {
          IDBObjectStore.prototype.get = get;
        }
      },
      { rows: makeMessages('performance-1', 100), duringHydration }
    );
    expect(result).toEqual({
      readStateReads: 1,
      readCount: duringHydration ? 50 : 30
    });
  });
}
