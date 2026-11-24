import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

for (const type of ['DM', 'GROUP']) {
  test(`короткий кеш ${type} сразу внизу, пока загружается полная история`, async ({
    page
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 860 });
    const state = await openFixture(page, { shell: true });
    const rows = makeMessages('performance-0', 40);
    await page.evaluate(
      ({ rows, type }) => {
        const fixture = (window as any).topicPerformance;
        fixture.seed('performance-0', rows.slice(-2));
        fixture.setTopics([
          {
            ...fixture.getSelectedTopic('performance-0'),
            type,
            lastMessage: rows.at(-1),
            info: { unreadCount: 0 }
          }
        ]);
        const samples: number[] = [];
        (window as any).loadingAlignment = { samples, stopped: false };
        const capture = () => {
          const last = document.querySelector<HTMLElement>(
            '.message[data-message-id="performance-0-message-39"]'
          );
          const wrapper = document.querySelector('.chat__message-wrapper');
          if (
            last &&
            wrapper &&
            last.checkVisibility({ checkVisibilityCSS: true })
          )
            samples.push(
              wrapper.getBoundingClientRect().bottom -
                last.getBoundingClientRect().bottom
            );
          if (!(window as any).loadingAlignment.stopped)
            requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      },
      { rows, type }
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      await route.fulfill({ json: rows });
    });
    try {
      await openTopic(page, 0);
      await expect(page.locator('.message[data-message-id]')).toHaveCount(2);
      await expect(message(page, 0, 39)).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).loadingAlignment.samples.length)
        )
        .toBeGreaterThan(2);
      const gaps = await page.evaluate(() => [
        ...(window as any).loadingAlignment.samples
      ]);
      expect(
        Math.max(...gaps),
        'Короткий кеш не должен начинаться вверху'
      ).toBeLessThan(25);
      release();
      await expect(message(page, 0, 38)).toBeInViewport();
      await expect
        .poll(() => page.locator('.message[data-message-id]').count())
        .toBeGreaterThan(2);
      const wrapper = page.locator('.chat__message-wrapper');
      expect(
        await wrapper.evaluate(
          element => element.scrollHeight - element.clientHeight
        )
      ).toBeGreaterThan(200);
      await wrapper.evaluate(element => {
        element.scrollTop = 0;
        element.dispatchEvent(new Event('scroll'));
      });
      await expect
        .poll(() => wrapper.evaluate(element => element.scrollTop))
        .toBe(0);
      await expect(message(page, 0, 0)).toBeInViewport();
      expect(state.errors).toEqual([]);
    } finally {
      release();
      await page.evaluate(() => {
        (window as any).loadingAlignment.stopped = true;
      });
    }
  });
}
