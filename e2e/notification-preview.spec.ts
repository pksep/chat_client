import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture
} from './fixtures/topic-performance-page';

test('поздний дисковый preview не удаляет новое сообщение из native-кеша', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  const result = await page.evaluate(
    async rows => {
      const shadow = await import('/src/services/useShadowChatSync.ts');
      const messages = await import('/src/services/useMessages.ts');
      const topicId = 'performance-1';
      const userId = 'performance-user';
      const targetId = rows.at(-1)!.id;
      await shadow.saveShadowTopicSnapshot(
        topicId,
        rows.slice(0, -1),
        'local',
        userId,
        { replace: true }
      );
      await messages.hydrateNotificationMessagePreview(
        topicId,
        targetId,
        rows.slice(-20),
        'another-user'
      );
      const otherUserIgnored =
        messages.getMessagesByTopicId(topicId).length === 0;
      const originalGet = IDBObjectStore.prototype.get;
      let release!: () => void;
      let readStarted!: () => void;
      const started = new Promise<void>(resolve => {
        readStarted = resolve;
      });
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      IDBObjectStore.prototype.get = function (...args) {
        const request = originalGet.apply(this, args);
        if (this.name === 'topicPreviews')
          request.addEventListener(
            'success',
            event => {
              event.stopImmediatePropagation();
              const callback = request.onsuccess;
              readStarted();
              void gate.then(() => callback?.call(request, event));
            },
            { once: true }
          );
        return request;
      };
      try {
        const diskRead = messages.hydrateMessagePreviewFromCache(
          topicId,
          userId,
          48
        );
        await started;
        await messages.hydrateNotificationMessagePreview(
          topicId,
          targetId,
          rows.slice(-20),
          userId
        );
        const beforeDisk = messages.getMessagesByTopicId(topicId).at(-1)?.id;
        release();
        await diskRead;
        return {
          otherUserIgnored,
          beforeDisk,
          afterDisk: messages.getMessagesByTopicId(topicId).at(-1)?.id,
          persistedCount: (
            await shadow.loadShadowTopicSnapshot(topicId, userId)
          ).length
        };
      } finally {
        IDBObjectStore.prototype.get = originalGet;
        release();
      }
    },
    makeMessages('performance-1', 100)
  );
  expect(result).toEqual({
    otherUserIgnored: true,
    beforeDisk: 'performance-1-message-99',
    afterDisk: 'performance-1-message-99',
    persistedCount: 99
  });
  expect(errors).toEqual([]);
});

test('уведомление ждёт сеть, но не полное чтение дисковой истории', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Короткий первый кадр используется на мобильном');
  const { errors } = await openFixture(page, { count: 5000 });
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
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const originalGet = IDBObjectStore.prototype.get;
      (window as any).__fullHistoryReadStarted = false;
      IDBObjectStore.prototype.get = function (...args) {
        const request = originalGet.apply(this, args);
        if (this.name === 'topicSnapshots') {
          (window as any).__fullHistoryReadStarted = true;
          request.addEventListener(
            'success',
            event => {
              event.stopImmediatePropagation();
              const callback = request.onsuccess;
              void gate.then(() => callback?.call(request, event));
            },
            { once: true }
          );
        }
        return request;
      };
      (window as any).__releaseHistoryPreviewTest = () => {
        IDBObjectStore.prototype.get = originalGet;
        release();
      };
    },
    makeMessages('performance-1', 5000)
  );
  let releaseNetwork!: () => void;
  const networkGate = new Promise<void>(resolve => {
    releaseNetwork = resolve;
  });
  await page.route('**/performance-api/messages/topic/*?*', async route => {
    await networkGate;
    await route.fallback();
  });
  try {
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-4999')
    );
    await expect
      .poll(() => page.evaluate(() => (window as any).__fullHistoryReadStarted))
      .toBe(true);
    await expect(message(page, 1, 4999)).not.toBeVisible();
    releaseNetwork();
    await expect(message(page, 1, 4999)).toBeVisible();
    await expect(
      page.locator('[data-testid$="-MessageList-Skeleton"]')
    ).toHaveCount(0);
    expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
      72
    );
  } finally {
    releaseNetwork();
    await page.evaluate(() => (window as any).__releaseHistoryPreviewTest());
  }
  // Окно в памяти может остаться коротким; старые сообщения должны сохраниться на диске.
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
    .toBe(5000);
  await expect(message(page, 1, 4999)).toBeVisible();
  expect(errors).toEqual([]);
});
