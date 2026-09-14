import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

async function openCachePage(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__cache-performance') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Кеш</title>'
      });
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    (window as any).uploadRegistrations = [];
    const register = ServiceWorkerContainer.prototype.register;
    ServiceWorkerContainer.prototype.register = function (url, options) {
      (window as any).uploadRegistrations.push(String(url));
      return register.call(this, url, options);
    };
  });
  await page.goto('/__cache-performance');
}

test('чтение истории и сохранение малого файла не запускают service worker вложений', async ({
  page
}) => {
  await openCachePage(page);
  const result = await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      await cache.saveCachedTopicMessages('cache-topic', rows, 'cache-user');
      const restored = await cache.loadCachedTopicMessages(
        'cache-topic',
        'cache-user'
      );
      await cache.savePendingUploadFile({
        topicId: 'cache-topic',
        messageId: 'small',
        fileId: 'file',
        userId: 'cache-user',
        isMedia: false,
        file: new File(['small file'], 'small.txt')
      });
      return {
        count: restored.length,
        registrations: (window as any).uploadRegistrations,
        workers: (await navigator.serviceWorker.getRegistrations()).map(
          item => item.scope
        )
      };
    },
    makeMessages('cache-topic', 5000)
  );
  expect(result).toEqual({ count: 5000, registrations: [], workers: [] });
});

test('отложенный service worker сохраняет 33 МиБ и восстанавливает файл после перезагрузки', async ({
  page
}) => {
  test.setTimeout(90_000);
  await openCachePage(page);
  const saved = await page.evaluate(async () => {
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    const initialRegistrations = [...(window as any).uploadRegistrations];
    const bytes = new Uint8Array(33 * 1024 * 1024);
    bytes[0] = 19;
    bytes[16 * 1024 * 1024] = 73;
    bytes[bytes.length - 1] = 241;
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    ).join(',');
    const progress: number[] = [];
    await cache.savePendingUploadFile({
      topicId: 'cache-topic',
      messageId: 'large',
      fileId: 'file',
      userId: 'cache-user',
      isMedia: false,
      file: new File([bytes], 'large.bin', {
        type: 'application/octet-stream',
        lastModified: 1788220800000
      }),
      onProgress: value => progress.push(value)
    });
    return {
      initialRegistrations,
      registrations: (window as any).uploadRegistrations,
      progress,
      hash
    };
  });
  expect(saved.initialRegistrations).toEqual([]);
  expect(saved.registrations).toHaveLength(1);
  expect(saved.registrations[0]).toContain('/pending-upload-service-worker.js');
  expect(saved.progress.at(-1)).toBe(100);
  await page.reload();
  const restored = await page.evaluate(async () => {
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    const result = await cache.loadPendingUploadFile(
      'cache-topic',
      'large',
      'file',
      'cache-user'
    );
    if (!result) throw new Error('Файл не восстановлен после перезагрузки');
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await result.file.arrayBuffer())
      )
    ).join(',');
    const metadata = {
      size: result.file.size,
      name: result.file.name,
      type: result.file.type,
      isMedia: result.isMedia,
      hash
    };
    await cache.deletePendingUploadFile(
      'cache-topic',
      'large',
      'file',
      'cache-user'
    );
    return {
      ...metadata,
      deleted:
        (await cache.loadPendingUploadFile(
          'cache-topic',
          'large',
          'file',
          'cache-user'
        )) === null
    };
  });
  expect(restored).toEqual({
    size: 33 * 1024 * 1024,
    name: 'large.bin',
    type: 'application/octet-stream',
    isMedia: false,
    hash: saved.hash,
    deleted: true
  });
});

test('5000 сообщений и 4000 пользователей совместимы со старым декодером без полного копирования', async ({
  page
}, testInfo) => {
  await openCachePage(page);
  const result = await page.evaluate(
    async rows => {
      const { reviveCachedDates } = await import(
        '/src/utils/revive-cached-dates.ts'
      );
      const keys = new Set([
        'createdAt',
        'updatedAt',
        'deletedAt',
        'lastOnline'
      ]);
      const previous = (value: any): any => {
        if (Array.isArray(value)) return value.map(previous);
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
              key,
              keys.has(key) && typeof child === 'string'
                ? new Date(child)
                : previous(child)
            ])
          );
        return value;
      };
      const payload = {
        messages: rows.map(row => ({
          ...row,
          custom: { updatedAt: row.updatedAt, flags: [true, null, 'extra'] }
        })),
        users: Array.from({ length: 4000 }, (_, index) => ({
          id: `user-${index}`,
          name: `Пользователь ${index}`,
          lastOnline: rows[0].createdAt,
          custom: { createdAt: rows[1].createdAt }
        }))
      };
      const original = JSON.stringify(payload);
      const samples: { previousMs: number; currentMs: number }[] = [];
      let identical = true;
      let datesRestored = true;
      for (let iteration = 0; iteration < 16; iteration++) {
        const oldInput = structuredClone(payload);
        const newInput = structuredClone(payload);
        let oldOutput: any;
        let newOutput: any;
        let previousMs = 0;
        let currentMs = 0;
        const oldRun = () => {
          const start = performance.now();
          oldOutput = previous(oldInput);
          previousMs = performance.now() - start;
        };
        const newRun = () => {
          const start = performance.now();
          newOutput = reviveCachedDates(newInput);
          currentMs = performance.now() - start;
        };
        if (iteration % 2) {
          newRun();
          oldRun();
        } else {
          oldRun();
          newRun();
        }
        identical &&= JSON.stringify(oldOutput) === JSON.stringify(newOutput);
        datesRestored &&=
          newOutput.messages.every(
            (row: any) =>
              row.createdAt instanceof Date &&
              row.custom.updatedAt instanceof Date
          ) &&
          newOutput.users.every((row: any) => row.lastOnline instanceof Date);
        if (iteration > 1) samples.push({ previousMs, currentMs });
      }
      const median = (key: 'previousMs' | 'currentMs') =>
        samples.map(row => row[key]).sort((a, b) => a - b)[
          Math.floor(samples.length / 2)
        ];
      return {
        identical,
        datesRestored,
        inputUntouched: JSON.stringify(payload) === original,
        messages: rows.length,
        users: payload.users.length,
        previousMedianMs: median('previousMs'),
        currentMedianMs: median('currentMs'),
        samples
      };
    },
    makeMessages('cache-topic', 5000)
  );
  const path = testInfo.outputPath('cache-decoding.json');
  await writeFile(path, JSON.stringify(result, null, 2));
  await testInfo.attach('cache-decoding.json', {
    path,
    contentType: 'application/json'
  });
  expect(result.identical).toBe(true);
  expect(result.datesRestored).toBe(true);
  expect(result.inputUntouched).toBe(true);
});

test('история, shadow-кеш, топики и пользователи сохраняют даты и изоляцию после перезагрузки', async ({
  page
}) => {
  await openCachePage(page);
  await page.evaluate(
    async rows => {
      const cache = await import('/src/services/useTopicMessagesCache.ts');
      const state = await import('/src/services/useChatStateCache.ts');
      const shadow = await import('/src/services/useShadowChatSync.ts');
      await cache.saveCachedTopicMessages('cache-topic', rows, 'cache-user');
      await shadow.saveShadowTopicSnapshot(
        'cache-topic',
        rows,
        'local',
        'cache-user',
        { replace: true }
      );
      await shadow.saveShadowSyncMeta(
        'custom-dates',
        {
          timestamp: rows[0].createdAt,
          nested: { receivedAt: rows[1].createdAt }
        },
        'cache-user'
      );
      await state.saveCachedTopics(
        [
          {
            id: 'cache-topic',
            createdAt: new Date(rows[0].createdAt),
            lastMessage: rows.at(-1),
            custom: {
              updatedAt: new Date(rows[1].updatedAt),
              timestamp: rows[0].createdAt
            }
          }
        ] as any,
        'cache-user'
      );
      await state.saveCachedUsers(
        Array.from({ length: 4000 }, (_, index) => ({
          id: `user-${index}`,
          lastOnline: new Date(rows[0].createdAt),
          name: `Пользователь ${index}`
        })) as any,
        'cache-user'
      );
      const loaded = await cache.loadCachedTopicMessages(
        'cache-topic',
        'cache-user'
      );
      loaded[0].text = 'Только в памяти';
    },
    makeMessages('cache-topic', 5000)
  );
  await page.reload();
  const result = await page.evaluate(async () => {
    const cache = await import('/src/services/useTopicMessagesCache.ts');
    const state = await import('/src/services/useChatStateCache.ts');
    const shadow = await import('/src/services/useShadowChatSync.ts');
    const legacy = await cache.loadCachedTopicMessages(
      'cache-topic',
      'cache-user'
    );
    const snapshot = await shadow.loadShadowTopicSnapshot(
      'cache-topic',
      'cache-user'
    );
    const users = await state.loadCachedUsers('cache-user');
    const metadata = await shadow.loadShadowSyncMeta<any>(
      'custom-dates',
      'cache-user'
    );
    const fast = await state.loadCachedTopics('cache-user');
    localStorage.removeItem('chat-offline-fast-topics-v1:cache-user');
    const topics = await state.loadCachedTopics('cache-user');
    const foreign = await Promise.all([
      cache.loadCachedTopicMessages('cache-topic', 'another-user'),
      shadow.loadShadowTopicSnapshot('cache-topic', 'another-user'),
      state.loadCachedTopics('another-user'),
      state.loadCachedUsers('another-user')
    ]);
    return {
      counts: [
        legacy.length,
        snapshot.length,
        users.length,
        fast.length,
        topics.length
      ],
      equalHistory: JSON.stringify(legacy) === JSON.stringify(snapshot),
      equalTopics: JSON.stringify(fast) === JSON.stringify(topics),
      dates: [
        legacy[0].createdAt,
        snapshot[0].updatedAt,
        users[0].lastOnline,
        topics[0].createdAt,
        (topics[0] as any).custom.updatedAt,
        (fast[0] as any).custom.updatedAt,
        metadata.timestamp,
        metadata.nested.receivedAt
      ].every(value => value instanceof Date),
      unknownTimestamp: typeof (topics[0] as any).custom.timestamp,
      originalText: legacy[0].text,
      foreign: foreign.map(value => value.length)
    };
  });
  expect(result).toEqual({
    counts: [5000, 5000, 4000, 1, 1],
    equalHistory: true,
    equalTopics: true,
    dates: true,
    unknownTimestamp: 'string',
    originalText: 'Сообщение 0 в cache-topic',
    foreign: [0, 0, 0, 0]
  });
});

test('быстрая гидратация сохраняет удаления, порядок, прочтение и прогресс прерванного вложения', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const { messages } = (window as any).topicPerformance;
      rows.forEach(row => {
        row.isReadByMe = false;
        row.status = 'SENT';
      });
      rows[rows.length - 1].media = [
        {
          id: 'pending-file',
          type: 'FILE',
          name: 'report.bin',
          isLoading: true,
          uploadPercent: 57
        }
      ] as any;
      await shadow.saveShadowTopicSnapshot(
        'performance-1',
        [...rows].reverse(),
        'local',
        'performance-user',
        { replace: true }
      );
      await shadow.markShadowTopicMessageDeleted(
        'performance-1',
        rows[7].id,
        'performance-user'
      );
      await shadow.saveShadowReadState(
        'performance-1',
        rows[25].id,
        rows[25].createdAt,
        'local',
        'performance-user'
      );
      await shadow.saveShadowLoadedRange(
        'performance-1',
        rows,
        'performance-user'
      );
      await messages.hydrateMessagesFromCache(
        'performance-1',
        'performance-user',
        { visibleLimit: 48 }
      );
      const history = messages.getFullMessagesByTopicId('performance-1');
      const last = history.at(-1);
      return {
        count: history.length,
        ids: history.map(row => row.id),
        read: history.filter(row => row.isReadByMe).map(row => row.id),
        lastStatus: last.status,
        media: last.media[0],
        registrations: (
          await navigator.serviceWorker.getRegistrations()
        ).filter(row => row.scope.includes('pending-upload')).length
      };
    },
    makeMessages('performance-1', 100)
  );
  expect(result.count).toBe(99);
  expect(result.ids).toEqual(
    makeMessages('performance-1', 100)
      .filter((_, i) => i !== 7)
      .map(row => row.id)
  );
  expect(result.read).toEqual(
    makeMessages('performance-1', 26)
      .filter((_, i) => i !== 7)
      .map(row => row.id)
  );
  expect(result.lastStatus).toBe('WAIT');
  expect(result.media).toMatchObject({
    isLoading: true,
    uploadError: true,
    uploadPercent: 57
  });
  expect(result.registrations).toBe(0);
  expect(errors).toEqual([]);
});
