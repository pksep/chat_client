import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test('свежая пустая история заменяет кеш и старое последнее сообщение', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    rows => {
      const fixture = (window as any).topicPerformance;
      fixture.seed('performance-0', rows);
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic('performance-0'),
          lastMessage: rows.at(-1)
        }
      ]);
    },
    makeMessages('performance-0', 20)
  );
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: [] })
  );
  await openTopic(page, 0);
  await expect(
    page.locator('[data-testid$="-MessageList-EmptyChat"]')
  ).toBeVisible();
  await expect(page.locator('[data-message-id]')).toHaveCount(0);
  await expect(
    page.locator('[data-testid$="-MessageList-Skeleton"]')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

for (const cacheSource of ['память', 'IndexedDB']) {
  test(`онлайн: устаревший кеш скрыт до свежей истории, первый кадр у непрочитанных: ${cacheSource}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true, unreadCount: 60 });
    const rows = makeMessages('performance-0', 140).map((row, index) => ({
      ...row,
      isReadByMe: index < 80
    }));
    await page.evaluate(
      async ({ rows, cacheSource, lastMessage }) => {
        const fixture = (window as any).topicPerformance;
        fixture.setTopics([
          { ...fixture.getSelectedTopic('performance-0'), lastMessage }
        ]);
        if (cacheSource === 'память') fixture.seed('performance-0', rows);
        else
          await fixture.shadow.saveShadowTopicSnapshot(
            'performance-0',
            rows,
            'local',
            'performance-user',
            { replace: true }
          );
      },
      {
        rows: makeMessages('performance-0', 20),
        cacheSource,
        lastMessage: rows.at(-1)
      }
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      const params = new URL(route.request().url()).searchParams;
      await route.fulfill({
        json:
          params.get('newMessages') === 'true'
            ? rows.slice(-50)
            : rows.slice(60)
      });
    });
    try {
      await openTopic(page, 0);
      await expect(
        page.locator('[data-testid$="-MessageList-Skeleton"]')
      ).toBeVisible();
      await expect(page.locator('[data-message-id]')).toHaveCount(0);
      await page.evaluate(() => {
        (window as any).historyEntryFrames = [];
        const capture = () => {
          const first = document.querySelector('[data-message-id]');
          if (first && getComputedStyle(first).visibility !== 'hidden') {
            const divider = document.querySelector(
              '.chat__message-unread_messages_start'
            );
            const wrapper = document.querySelector('.chat__message-wrapper');
            const y =
              divider && wrapper
                ? divider.getBoundingClientRect().top -
                  wrapper.getBoundingClientRect().top
                : null;
            (window as any).historyEntryFrames.push(y);
          }
          if ((window as any).historyEntryFrames.length < 3)
            requestAnimationFrame(capture);
        };
        requestAnimationFrame(capture);
      });
      release();
      const divider = page.locator('.chat__message-unread_messages_start');
      await expect(divider).toBeInViewport();
      await expect(message(page, 0, 80)).toBeInViewport();
      await expect(message(page, 0, 19)).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).historyEntryFrames.length)
        )
        .toBe(3);
      const positions = await page.evaluate(
        () => (window as any).historyEntryFrames as (number | null)[]
      );
      for (const y of positions) {
        expect(y).not.toBeNull();
        expect(Math.abs(y! - 8)).toBeLessThan(3);
      }
      await page
        .getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
        .click();
      await expect(message(page, 0, 139)).toBeInViewport();
      await expect(divider).toHaveCount(0);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(divider).toHaveCount(0);
    } finally {
      release();
    }
    expect(state.errors).toEqual([]);
  });
}

test('ошибка онлайн не показывает старый кеш, повтор получает свежую историю', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    ({ rows, lastMessage }) => {
      const fixture = (window as any).topicPerformance;
      fixture.seed('performance-0', rows);
      fixture.setTopics([
        { ...fixture.getSelectedTopic('performance-0'), lastMessage }
      ]);
    },
    {
      rows: makeMessages('performance-0', 20),
      lastMessage: makeMessages('performance-0', 21).at(-1)
    }
  );
  let failed = true;
  await page.route('**/messages/topic/performance-0?*', route =>
    failed
      ? route.fulfill({ status: 503, json: { message: 'Недоступно' } })
      : route.fulfill({ json: makeMessages('performance-0', 21).slice(-1) })
  );
  await openTopic(page, 0);
  await expect(
    page.getByText('Не удалось обновить сообщения', { exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-message-id]')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(message(page, 0, 20)).toBeInViewport();
  await expect(message(page, 0, 19)).toHaveCount(0);
  expect(state.errors).toEqual([]);
});
