import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  metrics,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test('первое открытие не подменяет историю одним сообщением из списка', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true, unreadCount: 20 });
  const rows = makeMessages('performance-0', 20).map(row => ({
    ...row,
    isReadByMe: false,
    status: 'DELIVERED'
  }));
  await page.evaluate(row => {
    (window as any).topicPerformance.updateLocalLastMessageTopic(
      row.topicId,
      row
    );
    (window as any).previewReadCalls = 0;
    (window as any).topicPerformance.sdk.markMessagesAsRead = async () => {
      (window as any).previewReadCalls++;
    };
  }, rows.at(-1)!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let historyRequests = 0;
  await page.route('**/messages/topic/performance-0?*', async route => {
    historyRequests++;
    await gate;
    await route.fulfill({ json: rows });
  });
  try {
    await openTopic(page, 0);
    await expect(page.locator('.chat__input')).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(0);
    await expect(
      page.locator('[data-testid$="-MessageList-Skeleton"]')
    ).toBeVisible({ timeout: 1000 });
    expect(await page.evaluate(() => (window as any).previewReadCalls)).toBe(0);
    expect(
      await page.evaluate(() => {
        const { messages } = (window as any).topicPerformance;
        return messages.getFullMessagesByTopicId('performance-0').length;
      })
    ).toBe(0);
    await expect(page.locator('.chat__message-bubble[inert]')).toHaveCount(0);
    expect(
      state.requests.filter(url => /(?:\/read|read-status)/.test(url))
    ).toEqual([]);
    expect(historyRequests).toBe(1);
  } finally {
    release();
  }
  await expect(page.locator('[data-message-id]')).toHaveCount(20);
  await expect(page.locator('.chat__message-bubble[inert]')).toHaveCount(0);
  expect(historyRequests).toBe(1);
  expect(state.errors).toEqual([]);
});

test('30 первых открытий: скелетон без одиночного превью, один запрос истории на топик', async ({
  page
}) => {
  test.setTimeout(90_000);
  const state = await openFixture(page, {
    shell: true,
    topicCount: 30,
    delay: 450
  });
  await page.evaluate(
    rows => {
      for (const row of rows)
        (window as any).topicPerformance.updateLocalLastMessageTopic(
          row.topicId,
          row
        );
    },
    Array.from(
      { length: 30 },
      (_, index) => makeMessages(`performance-${index}`, 20).at(-1)!
    )
  );
  for (let index = 0; index < 30; index++) {
    await openTopic(page, index);
    await expect(message(page, index)).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(20);
    await expect(page.locator('.chat__message-bubble[inert]')).toHaveCount(0);
    await page.evaluate(() => (window as any).topicPerformance.back());
  }
  expect((await metrics(page)).skeletonFrames).toBeGreaterThan(0);
  expect(
    state.requests.filter(url =>
      /\/messages\/topic\/performance-\d+\?/.test(url)
    )
  ).toHaveLength(30);
  expect(state.errors).toEqual([]);
  expect(state.failures).toEqual([]);
});

test('готовая сетевая история отображается до медленного восстановления вложений из кеша', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    let released = false;
    (window as any).releasePendingHistory = () => {};
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'pendingUploadMeta') {
        Object.defineProperty(request, 'onsuccess', {
          set(handler) {
            request.addEventListener('success', event => {
              (window as any).releasePendingHistory = () =>
                handler.call(request, event);
              if (released) (window as any).releasePendingHistory();
            });
          }
        });
      }
      return request;
    };
    (window as any).restoreHistoryReads = () => {
      released = true;
      IDBObjectStore.prototype.getAll = original;
      (window as any).releasePendingHistory();
    };
  });
  try {
    await openTopic(page, 0);
    await expect(message(page, 0)).toBeVisible({ timeout: 5000 });
    expect((await metrics(page)).skeletonFrames).toBe(0);
  } finally {
    await page.evaluate(() => (window as any).restoreHistoryReads());
  }
  expect(
    state.requests.filter(url => /\/messages\/topic\/performance-0\?/.test(url))
  ).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

test('сохранённое окно группы показывает сообщения, аватар и реакции до медленных служебных чтений и HTTP', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  const rows = makeMessages('performance-1', 20).map((row, index) => ({
    ...row,
    senderUser: {
      ...row.senderUser,
      initials: 'Кэш Автор',
      avatarUrl:
        'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>'
    },
    reactions:
      index === 19
        ? [
            {
              id: 'cached-reaction',
              text: '👍',
              senderUserId: 'performance-user',
              messageId: row.id,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              deletedAt: null
            }
          ]
        : []
  }));
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    const topic = fixture.getSelectedTopic('performance-1');
    topic.type = 'GROUP';
    topic.members = [rows[0].senderUser];
    topic.lastMessage = {
      ...rows.at(-1),
      senderUser: undefined,
      reactions: undefined
    };
    const shadow = await import('/src/services/useShadowChatSync.ts');
    await shadow.saveShadowTopicSnapshot(
      'performance-1',
      rows,
      'local',
      'performance-user',
      { replace: true }
    );
    const original = IDBObjectStore.prototype.getAll;
    const pending: (() => void)[] = [];
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'pendingUploadMeta') {
        Object.defineProperty(request, 'onsuccess', {
          set(handler) {
            request.addEventListener('success', event =>
              pending.push(() => handler.call(request, event))
            );
          }
        });
      }
      return request;
    };
    (window as any).releaseCachedGroupMetadata = () => {
      IDBObjectStore.prototype.getAll = original;
      pending.splice(0).forEach(release => release());
    };
  }, rows);
  let releaseNetwork!: () => void;
  const networkGate = new Promise<void>(resolve => {
    releaseNetwork = resolve;
  });
  await page.route('**/messages/topic/performance-1?*', async route => {
    await networkGate;
    await route.fulfill({ json: rows });
  });
  try {
    await openTopic(page, 1);
    await expect(
      page.locator('[data-message-id^="performance-1-"]')
    ).toHaveCount(20);
    await expect(
      page.locator(
        '[data-message-id="performance-1-message-19"] .message-reactions-row'
      )
    ).toBeVisible();
    await expect(
      page
        .locator('.message-group__avatar img[src^="data:image/svg+xml"]')
        .first()
    ).toBeVisible();
    await expect(
      page.locator('[data-message-id^="performance-0-"]')
    ).toHaveCount(0);
    expect((await metrics(page)).skeletonFrames).toBe(0);
  } finally {
    await page.evaluate(() => (window as any).releaseCachedGroupMetadata());
    releaseNetwork();
  }
  expect(state.errors).toEqual([]);
});

test('HTTP выбранного чата начинается до завершения чтения локальных прочтений', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get;
    const pending: (() => void)[] = [];
    let released = false;
    IDBObjectStore.prototype.get = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'readStates') {
        Object.defineProperty(request, 'onsuccess', {
          set(handler) {
            request.addEventListener('success', event => {
              if (released) handler.call(request, event);
              else pending.push(() => handler.call(request, event));
            });
          }
        });
      }
      return request;
    };
    (window as any).releaseReadStates = () => {
      released = true;
      IDBObjectStore.prototype.get = original;
      pending.splice(0).forEach(release => release());
    };
  });
  try {
    await openTopic(page, 0);
    await expect
      .poll(
        () =>
          state.requests.filter(url =>
            /\/messages\/topic\/performance-0\?/.test(url)
          ).length
      )
      .toBe(1);
  } finally {
    await page.evaluate(() => (window as any).releaseReadStates());
  }
  await expect(message(page, 0)).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('быстрая смена первого топика не показывает превью или ответ предыдущего', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    rows => {
      for (const row of rows)
        (window as any).topicPerformance.updateLocalLastMessageTopic(
          row.topicId,
          row
        );
    },
    [
      makeMessages('performance-0', 20).at(-1)!,
      makeMessages('performance-1', 20).at(-1)!
    ]
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 20) });
  });
  try {
    await openTopic(page, 0);
    await expect(page.locator('.chat__input')).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(0);
    await openTopic(page, 1);
    await expect(message(page, 1)).toBeVisible();
  } finally {
    release();
  }
  await page.waitForTimeout(500);
  await expect(page.locator('[data-message-id^="performance-0-"]')).toHaveCount(
    0
  );
  await expect(page.locator('[data-message-id]')).toHaveCount(20);
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(state.errors).toEqual([]);
});

test('после смены маршрута ни один кадр не содержит сообщения предыдущего топика', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true, delay: 600 });
  await page.evaluate(
    rowsByTopic => {
      const fixture = (window as any).topicPerformance;
      fixture.seed('performance-0', rowsByTopic[0]);
      fixture.seed('performance-1', rowsByTopic[1]);
    },
    [makeMessages('performance-0', 20), makeMessages('performance-1', 20)]
  );
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();

  const samples = await page.evaluate(async () => {
    const frames: string[][] = [];
    const fixture = (window as any).topicPerformance;
    const finished = new Promise<string[][]>(resolve => {
      const startedAt = performance.now();
      const sample = () => {
        if (location.pathname.endsWith('/performance-1')) {
          frames.push(
            Array.from(
              document.querySelectorAll<HTMLElement>('[data-message-id]')
            )
              .map(element => element.dataset.messageId || '')
              .filter(Boolean)
          );
        }
        if (performance.now() - startedAt < 800) requestAnimationFrame(sample);
        else resolve(frames);
      };
      requestAnimationFrame(sample);
    });
    fixture.navigate('performance-1');
    return finished;
  });

  expect(samples.length).toBeGreaterThan(0);
  expect(samples.flat().some(id => id.startsWith('performance-0-'))).toBe(
    false
  );
  await expect(message(page, 1)).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('удалённое или чужое последнее сообщение не используется как превью', async ({
  page
}) => {
  await openFixture(page, { shell: true, delay: 800 });
  await page.evaluate(
    rows => {
      const { getSelectedTopic } = (window as any).topicPerformance;
      getSelectedTopic('performance-0').lastMessage = {
        ...rows[0],
        deletedAt: new Date().toISOString()
      };
      getSelectedTopic('performance-1').lastMessage = rows[0];
    },
    makeMessages('performance-0', 20)
  );
  for (const index of [0, 1]) {
    await openTopic(page, index);
    await expect(page.locator('.chat__message-bubble[inert]')).toHaveCount(0);
    await expect(message(page, index)).toBeVisible();
  }
});

test('ранний ответ истории прежней сессии не попадает в новую', async ({
  page
}) => {
  await openFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let started = false;
  await page.route('**/messages/topic/performance-0?*', async route => {
    started = true;
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 20) });
  });
  const result = page.evaluate(async () => {
    return (window as any).topicPerformance.messages.fetchMessagesForTopic(
      'performance-0',
      {
        limit: 20,
        forceRefresh: true,
        forceNetwork: true,
        allowStaleFallback: false
      }
    );
  });
  try {
    await expect.poll(() => started).toBe(true);
    await page.evaluate(async () => {
      const { initializeChat } = (window as any).topicPerformance;
      await initializeChat({
        userId: 'second-user',
        token: 'second-session',
        apiUrl: `${location.origin}/performance-api`,
        wsUrl: 'ws://127.0.0.1:65530'
      });
    });
  } finally {
    release();
  }
  expect(await result).toEqual([]);
  expect(
    await page.evaluate(() =>
      (window as any).topicPerformance.messages.getFullMessagesByTopicId(
        'performance-0'
      )
    )
  ).toEqual([]);
});
