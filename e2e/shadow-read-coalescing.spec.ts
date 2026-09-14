import { expect, test } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

for (const storeName of ['readStates', 'syncMeta'] as const) {
  test(`${storeName}: 60 читателей делят запрос, новая запись не затирается старым чтением`, async ({
    page
  }) => {
    await openFixture(page);
    const result = await page.evaluate(async storeName => {
      const moduleUrl = performance
        .getEntriesByType('resource')
        .find(
          row =>
            new URL(row.name).pathname === '/src/services/useShadowChatSync.ts'
        )!.name;
      const shadow = await import(moduleUrl);
      await shadow.loadShadowReadState('setup', 'setup-user');
      const db = await new Promise<IDBDatabase>(resolve => {
        const request = indexedDB.open('chat-sync-shadow-db');
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>(resolve => {
        const tx = db.transaction(storeName, 'readwrite');
        for (const user of ['reader-a', 'reader-b']) {
          tx.objectStore(storeName).put(
            storeName === 'readStates'
              ? {
                  cacheKey: `${user}:test`,
                  lastReadMessageId: user,
                  lastReadAt: null
                }
              : { key: `${user}:test`, value: user }
          );
        }
        tx.oncomplete = () => resolve();
      });
      db.close();
      const load = (user: string) =>
        storeName === 'readStates'
          ? shadow.loadShadowReadState('test', user)
          : shadow.loadShadowSyncMeta('test', user);
      let signal!: () => void;
      const started = new Promise<void>(resolve => {
        signal = resolve;
      });
      let release!: () => void;
      const get = IDBObjectStore.prototype.get;
      let reads = 0;
      IDBObjectStore.prototype.get = function (...args) {
        const request = get.apply(this, args);
        if (this.name === storeName) {
          reads++;
          if (args[0] === 'reader-a:test' && reads === 1) {
            Object.defineProperty(request, 'onsuccess', {
              set(handler) {
                request.addEventListener('success', event => {
                  release = () => handler.call(request, event);
                  signal();
                });
              }
            });
          }
        }
        return request;
      };
      try {
        const pending = Array.from({ length: 60 }, () => load('reader-a'));
        await started;
        const otherUser = await load('reader-b');
        if (storeName === 'readStates')
          await shadow.saveShadowReadState(
            'test',
            'new',
            null,
            'ws',
            'reader-a'
          );
        else await shadow.saveShadowSyncMeta('test', 'new', 'reader-a');
        release();
        const values = await Promise.all(pending);
        const readsBeforeNextLoad = reads;
        const next = await load('reader-a');
        return { values, otherUser, next, readsBeforeNextLoad, reads };
      } finally {
        IDBObjectStore.prototype.get = get;
      }
    }, storeName);
    const value =
      storeName === 'readStates'
        ? { lastReadMessageId: 'new', lastReadAt: null }
        : 'new';
    expect(result.values).toEqual(Array.from({ length: 60 }, () => value));
    expect(result.otherUser).toEqual(
      storeName === 'readStates'
        ? { lastReadMessageId: 'reader-b', lastReadAt: null }
        : 'reader-b'
    );
    expect(result.next).toEqual(value);
    expect(result.readsBeforeNextLoad).toBe(2);
    expect(result.reads).toBe(storeName === 'readStates' ? 3 : 2);
  });

  test(`${storeName}: ошибка общего чтения освобождает повторную попытку`, async ({
    page
  }) => {
    await openFixture(page);
    const result = await page.evaluate(async storeName => {
      const moduleUrl = performance
        .getEntriesByType('resource')
        .find(
          row =>
            new URL(row.name).pathname === '/src/services/useShadowChatSync.ts'
        )!.name;
      const shadow = await import(moduleUrl);
      const load = () =>
        storeName === 'readStates'
          ? shadow.loadShadowReadState('failed-read', 'reader')
          : shadow.loadShadowSyncMeta('failed-read', 'reader');
      const get = IDBObjectStore.prototype.get;
      let reads = 0;
      IDBObjectStore.prototype.get = function (...args) {
        if (
          this.name === storeName &&
          args[0] === 'reader:failed-read' &&
          ++reads === 1
        )
          throw new Error('Тестовый сбой чтения');
        return get.apply(this, args);
      };
      try {
        const failed = await Promise.all(Array.from({ length: 60 }, load));
        const recovered = await load();
        return { failed, recovered, reads };
      } finally {
        IDBObjectStore.prototype.get = get;
      }
    }, storeName);
    expect(result).toEqual({
      failed: Array(60).fill(null),
      recovered: null,
      reads: 2
    });
  });
}
