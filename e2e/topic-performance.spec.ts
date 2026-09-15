import { expect, test, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.setTimeout(90_000);

import {
  makeMessages,
  openFixture,
  openTopic,
  message,
  resetMetrics,
  metrics
} from './fixtures/topic-performance-page';

async function saveMetrics(testInfo: TestInfo, name: string, result: unknown) {
  const path = testInfo.outputPath(name);
  await writeFile(path, JSON.stringify(result, null, 2));
  await testInfo.attach(name, { path, contentType: 'application/json' });
}

test('быстрый ответ не показывает скелетон', async ({ page }, testInfo) => {
  const state = await openFixture(page);
  // Прогреваем одноразовую инициализацию компонента; целевой топик ещё не загружен.
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeVisible();
  await resetMetrics(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await saveMetrics(testInfo, 'fast-open.json', await metrics(page));
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
  expect(state.failures).toEqual([]);
});

test('повторные переходы не перезапрашивают свежую историю и закрепления', async ({
  page
}, testInfo) => {
  const state = await openFixture(page);
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(message(page, index)).toBeVisible();
  }
  await page.waitForTimeout(1000);
  const before = state.requests.length;
  await resetMetrics(page);
  const timings: number[] = [];
  for (let index = 0; index < 12; index++) {
    const started = Date.now();
    await openTopic(page, index % 2);
    await expect(message(page, index % 2)).toBeVisible();
    timings.push(Date.now() - started);
  }
  await page.waitForTimeout(400);
  const result = {
    ...(await metrics(page)),
    timings,
    extraRequests: state.requests.slice(before)
  };
  await saveMetrics(testInfo, 'topic-performance.json', result);
  expect(result.extraRequests).toEqual([]);
  expect(result.skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
});

test('известный пустой топик не мигает скелетоном при возврате', async ({
  page
}) => {
  await openFixture(page, { count: 0, delay: 400 });
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(
      page.getByTestId('Performance-MessageList-EmptyChat')
    ).toBeVisible();
  }
  await resetMetrics(page);
  await openTopic(page, 0);
  await page.waitForTimeout(700);
  expect((await metrics(page)).skeletonFrames).toBe(0);
  await expect(
    page.getByTestId('Performance-MessageList-EmptyChat')
  ).toBeVisible();
});

test('длинный топик после TTL обновляется одним запросом и сохраняет быстрый возврат', async ({
  page,
  isMobile
}) => {
  const state = await openFixture(page, { count: 5000 });
  const historyRequests = (requests: string[]) =>
    requests.filter(url => /\/messages\/topic\/performance-0\?/.test(url));
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(message(page, index, 4999)).toBeVisible();
    await page.waitForTimeout(1000);
  }
  if (isMobile) expect(historyRequests(state.requests)).toHaveLength(1);

  await page.clock.setFixedTime(Date.now() + 16_000);
  const before = state.requests.length;
  await resetMetrics(page);
  await openTopic(page, 0);
  await expect(message(page, 0, 4999)).toBeVisible();
  await page.waitForTimeout(1200);
  expect(historyRequests(state.requests.slice(before))).toEqual([
    `GET /performance-api/messages/topic/performance-0?limit=${isMobile ? 72 : 100}`
  ]);
  expect((await metrics(page)).skeletonFrames).toBe(0);
  await expect(page.locator('[data-message-id]')).toHaveCount(
    isMobile ? 72 : 100
  );

  await openTopic(page, 1);
  await expect(message(page, 1, 4999)).toBeVisible();
  const beforeFreshReturn = state.requests.length;
  await openTopic(page, 0);
  await expect(message(page, 0, 4999)).toBeVisible();
  await page.waitForTimeout(1000);
  expect(historyRequests(state.requests.slice(beforeFreshReturn))).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('параллельные одинаковые HTTP-запросы объединяются', async ({ page }) => {
  const state = await openFixture(page, { delay: 300 });
  const result = await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    const rows = await Promise.all(
      Array.from({ length: 20 }, () =>
        sdk.getMessages('performance-0', { limit: 48 })
      )
    );
    await Promise.all(
      Array.from({ length: 20 }, () => sdk.getPinnedMessages('performance-0'))
    );
    return rows.map(row => row.length);
  });
  expect(result).toEqual(Array(20).fill(20));
  expect(
    state.requests.filter(url => url.includes('/messages/topic/'))
  ).toHaveLength(2);
});

test('медленная сеть показывает скелетон только после задержки и убирает его после ответа', async ({
  page
}) => {
  await openFixture(page);
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeVisible();
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(
    /\/performance-api\/messages\/topic\/performance-0\?limit=(48|72)$/,
    async route => {
      await responseReady;
      await route.fulfill({ json: makeMessages('performance-0', 20) });
    }
  );
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await resetMetrics(page);
  await page.evaluate(() =>
    (window as any).topicPerformance.navigate('performance-0')
  );
  try {
    await page.clock.runFor(100);
    await expect(
      page.getByTestId('Performance-MessageList-Skeleton')
    ).toHaveCount(0);
    await page.clock.runFor(201);
    await expect(
      page.getByTestId('Performance-MessageList-Skeleton')
    ).toBeVisible();
  } finally {
    release();
    await page.clock.resume();
  }
  await expect(message(page, 0)).toBeVisible();
  await expect(
    page.getByTestId('Performance-MessageList-Skeleton')
  ).toHaveCount(0);
});

test('истечение свежести и принудительное обновление действительно обращаются к серверу', async ({
  page
}) => {
  const state = await openFixture(page);
  const fetchHistory = (maxAgeMs?: number) =>
    page.evaluate(async maxAgeMs => {
      const { messages } = (window as any).topicPerformance;
      return (
        await messages.fetchMessagesForTopic('performance-0', {
          limit: 48,
          forceRefresh: true,
          maxAgeMs
        })
      ).length;
    }, maxAgeMs);
  expect(await fetchHistory()).toBe(20);
  expect(await fetchHistory(15000)).toBe(20);
  expect(
    state.requests.filter(url => url.includes('/messages/topic/'))
  ).toHaveLength(1);
  expect(await fetchHistory()).toBe(20);
  await page.clock.setFixedTime(Date.now() + 16000);
  expect(await fetchHistory(15000)).toBe(20);
  expect(
    state.requests.filter(url => url.includes('/messages/topic/'))
  ).toHaveLength(3);
});

test('ошибки запросов освобождают дедупликацию; курсоры не смешиваются', async ({
  page
}) => {
  const state = await openFixture(page, { delay: 100 });
  let attempts = 0;
  await page.route(
    '**/performance-api/messages/topic/performance-0?limit=48',
    route => {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? { status: 500, json: { error: 'test' } }
          : { json: makeMessages('performance-0', 20) }
      );
    }
  );
  const result = await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    const failed = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        sdk.getMessages('performance-0', { limit: 48 })
      )
    );
    const retry = await sdk.getMessages('performance-0', { limit: 48 });
    await Promise.all(
      ['a', 'b'].map(lastMessageId =>
        sdk.getMessages('performance-0', { limit: 20, lastMessageId })
      )
    );
    return {
      failed: failed.filter(item => item.status === 'rejected').length,
      retry: retry.length
    };
  });
  expect(result).toEqual({ failed: 10, retry: 20 });
  expect(attempts).toBe(2);
  expect(
    state.requests.filter(url => url.includes('lastMessageId='))
  ).toHaveLength(2);
});

test('быстрая смена топиков при медленных ответах сохраняет последний выбранный топик', async ({
  page
}) => {
  const state = await openFixture(page, { delay: 600 });
  for (const index of [0, 1, 2, 0, 1, 2]) {
    await openTopic(page, index);
    await page.waitForTimeout(30);
  }
  await expect(message(page, 2)).toBeVisible();
  await page.waitForTimeout(900);
  await expect(message(page, 0)).toHaveCount(0);
  await expect(message(page, 1)).toHaveCount(0);
  await expect(message(page, 2)).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('оболочка Chat не добавляет повторных запросов при переходах', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(message(page, index)).toBeVisible();
    await page.waitForTimeout(500);
  }
  const before = state.requests.length;
  await resetMetrics(page);
  for (const index of [0, 1, 0, 1]) {
    await openTopic(page, index);
    await expect(message(page, index)).toBeVisible();
  }
  await page.waitForTimeout(500);
  expect(state.requests.slice(before)).toEqual([]);
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
});

test('возврат из памяти сохраняет обновлённые сообщения и не читает IndexedDB повторно', async ({
  page
}) => {
  await openFixture(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  const result = await page.evaluate(async () => {
    const { messages } = (window as any).topicPerformance;
    await messages.hydrateMessagesFromCache('performance-0');
    const original = messages.getFullMessagesByTopicId('performance-0');
    const updated = original.map((row, i) =>
      i === original.length - 1
        ? { ...row, text: 'Обновлено после загрузки' }
        : row
    );
    messages.saveMessagesToLocal('performance-0', updated, {
      skipPersist: true,
      syncLastMessage: false
    });
    const resident = messages.getFullMessagesByTopicId('performance-0');
    let reads = 0;
    const originalGet = IDBObjectStore.prototype.get;
    const originalGetAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.get = function (...args) {
      reads++;
      return originalGet.apply(this, args);
    };
    IDBObjectStore.prototype.getAll = function (...args) {
      reads++;
      return originalGetAll.apply(this, args);
    };
    try {
      await messages.hydrateMessagesFromCache('performance-0', undefined, {
        visibleLimit: 48
      });
      return {
        reads,
        sameSnapshot:
          resident === messages.getFullMessagesByTopicId('performance-0'),
        text: messages.getMessagesByTopicId('performance-0').at(-1).text
      };
    } finally {
      IDBObjectStore.prototype.get = originalGet;
      IDBObjectStore.prototype.getAll = originalGetAll;
    }
  });
  expect(result).toEqual({
    reads: 0,
    sameSnapshot: true,
    text: 'Обновлено после загрузки'
  });
});

test('офлайн-переход между известными топиками сохраняет сообщения', async ({
  page
}) => {
  const state = await openFixture(page);
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(message(page, index)).toBeVisible();
  }
  const before = state.requests.length;
  await page.context().setOffline(true);
  await resetMetrics(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.requests.slice(before)).toEqual([]);
});

test('новое превью обходит TTL и загружает пропущенное сообщение без скелетона', async ({
  page
}) => {
  const state = await openFixture(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeVisible();
  const updated = makeMessages('performance-0', 21);
  let refreshes = 0;
  await page.route(
    /\/performance-api\/messages\/topic\/performance-0\?limit=(48|72)$/,
    route => {
      refreshes++;
      return route.fulfill({ json: updated });
    }
  );
  await page.evaluate(lastMessage => {
    (window as any).topicPerformance.updateLocalLastMessageTopic(
      'performance-0',
      lastMessage
    );
  }, updated.at(-1));
  await resetMetrics(page);
  await openTopic(page, 0);
  await expect(message(page, 0, 20)).toBeVisible();
  expect(refreshes).toBe(1);
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
});

test('25 топиков вытесняют неактивную историю и восстанавливаются из кеша офлайн', async ({
  page
}) => {
  const state = await openFixture(page, { topicCount: 25 });
  for (let index = 0; index < 25; index++) {
    await page.evaluate(
      index =>
        (window as any).topicPerformance.navigate(`performance-${index}`),
      index
    );
    await expect(message(page, index)).toBeVisible();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).topicPerformance.messages.getTopicIdsWithMessages()
            .length
      )
    )
    .toBeLessThanOrEqual(10);
  expect(
    await page.evaluate(() =>
      (window as any).topicPerformance.messages.getTopicIdsWithMessages()
    )
  ).not.toContain('performance-0');
  await page.context().setOffline(true);
  await resetMetrics(page);
  await page.evaluate(() =>
    (window as any).topicPerformance.navigate('performance-0')
  );
  await expect(message(page, 0)).toBeVisible();
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
});

test('10000 непрочитанных не расширяют запрос и DOM до размера всей истории', async ({
  page
}, testInfo) => {
  const state = await openFixture(page, { count: 10000, unreadCount: 10000 });
  await openTopic(page, 0);
  await expect(message(page, 0, 9999)).toBeVisible();
  await page.waitForTimeout(1600);
  const limits = state.requests
    .filter(url => url.includes('/messages/topic/') && !url.includes('/pinned'))
    .map(url =>
      Number(
        new URL(url.slice(4), 'http://localhost').searchParams.get('limit')
      )
    );
  const result = { limits, ...(await metrics(page)) };
  await saveMetrics(testInfo, 'unread-window.json', result);
  expect(limits.length).toBeGreaterThan(0);
  expect(Math.max(...limits)).toBeLessThanOrEqual(250);
  expect(result.maxMessageNodes).toBeLessThanOrEqual(250);
  expect(state.errors).toEqual([]);
});

test('изменение видимого окна сохраняет контекст, свежие объекты и непрочитанные', async ({
  page
}) => {
  await openFixture(page, { unreadCount: 7 });
  const result = await page.evaluate(
    async rows => {
      const { messages, seed, getSelectedTopic } = (window as any)
        .topicPerformance;
      seed('performance-0', rows);
      const full = messages.getFullMessagesByTopicId('performance-0');
      const unreadBefore = getSelectedTopic('performance-0').unreadMessageCount;
      messages.setVisibleMessagesLimitForTopic('performance-0', 48, {
        allowShrink: true
      });
      const first = messages.getMessagesByTopicId('performance-0');
      for (let i = 0; i < 100; i++)
        messages.setVisibleMessagesLimitForTopic('performance-0', 48);
      const same = first === messages.getMessagesByTopicId('performance-0');
      messages.setVisibleMessagesLimitForTopic('performance-0', 100);
      const expanded = messages.getMessagesByTopicId('performance-0');
      return {
        same,
        fullUnchanged:
          full === messages.getFullMessagesByTopicId('performance-0'),
        first: expanded[0].id,
        last: expanded.at(-1).id,
        count: expanded.length,
        unreadBefore,
        unreadAfter: getSelectedTopic('performance-0').unreadMessageCount
      };
    },
    makeMessages('performance-0', 5000)
  );
  expect(result).toEqual({
    same: true,
    fullUnchanged: true,
    first: 'performance-0-message-4900',
    last: 'performance-0-message-4999',
    count: 100,
    unreadBefore: 7,
    unreadAfter: 7
  });
});

test('всплеск 1000 потребителей истории выполняет только два HTTP-запроса', async ({
  page
}) => {
  const state = await openFixture(page, { delay: 500 });
  const counts = await page.evaluate(async () => {
    const { sdk } = (window as any).topicPerformance;
    const rows = await Promise.all(
      Array.from({ length: 1000 }, (_, index) =>
        index % 2
          ? sdk.getMessages('performance-0', { limit: 48 })
          : sdk.getPinnedMessages('performance-0')
      )
    );
    return rows.reduce((sum, row) => sum + row.length, 0);
  });
  expect(counts).toBe(10000);
  expect(
    state.requests.filter(url => url.includes('/messages/topic/'))
  ).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('длинная история: 5000 сообщений и повторные переходы имеют ограниченный DOM и число запросов', async ({
  page
}, testInfo) => {
  const switchCount = Number(process.env.PERFORMANCE_SWITCHES || 60);
  expect(Number.isSafeInteger(switchCount) && switchCount > 0).toBe(true);
  // Общая длительность растёт с нагрузкой; порог p95 проверяется отдельно.
  test.setTimeout(Math.max(90_000, 30_000 + switchCount * 1000));
  const state = await openFixture(page, { count: 5000 });
  await page.evaluate(
    rows => {
      const { seed } = (window as any).topicPerformance;
      rows.forEach((messages, index) => seed(`performance-${index}`, messages));
    },
    [0, 1, 2].map(index => makeMessages(`performance-${index}`, 5000))
  );
  for (const index of [0, 1, 2]) {
    await openTopic(page, index);
    await expect(message(page, index, 4999)).toBeVisible();
    await page.waitForTimeout(700);
  }
  // Проверяем возвраты внутри интервала свежести; истечение TTL покрыто отдельно.
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now;
  });
  const before = state.requests.length;
  await resetMetrics(page);
  const profiler = process.env.PERFORMANCE_CPU_PROFILE
    ? await page.context().newCDPSession(page)
    : undefined;
  const memorySession = await page.context().newCDPSession(page);
  await memorySession.send('HeapProfiler.collectGarbage');
  const heapBefore = await memorySession.send('Runtime.getHeapUsage');
  const domBefore = await memorySession.send('Memory.getDOMCounters');
  if (profiler) {
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.start');
  }
  const timings = await page.evaluate(async switchCount => {
    const fixture = (window as any).topicPerformance;
    const times: number[] = [];
    for (let index = 0; index < switchCount; index++) {
      const topic = index % 3;
      const started = performance.now();
      fixture.navigate(`performance-${topic}`);
      await new Promise<void>((resolve, reject) => {
        const check = () => {
          const node = document.querySelector(
            `[data-message-id="performance-${topic}-message-4999"]`
          );
          if (
            node?.getBoundingClientRect().height &&
            !document.querySelector(
              '[data-testid="Performance-MessageList-Skeleton"]'
            )
          ) {
            times.push(performance.now() - started);
            resolve();
          } else if (performance.now() - started > 2000)
            reject(new Error('Топик не отрисован за 2 секунды'));
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      });
    }
    return times.sort((a, b) => a - b);
  }, switchCount);
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    await saveMetrics(testInfo, 'topic-switch.cpuprofile', profile);
    await profiler.detach();
  }
  await page.waitForTimeout(800);
  await memorySession.send('HeapProfiler.collectGarbage');
  const heapAfter = await memorySession.send('Runtime.getHeapUsage');
  const domAfter = await memorySession.send('Memory.getDOMCounters');
  if (process.env.PERFORMANCE_HEAP_SNAPSHOT) {
    const chunks: string[] = [];
    memorySession.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) =>
      chunks.push(chunk)
    );
    await memorySession.send('HeapProfiler.takeHeapSnapshot');
    await writeFile(
      testInfo.outputPath('topic-switch.heapsnapshot'),
      chunks.join('')
    );
  }
  await memorySession.detach();
  const result = {
    ...(await metrics(page)),
    switches: switchCount,
    heapBeforeBytes: heapBefore.usedSize,
    heapAfterBytes: heapAfter.usedSize,
    heapGrowthBytes: heapAfter.usedSize - heapBefore.usedSize,
    domBefore,
    domAfter,
    p50: timings[Math.ceil(timings.length * 0.5) - 1],
    p95: timings[Math.ceil(timings.length * 0.95) - 1],
    max: timings.at(-1),
    extraRequests: state.requests.slice(before)
  };
  await saveMetrics(testInfo, 'long-history-performance.json', result);
  expect(result.skeletonFrames).toBe(0);
  expect(result.maxMessageNodes).toBeLessThanOrEqual(250);
  expect(result.p95).toBeLessThan(800);
  expect(result.extraRequests).toEqual([]);
  expect(result.heapGrowthBytes).toBeLessThan(20 * 1024 * 1024);
  expect(domAfter.nodes - domBefore.nodes).toBeLessThan(1000);
  expect(state.errors).toEqual([]);
});
