import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/startup-db-harness', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body>' })
  );
  await page.goto('/startup-db-harness');
});

test('обновление старого кеша сохраняет историю, outbox и состояние прочтения', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const seed = (name: string, version: number, stores: string[]) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = () => {
          for (const store of stores)
            request.result.createObjectStore(store, { keyPath: 'cacheKey' });
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(stores, 'readwrite');
          for (const store of stores)
            tx.objectStore(store).put({ cacheKey: 'user:topic', value: store });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    await seed('chat-topic-messages-db', 4, [
      'topicMessages',
      'pendingUploadMeta'
    ]);
    await seed('chat-sync-shadow-db', 1, ['readStates', 'topicSnapshots']);
    localStorage.setItem(
      'chat.indexeddb.reset.done',
      'chat-client-indexeddb-reset-2026-04-29-v1'
    );
    const { prepareChatDatabases, openChatDatabase } = await import(
      '/src/utils/chat-startup-databases.ts'
    );
    prepareChatDatabases();
    const [messages, shadow, state] = await Promise.all([
      openChatDatabase('chat-topic-messages-db'),
      openChatDatabase('chat-sync-shadow-db'),
      openChatDatabase('chat-offline-state-db')
    ]);
    const read = (db: IDBDatabase, store: string) =>
      new Promise(resolve => {
        const request = db
          .transaction(store)
          .objectStore(store)
          .get('user:topic');
        request.onsuccess = () => resolve(request.result?.value);
      });
    return {
      records: await Promise.all([
        read(messages!, 'topicMessages'),
        read(messages!, 'pendingUploadMeta'),
        read(shadow!, 'readStates'),
        read(shadow!, 'topicSnapshots')
      ]),
      sameConnection:
        messages === (await openChatDatabase('chat-topic-messages-db')),
      chunkIndex: messages!
        .transaction('pendingUploadChunks')
        .objectStore('pendingUploadChunks')
        .index('cacheKey').keyPath,
      entities: state!.objectStoreNames.contains('entities'),
      previews: shadow!.objectStoreNames.contains('topicPreviews')
    };
  });
  expect(result).toEqual({
    records: [
      'topicMessages',
      'pendingUploadMeta',
      'readStates',
      'topicSnapshots'
    ],
    sameConnection: true,
    chunkIndex: 'cacheKey',
    entities: true,
    previews: true
  });
});

test('ранняя подготовка ждёт старый сброс; удалённая база открывается заново', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const { prepareChatDatabases, openChatDatabase } = await import(
      '/src/utils/chat-startup-databases.ts'
    );
    prepareChatDatabases();
    const before = await indexedDB.databases();
    const first = await openChatDatabase('chat-topic-messages-db');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('chat-topic-messages-db');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const second = await openChatDatabase('chat-topic-messages-db');
    return {
      before: before.length,
      different: first !== second,
      pendingStore: second!.objectStoreNames.contains('pendingUploadMeta')
    };
  });
  expect(result).toEqual({ before: 0, different: true, pendingStore: true });
});

test('уведомление заранее читает только локальные изменения своей переписки и использует их один раз', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    localStorage.setItem(
      'chat.indexeddb.reset.done',
      'chat-client-indexeddb-reset-2026-04-29-v1'
    );
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({ token: 'test-token', user: { id: 'u' } })
    );
    const { openChatDatabase } = await import(
      '/src/utils/chat-startup-databases.ts'
    );
    const messages = (await openChatDatabase('chat-topic-messages-db'))!;
    const shadow = (await openChatDatabase('chat-sync-shadow-db'))!;
    const seed = (db: IDBDatabase, store: string, records: any[]) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        records.forEach(record => tx.objectStore(store).put(record));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    await seed(messages, 'pendingUploadMeta', [
      {
        cacheKey: 'u:t:m',
        topicId: 't',
        messageId: 'm',
        message: { id: 'm', topicId: 't', text: 'outbox' }
      },
      {
        cacheKey: 'other:t:foreign',
        topicId: 't',
        messageId: 'foreign',
        message: { id: 'foreign' }
      },
      {
        cacheKey: 'u:other:foreign',
        topicId: 'other',
        messageId: 'foreign',
        message: { id: 'foreign' }
      }
    ]);
    await seed(shadow, 'readStates', [
      { cacheKey: 'u:t', lastReadMessageId: 'read', lastReadAt: null }
    ]);
    await seed(shadow, 'syncMeta', [
      { key: 'u:deletedMessages:t', value: ['deleted'] },
      { key: 'u:ranges:t', value: ['range'] }
    ]);
    const reads: string[] = [];
    for (const method of ['get', 'getAll'] as const) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args: any[]) {
        reads.push(this.name);
        if (
          [
            'topicMessages',
            'topicSnapshots',
            'pendingUploads',
            'pendingUploadChunks'
          ].includes(this.name)
        )
          throw new Error('Прочитана полная история или файл');
        return original.apply(this, args as any);
      };
    }
    const prepared = await import('/src/utils/startup-topic-records.ts');
    await prepared.prepareStartupTopicRecords('t');
    const before = [...reads];
    const { loadPendingUploadMessages } = await import(
      '/src/services/useTopicMessagesCache.ts'
    );
    const { loadShadowReadState, loadShadowSyncMeta } = await import(
      '/src/services/useShadowChatSync.ts'
    );
    const pending = await loadPendingUploadMessages('t', 'u');
    const readState = await loadShadowReadState('t', 'u');
    const deleted = await loadShadowSyncMeta('deletedMessages:t', 'u');
    const ranges = await loadShadowSyncMeta('ranges:t', 'u');
    return {
      before: before.sort(),
      after: reads.sort(),
      pending: pending.map(message => message.id),
      read: readState?.lastReadMessageId,
      deleted,
      ranges,
      consumed:
        prepared.takeStartupTopicRecord(
          'chat-topic-messages-db',
          'pendingUploadMeta',
          'u:t'
        ) === undefined
    };
  });
  expect(result).toEqual({
    before: ['pendingUploadMeta', 'readStates', 'syncMeta', 'syncMeta'],
    after: ['pendingUploadMeta', 'readStates', 'syncMeta', 'syncMeta'],
    pending: ['m'],
    read: 'read',
    deleted: ['deleted'],
    ranges: ['range'],
    consumed: true
  });
});

test('изменение outbox и смена сессии отменяют ранние записи', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    localStorage.setItem(
      'chat.indexeddb.reset.done',
      'chat-client-indexeddb-reset-2026-04-29-v1'
    );
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({ token: 'one', user: { id: 'u' } })
    );
    const startup = await import('/src/utils/startup-topic-records.ts');
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    await cache.savePendingUploadMeta({
      topicId: 't',
      messageId: 'old',
      userId: 'u',
      forwardMessageIds: [],
      message: { id: 'old', topicId: 't' } as any
    });
    await startup.prepareStartupTopicRecords('t');
    await cache.deletePendingUploadMeta('t', 'old', 'u');
    const afterDelete = await cache.loadPendingUploadMessages('t', 'u');
    await startup.prepareStartupTopicRecords('t');
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({ token: 'two', user: { id: 'u' } })
    );
    const afterTokenChange = startup.takeStartupTopicRecord(
      'chat-sync-shadow-db',
      'readStates',
      'u:t'
    );
    await startup.prepareStartupTopicRecords('t');
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({ token: 'three', user: { id: 'other' } })
    );
    const afterUserChange = startup.takeStartupTopicRecord(
      'chat-sync-shadow-db',
      'readStates',
      'u:t'
    );
    return {
      afterDelete: afterDelete.length,
      tokenRejected: !afterTokenChange,
      userRejected: !afterUserChange
    };
  });
  expect(result).toEqual({
    afterDelete: 0,
    tokenRejected: true,
    userRejected: true
  });
});
