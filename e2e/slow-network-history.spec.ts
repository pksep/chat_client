import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, 'Проверки мобильного открытия сохранённой истории');
});

for (const cacheSource of ['память', 'IndexedDB']) {
  test(`офлайн: локальная история видна с первого кадра открытого топика: ${cacheSource}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true });
    await openTopic(page, 1);
    await expect(message(page, 1)).toBeVisible();
    await page.evaluate(
      async ({ rows, cacheSource }) => {
        const fixture = (window as any).topicPerformance;
        if (cacheSource === 'память')
          fixture.messages.saveMessagesToLocal('performance-0', rows);
        else
          await fixture.shadow.saveShadowTopicSnapshot(
            'performance-0',
            rows,
            'local',
            'performance-user',
            { replace: true }
          );
        fixture.back();
      },
      { rows: makeMessages('performance-0', 20), cacheSource }
    );
    await page.context().setOffline(true);
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      await route.fulfill({ json: makeMessages('performance-0', 21) });
    });
    await page.evaluate(() => {
      const probe = { emptyFrames: 0, contentFrames: 0 };
      (window as any).__residentTopicProbe = probe;
      document
        .querySelector('li[data-topic-id="performance-0"] .contact-list__item')!
        .addEventListener(
          'click',
          () => {
            const capture = () => {
              const wrapper = document.querySelector(
                '.chat__mobile-route-view--messages'
              );
              if (wrapper) {
                const message = wrapper.querySelector(
                  '[data-message-id^="performance-0-message-"]'
                );
                if (message && message.getBoundingClientRect().height > 0)
                  probe.contentFrames++;
                else probe.emptyFrames++;
              }
              if (probe.contentFrames < 3) requestAnimationFrame(capture);
            };
            requestAnimationFrame(capture);
          },
          { once: true }
        );
    });
    try {
      await page
        .locator('li[data-topic-id="performance-0"] .contact-list__item')
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).__residentTopicProbe.contentFrames
          )
        )
        .toBe(3);
      expect(
        await page.evaluate(
          () => (window as any).__residentTopicProbe.emptyFrames
        )
      ).toBe(0);
      await expect(message(page, 1)).toHaveCount(0);
    } finally {
      release();
    }
    await expect(message(page, 0, 19)).toBeVisible();
    expect(state.errors).toEqual([]);
  });
}

test('онлайн: скелетон скрывает кеш до HTTP, свежий ответ заменяет удалённые сообщения', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  const saved = makeMessages('performance-0', 20);
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    await fixture.shadow.saveShadowTopicSnapshot(
      'performance-0',
      rows,
      'local',
      'performance-user',
      { replace: true }
    );
    (window as any).savedHistoryReadCalls = 0;
    fixture.sdk.markMessagesAsRead = async () => {
      (window as any).savedHistoryReadCalls++;
    };
  }, saved);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let historyRequests = 0;
  await page.route('**/messages/topic/performance-0?*', async route => {
    historyRequests++;
    await gate;
    await route.fulfill({
      json: makeMessages('performance-0', 21).filter((_, index) => index !== 19)
    });
  });
  try {
    await openTopic(page, 0);
    await expect(
      page.locator('[data-testid$="-MessageList-Skeleton"]')
    ).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).savedHistoryReadCalls)
    ).toBe(0);
  } finally {
    release();
  }
  await expect(message(page, 0, 20)).toBeVisible();
  await expect(message(page, 0, 19)).toHaveCount(0);
  expect(historyRequests).toBe(1);
  expect(state.errors).toEqual([]);
});

test('онлайн: смена чата во время скелетона защищена от позднего HTTP', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    async rows => {
      await (window as any).topicPerformance.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
    },
    makeMessages('performance-0', 20)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 21) });
  });
  try {
    await openTopic(page, 0);
    await expect(
      page.locator('[data-testid$="-MessageList-Skeleton"]')
    ).toBeVisible();
    await openTopic(page, 1);
    await expect(message(page, 1)).toBeVisible();
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).topicPerformance.messages.getFullMessagesByTopicId(
            'performance-0'
          ).length
      )
    )
    .toBe(21);
  await expect(message(page, 1)).toBeVisible();
  await expect(page.locator('[data-message-id^="performance-0-"]')).toHaveCount(
    0
  );
  expect(state.errors).toEqual([]);
});

test('быстрый HTTP не ждёт медленного outbox и не читает старый preview', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.getAll;
    let complete = () => {};
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = original.apply(this, args);
      if (this.name === 'pendingUploadMeta') {
        Object.defineProperty(request, 'onsuccess', {
          set(handler) {
            request.addEventListener('success', event => {
              complete = () => handler.call(request, event);
            });
          }
        });
      }
      return request;
    };
    (window as any).restoreOutboxRead = () => {
      IDBObjectStore.prototype.getAll = original;
      complete();
    };
  });
  try {
    await openTopic(page, 0);
    await expect(message(page, 0)).toBeVisible({ timeout: 1800 });
  } finally {
    await page.evaluate(() => (window as any).restoreOutboxRead());
  }
  expect(state.errors).toEqual([]);
});

test('чтение свежей истории не сбрасывает прокрутку при фоновом обновлении', async ({
  page
}) => {
  await openFixture(page, { shell: true });
  await page.evaluate(
    async rows => {
      await (window as any).topicPerformance.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
    },
    makeMessages('performance-0', 48)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let historyRequests = 0;
  await page.route('**/messages/topic/performance-0?*', async route => {
    if (++historyRequests === 1)
      return route.fulfill({ json: makeMessages('performance-0', 48) });
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 50) });
  });
  let before: { id: string; top: number };
  const viewport = page.locator('.chat__message-wrapper').last();
  const visibleAnchor = () =>
    viewport.evaluate(wrapper => {
      const bounds = wrapper.getBoundingClientRect();
      const node = Array.from(
        wrapper.querySelectorAll<HTMLElement>('[data-message-id]')
      ).find(
        item =>
          item.getBoundingClientRect().top >= bounds.top &&
          item.getBoundingClientRect().bottom <= bounds.bottom
      )!;
      return {
        id: node.dataset.messageId!,
        top: node.getBoundingClientRect().top
      };
    });
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 47)).toBeVisible({ timeout: 1800 });
    await viewport.evaluate(wrapper => {
      wrapper.dispatchEvent(new Event('touchmove', { bubbles: true }));
      wrapper.scrollTop = Math.max(0, wrapper.scrollTop - 350);
      wrapper.dispatchEvent(new Event('scroll'));
    });
    before = await visibleAnchor();
    await page.evaluate(() => {
      void (window as any).topicPerformance.messages.fetchMessagesForTopic(
        'performance-0',
        {
          forceRefresh: true,
          forceNetwork: true,
          limit: 50
        }
      );
    });
  } finally {
    release();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).topicPerformance.messages.getFullMessagesByTopicId(
            'performance-0'
          ).length
      )
    )
    .toBe(50);
  await expect.poll(visibleAnchor).toEqual(before!);
});

test('поздний preview не возвращает историю, которую сервер уже очистил', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    async rows => {
      await (window as any).topicPerformance.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
      const original = IDBObjectStore.prototype.get;
      let complete = () => {};
      IDBObjectStore.prototype.get = function (...args) {
        const request = original.apply(this, args);
        if (this.name === 'topicPreviews') {
          Object.defineProperty(request, 'onsuccess', {
            set(handler) {
              request.addEventListener('success', event => {
                (window as any).previewReadWaiting = true;
                complete = () => handler.call(request, event);
              });
            }
          });
        }
        return request;
      };
      (window as any).releaseOldPreview = () => {
        IDBObjectStore.prototype.get = original;
        complete();
      };
    },
    makeMessages('performance-0', 20)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: [] });
  });
  await page.evaluate(() => {
    void (
      window as any
    ).topicPerformance.messages.hydrateMessagePreviewFromCache(
      'performance-0',
      'performance-user',
      24
    );
  });
  try {
    await openTopic(page, 0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).previewReadWaiting === true)
      )
      .toBe(true);
    release();
    await expect(
      page.locator('[data-testid$="-MessageList-EmptyChat"]')
    ).toBeVisible();
    await page.evaluate(async () => {
      (window as any).releaseOldPreview();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
    });
    await expect(page.locator('[data-message-id]')).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        (window as any).topicPerformance.messages.getFullMessagesByTopicId(
          'performance-0'
        )
      )
    ).toEqual([]);
  } finally {
    release();
    await page.evaluate(() => (window as any).releaseOldPreview());
  }
  expect(state.errors).toEqual([]);
});

test('свежий ответ истории сохраняет локальную отправку', async ({ page }) => {
  await openFixture(page, { shell: true });
  await page.evaluate(
    async rows => {
      const fixture = (window as any).topicPerformance;
      await fixture.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
      fixture.seed('performance-0', [
        {
          ...rows.at(-1),
          id: 'pending-local-message',
          clientId: 'pending-local-message',
          ex: JSON.stringify({ clientId: 'pending-local-message' }),
          senderUserId: 'performance-user',
          status: 'WAIT',
          text: 'Локальная отправка',
          createdAt: '2026-09-02T00:00:00.000Z'
        }
      ]);
    },
    makeMessages('performance-0', 20)
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
    await expect(
      page.locator('[data-testid$="-MessageList-Skeleton"]')
    ).toBeVisible();
    release();
    await expect(message(page, 0)).toBeVisible({ timeout: 1800 });
    await expect(
      page.locator('[data-message-id="pending-local-message"]')
    ).toBeVisible();
    await expect(page.locator('[data-message-id]')).toHaveCount(21);
  } finally {
    release();
  }
  await expect(page.locator('[data-message-id]')).toHaveCount(21);
});

test('офлайн: старый кеш без preview открывается коротким окном', async ({
  page
}) => {
  await openFixture(page, { shell: true });
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeVisible();
  await page.evaluate(() => (window as any).topicPerformance.back());
  await page.evaluate(
    async rows => {
      await (window as any).topicPerformance.shadow.saveShadowTopicSnapshot(
        'performance-0',
        rows,
        'local',
        'performance-user',
        { replace: true }
      );
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('chat-sync-shadow-db', 3);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('topicPreviews', 'readwrite');
          transaction
            .objectStore('topicPreviews')
            .delete('performance-user:performance-0');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    makeMessages('performance-0', 1000)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 20) });
  });
  await page.context().setOffline(true);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 999)).toBeVisible({ timeout: 1800 });
    expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
      72
    );
  } finally {
    release();
  }
  await expect(message(page, 0, 999)).toBeVisible();
});
