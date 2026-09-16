import { expect, test } from './fixtures/ai-history';

// Настоящая IndexedDB браузера; ни модель, ни бизнес-сервисы в этих проверках не вызываются.
test.beforeEach(async ({ page }) => {
  await page.route('**/history-storage-fixture', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>История ИИ</title>'
    })
  );
  await page.goto('/history-storage-fixture');
});

test('история сохраняется в порядке вызовов, даже если первое открытие базы задержалось', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, loadMessages } = await import(modulePath);
    const id = `qa-storage-order-${crypto.randomUUID()}`;
    const original = indexedDB.open.bind(indexedDB);
    let release!: () => void;
    let opened = 0;
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      const request = original(...args);
      opened += 1;
      if (opened === 1) {
        Object.defineProperty(request, 'onsuccess', {
          configurable: true,
          set(handler) {
            request.addEventListener(
              'success',
              event => {
                release = () => handler.call(request, event);
              },
              { once: true }
            );
          }
        });
      }
      return request;
    };
    try {
      const old = [
        { id: 'answer', role: 'assistant', content: 'Первый ответ' }
      ];
      const first = saveMessages(id, old);
      const second = saveMessages(id, []);
      old[0].content = 'Позднее изменение объекта';
      while (!release) await new Promise(resolve => setTimeout(resolve, 0));
      const beforeRelease = opened;
      release();
      await Promise.all([first, second]);
      return { beforeRelease, stored: await loadMessages(id) };
    } finally {
      indexedDB.open = original;
    }
  });
  expect(result.beforeRelease).toBe(1);
  expect(result.stored).toEqual([]);
});

test('снимок сообщения не изменяется во время ожидания базы', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, loadMessages } = await import(modulePath);
    const id = `qa-storage-snapshot-${crypto.randomUUID()}`;
    const messages = [
      { id: 'answer', role: 'assistant', content: 'Сохранённый ответ' }
    ];
    const pending = saveMessages(id, messages);
    messages[0].content = 'Изменён после вызова';
    await pending;
    return (await loadMessages(id))[0].content;
  });
  expect(result).toBe('Сохранённый ответ');
});

test('старая вкладка не возвращает историю предыдущей версии после очистки', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, loadMessages, getChatHistoryGeneration } =
      await import(modulePath);
    const id = `qa-storage-generation-${crypto.randomUUID()}`;
    await saveMessages(
      id,
      [{ id: 'new', role: 'assistant', content: 'Новая история' }],
      1
    );
    const stale = await saveMessages(
      id,
      [{ id: 'old', role: 'assistant', content: 'Старая история' }],
      0
    ).then(
      () => 'unexpected-success',
      () => 'rejected'
    );
    return {
      stale,
      generation: await getChatHistoryGeneration(id),
      content: (await loadMessages(id)).map(
        (message: { content: string }) => message.content
      )
    };
  });
  expect(result).toEqual({
    stale: 'rejected',
    generation: 1,
    content: ['Новая история']
  });
});

test('изменение локальных отметок не теряет серверную версию истории', async ({
  page
}) => {
  const generation = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, getChatHistoryGeneration } = await import(modulePath);
    const id = `qa-storage-metadata-${crypto.randomUUID()}`;
    await saveMessages(id, [], 2);
    await saveMessages(id, []);
    return getChatHistoryGeneration(id);
  });
  expect(generation).toBe(2);
});

test('формат истории сохраняется в своей версии, но не наследуется после очистки', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, getChatHistorySnapshot } = await import(modulePath);
    const id = `qa-storage-protocol-${crypto.randomUUID()}`;
    await saveMessages(id, [], 0, 1);
    await saveMessages(id, []);
    const same = await getChatHistorySnapshot(id);
    await saveMessages(id, [], 1);
    const cleared = await getChatHistorySnapshot(id);
    return { same, cleared };
  });
  expect(result.same.conversationProtocol).toBe(1);
  expect(result.cleared.conversationGeneration).toBe(1);
  expect(result.cleared.conversationProtocol).toBeUndefined();
});

test('начальная загрузка читает сообщения и версию одним снимком при одновременной очистке', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, getChatHistorySnapshot } = await import(modulePath);
    const id = `qa-storage-read-snapshot-${crypto.randomUUID()}`;
    await saveMessages(
      id,
      [{ id: 'old', role: 'assistant', content: 'До очистки' }],
      0
    );
    const get = IDBObjectStore.prototype.get;
    let reads = 0;
    IDBObjectStore.prototype.get = function (...args) {
      const request = get.apply(this, args);
      if (this.transaction.mode === 'readonly' && args[0] === id) {
        reads += 1;
        if (reads === 1) {
          Object.defineProperty(request, 'onsuccess', {
            configurable: true,
            set(handler) {
              request.addEventListener(
                'success',
                event => {
                  // Другая вкладка очищает базу до того, как загруженное состояние применено.
                  void saveMessages(id, [], 1).then(() =>
                    handler.call(request, event)
                  );
                },
                { once: true }
              );
            }
          });
        }
      }
      return request;
    };
    try {
      const snapshot = await getChatHistorySnapshot(id);
      const snapshotReads = reads;
      const staleWrite = await saveMessages(
        id,
        snapshot.messages,
        snapshot.conversationGeneration
      ).then(
        () => 'unexpected-success',
        () => 'rejected'
      );
      return {
        snapshotReads,
        generation: snapshot.conversationGeneration,
        content: snapshot.messages.map(
          (message: { content: string }) => message.content
        ),
        staleWrite,
        current: await getChatHistorySnapshot(id)
      };
    } finally {
      IDBObjectStore.prototype.get = get;
    }
  });
  expect(result).toEqual({
    snapshotReads: 1,
    generation: 0,
    content: ['До очистки'],
    staleWrite: 'rejected',
    current: { messages: [], conversationGeneration: 1 }
  });
});

test('успешный put с откатившейся транзакцией считается ошибкой, следующая запись работает', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/services/useChatDb.ts';
    const { saveMessages, loadMessages } = await import(modulePath);
    const id = `qa-storage-rollback-${crypto.randomUUID()}`;
    const put = IDBObjectStore.prototype.put;
    let shouldAbort = true;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (shouldAbort) {
        shouldAbort = false;
        const transaction = this.transaction;
        request.addEventListener('success', () => transaction.abort(), {
          once: true
        });
      }
      return request;
    };
    try {
      const first = saveMessages(id, [
        { id: 'old', role: 'assistant', content: 'Не сохранён' }
      ]).then(
        () => 'unexpected-success',
        () => 'rejected'
      );
      const second = saveMessages(id, [
        { id: 'new', role: 'assistant', content: 'Сохранён' }
      ]);
      await second;
      return {
        first: await first,
        stored: (await loadMessages(id)).map(
          (message: { content: string }) => message.content
        )
      };
    } finally {
      IDBObjectStore.prototype.put = put;
    }
  });
  expect(result).toEqual({ first: 'rejected', stored: ['Сохранён'] });
});
