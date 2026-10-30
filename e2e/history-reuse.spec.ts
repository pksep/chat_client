import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const skeleton = (page: Page) =>
  page.locator('[data-testid$="-MessageList-Skeleton"]');

const observeSkeletons = (page: Page) =>
  page.evaluate(() => {
    (window as any).historyReuseSkeletons = 0;
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('[data-testid$="-MessageList-Skeleton"]') ||
              node.querySelector('[data-testid$="-MessageList-Skeleton"]'))
          )
            (window as any).historyReuseSkeletons++;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

test('готовая история видна до фонового HTTP без единого скелетона', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  const rows = makeMessages('performance-0', 20);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    rows
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let completed = false;
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: rows });
    completed = true;
  });
  await observeSkeletons(page);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0)).toBeInViewport();
    await page.waitForTimeout(350);
    expect(completed).toBe(false);
    await expect(skeleton(page)).toHaveCount(0);
    release();
    await expect.poll(() => completed).toBe(true);
    await page.waitForTimeout(150);
    await expect(message(page, 0)).toBeInViewport();
    expect(
      await page.evaluate(() => (window as any).historyReuseSkeletons)
    ).toBe(0);
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

test('возврат в уже открытый топик не показывает скелетон при медленной сети', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeInViewport();
  await openTopic(page, 1);
  await expect(message(page, 1)).toBeInViewport();
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: makeMessages('performance-0', 20) });
  });
  await observeSkeletons(page);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0)).toBeInViewport();
    await expect(message(page, 1)).toHaveCount(0);
    await page.waitForTimeout(350);
    await expect(skeleton(page)).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).historyReuseSkeletons)
    ).toBe(0);
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

test('готовые непрочитанные позиционируются до первого видимого кадра без скелетона', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true, unreadCount: 60 });
  const rows = makeMessages('performance-0', 140).map((row, index) => ({
    ...row,
    isReadByMe: index < 80
  }));
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    fixture.seed('performance-0', rows);
    fixture.setTopics([
      { ...fixture.getSelectedTopic('performance-0'), lastMessage: rows.at(-1) }
    ]);
    (window as any).historyReuseFrames = [];
    const capture = () => {
      const first = document.querySelector('[data-message-id]');
      if (first && getComputedStyle(first).visibility !== 'hidden') {
        const divider = document.querySelector(
          '.chat__message-unread_messages_start'
        );
        const wrapper = document.querySelector('.chat__message-wrapper');
        (window as any).historyReuseFrames.push(
          divider && wrapper
            ? divider.getBoundingClientRect().top -
                wrapper.getBoundingClientRect().top
            : null
        );
      }
      if ((window as any).historyReuseFrames.length < 3)
        requestAnimationFrame(capture);
    };
    requestAnimationFrame(capture);
  }, rows);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    await route.fulfill({ json: rows });
  });
  await observeSkeletons(page);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 80)).toBeInViewport();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).historyReuseFrames.length)
      )
      .toBe(3);
    const frames = await page.evaluate(
      () => (window as any).historyReuseFrames as (number | null)[]
    );
    for (const y of frames) {
      expect(y).not.toBeNull();
      expect(Math.abs(y! - 8)).toBeLessThan(3);
    }
    expect(
      await page.evaluate(() => (window as any).historyReuseSkeletons)
    ).toBe(0);
    await page
      .getByRole('button', { name: 'Перейти к новым сообщениям', exact: true })
      .click();
    const response = page.waitForResponse('**/messages/topic/performance-0?*');
    release();
    await (await response).finished();
    await page.waitForTimeout(150);
    await expect(
      page.locator('.chat__message-unread_messages_start')
    ).toHaveCount(0);
    await expect(message(page, 0, 139)).toBeInViewport();
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

test('фоновое обновление сохраняет позицию после прокрутки и обновляет текст', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  const rows = makeMessages('performance-0', 140);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    rows
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    const limit = Number(
      new URL(route.request().url()).searchParams.get('limit')
    );
    await route.fulfill({
      json: rows
        .slice(-limit)
        .map(row => ({ ...row, text: `${row.text} обновлено` }))
    });
  });
  await observeSkeletons(page);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 139)).toBeInViewport();
    await page.waitForTimeout(2300);
    const position = await page
      .locator('.chat__message-wrapper')
      .evaluate(wrapper => {
        wrapper.dispatchEvent(
          new WheelEvent('wheel', { deltaY: -100, bubbles: true })
        );
        wrapper.scrollTop = 0;
        wrapper.dispatchEvent(new Event('scroll'));
        const top = wrapper.getBoundingClientRect().top;
        const element = Array.from(
          wrapper.querySelectorAll('[data-message-id]')
        ).find(element => element.getBoundingClientRect().top >= top)!;
        return {
          id: element.getAttribute('data-message-id')!,
          y: element.getBoundingClientRect().top
        };
      });
    release();
    const anchor = page.locator(`[data-message-id="${position.id}"]`).first();
    await expect(message(page, 0, 139)).toContainText('обновлено');
    await page.waitForTimeout(150);
    expect(Math.abs((await anchor.boundingBox())!.y - position.y)).toBeLessThan(
      3
    );
    expect(
      await page.evaluate(() => (window as any).historyReuseSkeletons)
    ).toBe(0);
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});

test('ошибка фонового обновления сохраняет готовые сообщения на экране', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    makeMessages('performance-0', 20)
  );
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ status: 503, json: {} })
  );
  await observeSkeletons(page);
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeInViewport();
  await expect(skeleton(page)).toHaveCount(0);
  await expect(page.locator('.chat__history-refresh-error')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).historyReuseSkeletons)).toBe(
    0
  );
  expect(state.errors).toEqual([]);
});

test('поздний ответ открытия не отменяет переход по цитате', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true });
  const rows = makeMessages('performance-0', 140).map((row, index, messages) =>
    index === 139 ? { ...row, replyMessage: messages[0] } : row
  );
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    rows
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/topic/performance-0?*', async route => {
    await gate;
    const limit = Number(
      new URL(route.request().url()).searchParams.get('limit')
    );
    await route.fulfill({
      json: rows
        .slice(-limit)
        .map(row => ({ ...row, text: `${row.text} обновлено` }))
    });
  });
  await observeSkeletons(page);
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 139)).toBeInViewport();
    await message(page, 0, 139).locator('.message-reference-reply').click();
    const target = message(page, 0, 0);
    await expect(target).toBeInViewport();
    await page.waitForTimeout(400);
    const y = (await target.boundingBox())!.y;
    release();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).topicPerformance.messages
              .getFullMessagesByTopicId('performance-0')
              .at(-1)?.text
        )
      )
      .toContain('обновлено');
    await page.waitForTimeout(150);
    await expect(target).toBeInViewport();
    expect(Math.abs((await target.boundingBox())!.y - y)).toBeLessThan(3);
    expect(
      await page.evaluate(() => (window as any).historyReuseSkeletons)
    ).toBe(0);
  } finally {
    release();
  }
  expect(state.errors).toEqual([]);
});
