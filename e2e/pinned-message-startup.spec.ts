import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

for (const { delayMs, targetInCache } of [
  { delayMs: 0, targetInCache: true },
  { delayMs: 2200, targetInCache: true },
  { delayMs: 0, targetInCache: false }
]) {
  test(`закреплённое сообщение сохраняет позицию после начальной загрузки: задержка ${delayMs} мс, цель в кеше ${targetInCache}`, async ({
    page
  }) => {
    const state = await openFixture(page, {
      shell: true,
      count: 120,
      pinOutsideHistory: true
    });
    await openTopic(page, 1);
    await expect(message(page, 1, 119)).toBeInViewport();

    await page.evaluate(
      rows => {
        (window as any).topicPerformance.seed('performance-0', rows);
      },
      makeMessages('performance-0', 120).slice(targetInCache ? 0 : 60)
    );

    let releaseHistory!: () => void;
    const historyGate = new Promise<void>(resolve => {
      releaseHistory = resolve;
    });
    await page.route('**/messages/topic/performance-0?*', async route => {
      await historyGate;
      const limit = Number(
        new URL(route.request().url()).searchParams.get('limit')
      );
      await route.fulfill({
        json: makeMessages('performance-0', 120).slice(-limit)
      });
    });

    let releaseContext = () => {};
    if (!targetInCache) {
      const contextGate = new Promise<void>(resolve => {
        releaseContext = resolve;
      });
      await page.route(
        '**/messages/performance-0-message-0/around*',
        async route => {
          await contextGate;
          await route.fulfill({ json: makeMessages('performance-0', 30) });
        }
      );
    }

    try {
      await openTopic(page, 0);
      await expect(page.getByTestId('Pinned-Messages')).toBeVisible();
      if (delayMs) await page.waitForTimeout(delayMs);
      await page
        .getByTestId('Pinned-Messages')
        .locator('.chat__input__action__blog')
        .click();
      if (!targetInCache) {
        await expect(message(page, 0, 0)).not.toBeAttached();
        releaseContext();
      }
      await expect(message(page, 0, 0)).toBeInViewport();

      const historyResponse = page.waitForResponse(response =>
        /\/messages\/topic\/performance-0\?/.test(response.url())
      );
      releaseHistory();
      await historyResponse;
      await page.waitForTimeout(1000);

      await expect(message(page, 0, 0)).toBeInViewport();
      if (!targetInCache) {
        await expect(message(page, 0, 29)).toBeAttached();
        await page.waitForTimeout(300);
        await expect(message(page, 0, 0)).toBeInViewport();
      }
      expect(state.errors).toEqual([]);
    } finally {
      releaseHistory();
      releaseContext();
    }
  });
}
