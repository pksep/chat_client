import { test, expect } from '@playwright/test';
import {
  openFixture,
  makeMessages,
  message,
  metrics,
  resetMetrics
} from './fixtures/topic-performance-page';

test('повторное уведомление открытого чата ограничивает длинное окно и сохраняет кеш при HTTP 503', async ({
  page,
  isMobile
}) => {
  const { errors } = await openFixture(page, { count: 500 });
  await page.evaluate(
    rows => {
      (window as any).topicPerformance.seed('performance-1', rows);
      (window as any).topicPerformance.notify(1, 'performance-1-message-499');
    },
    makeMessages('performance-1', 500)
  );
  await expect(message(page, 1, 499)).toBeVisible();
  await page.waitForTimeout(350);
  await page.route('**/performance-api/messages/topic/*?*', async route => {
    await new Promise(resolve => setTimeout(resolve, 700));
    await route.fulfill({
      status: 503,
      json: { message: 'Тестовая недоступность' }
    });
  });
  await resetMetrics(page);
  await page.evaluate(() => {
    (window as any).topicPerformance.messages.setVisibleMessagesLimitForTopic(
      'performance-1',
      500
    );
  });
  await expect
    .poll(() => page.locator('[data-message-id]').count())
    .toBeGreaterThan(250);
  await page.evaluate(() =>
    (window as any).topicPerformance.notify(1, 'performance-1-message-499')
  );
  await expect(message(page, 1, 499)).toBeVisible();
  expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
    isMobile ? 72 : 250
  );
  await page.waitForTimeout(900);
  await expect(message(page, 1, 499)).toBeVisible();
  expect((await metrics(page)).skeletonFrames).toBe(0);
  expect(errors).toEqual([]);
});

test('поздний ответ первого уведомления не меняет чат последнего уведомления', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let firstStarted = false;
  await page.route(
    '**/performance-api/messages/topic/performance-1?*',
    async route => {
      firstStarted = true;
      await gate;
      await route.fallback();
    }
  );
  try {
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-19')
    );
    await expect.poll(() => firstStarted).toBe(true);
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(2, 'performance-2-message-19')
    );
    await expect(message(page, 2)).toBeVisible();
  } finally {
    release();
  }
  await page.waitForTimeout(400);
  await expect(page).toHaveURL(/dialogs\/performance-2/);
  await expect(message(page, 2)).toBeVisible();
  expect(
    await page.locator('[data-message-id^="performance-1-"]').count()
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('уведомление ждёт свежую страницу даже при полном кеше и ограничивает DOM', async ({
  page,
  isMobile
}) => {
  const { requests, errors } = await openFixture(page, { count: 5000 });
  await page.evaluate(
    rows => {
      (window as any).topicPerformance.seed('performance-1', rows);
    },
    makeMessages('performance-1', 5000)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let networkStarted = false;
  await page.route('**/performance-api/messages/topic/*?*', async route => {
    networkStarted = true;
    await gate;
    await route.fallback();
  });
  await resetMetrics(page);
  try {
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-4999')
    );
    await expect.poll(() => networkStarted).toBe(true);
    await expect(message(page, 1, 4999)).not.toBeVisible();
    expect(
      await page.evaluate(
        () =>
          performance.getEntriesByName('chat-notification:message-painted')
            .length
      )
    ).toBe(0);
  } finally {
    release();
  }
  await expect
    .poll(
      () => requests.filter(path => path.includes('newMessages=true')).length
    )
    .toBe(1);
  await expect(message(page, 1, 4999)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            performance
              .getEntriesByName('chat-notification:message-painted')
              .at(-1) as PerformanceMark | undefined
          )?.detail?.messageId
      )
    )
    .toBe('performance-1-message-4999');
  expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
    isMobile ? 72 : 250
  );
  await page.waitForTimeout(350);
  expect(requests.filter(path => path.includes('/around'))).toHaveLength(0);
  expect(errors).toEqual([]);
});

for (const cachedCount of [100, 115]) {
  test(`уведомление из середины 30 новых сообщений: первый кадр актуален, кеш ${cachedCount}`, async ({
    page,
    isMobile
  }) => {
    const { requests, errors } = await openFixture(page, {
      shell: true,
      count: 130
    });
    await page.evaluate(() => {
      const container = document.getElementById('app')!;
      container.id = 'chat-container-image';
      const header = document.createElement('header');
      header.className = 'chat__header';
      const profile = document.createElement('span');
      profile.className = 'chat__header-profile';
      profile.textContent = 'Топик 1';
      header.append(profile);
      container.prepend(header);
      const shell = document.createElement('div');
      shell.id = 'startup-shell';
      shell.style.cssText =
        'position:fixed;inset:0;z-index:9999;background:white';
      document.body.append(shell);
      window.addEventListener(
        'chat:notification-topic-shell-ready',
        () => shell.remove(),
        { once: true }
      );
    });
    await page.evaluate(
      rows => {
        (window as any).topicPerformance.seed('performance-1', rows);
      },
      makeMessages('performance-1', cachedCount)
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let networkStarted = false;
    await page.route('**/performance-api/messages/topic/*?*', async route => {
      networkStarted = true;
      await gate;
      await route.fallback();
    });
    try {
      if (isMobile) {
        await page.evaluate(async () => {
          const messages = await import('/src/services/useMessages.ts');
          messages.prefetchNotificationHistory(
            'performance-1',
            'performance-1-message-114'
          );
        });
        await expect.poll(() => networkStarted).toBe(true);
      }
      await page.evaluate(() => {
        (window as any).firstNotificationMessageFrame = null;
        const capture = () => {
          const ids = [
            ...document.querySelectorAll<HTMLElement>('[data-message-id]')
          ]
            .filter(node => {
              const bounds = node.getBoundingClientRect();
              return (
                !document.getElementById('startup-shell') &&
                bounds.height > 0 &&
                bounds.bottom > 0 &&
                bounds.top < innerHeight &&
                getComputedStyle(node).visibility !== 'hidden'
              );
            })
            .map(node => node.dataset.messageId);
          if (ids.length) (window as any).firstNotificationMessageFrame = ids;
          else requestAnimationFrame(capture);
        };
        (window as any).topicPerformance.notify(1, 'performance-1-message-114');
        requestAnimationFrame(capture);
      });
      await expect.poll(() => networkStarted).toBe(true);
      await expect(message(page, 1, cachedCount - 1)).not.toBeVisible();
      expect(
        await page.evaluate(() => (window as any).firstNotificationMessageFrame)
      ).toBeNull();
    } finally {
      release();
    }
    await expect(message(page, 1, 129)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).firstNotificationMessageFrame)
      )
      .toContain('performance-1-message-129');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rows = (
            window as any
          ).topicPerformance.messages.getFullMessagesByTopicId('performance-1');
          return Array.from(
            { length: 30 },
            (_, n) => `performance-1-message-${100 + n}`
          ).every(id => rows.some((row: { id: string }) => row.id === id));
        })
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              performance
                .getEntriesByName('chat-notification:first-message-frame')
                .at(-1) as PerformanceMark | undefined
            )?.detail?.includesLatest
        )
      )
      .toBe(true);
    expect(
      requests.filter(path => path.includes('newMessages=true'))
    ).toHaveLength(1);
    expect(
      requests.filter(
        path => path.includes('/around') || path.includes('afterMessageId')
      )
    ).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

test('старое уведомление не загружает тысячи промежуточных сообщений', async ({
  page,
  isMobile
}) => {
  const { requests, errors } = await openFixture(page, { count: 5000 });
  await page.evaluate(() =>
    (window as any).topicPerformance.notify(1, 'performance-1-message-0')
  );
  await expect(message(page, 1, 4999)).toBeVisible();
  expect(
    requests.filter(path => path.includes('newMessages=true'))
  ).toHaveLength(1);
  expect(requests.filter(path => path.includes('/around'))).toHaveLength(1);
  expect(requests.filter(path => path.includes('afterMessageId'))).toHaveLength(
    0
  );
  expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
    isMobile ? 72 : 250
  );
  expect(errors).toEqual([]);
});

test('отставшая последняя страница восстанавливает новое сообщение из контекста', async ({
  page
}) => {
  const { requests, errors } = await openFixture(page, { count: 4999 });
  await page.route('**/performance-api/messages/*/around', route =>
    route.fulfill({
      json: makeMessages('performance-1', 5000).slice(-40)
    })
  );
  await page.evaluate(() =>
    (window as any).topicPerformance.notify(1, 'performance-1-message-4999')
  );
  await expect(message(page, 1, 4999)).toBeVisible();
  await expect(message(page, 1, 4998)).toBeAttached();
  expect(requests.filter(path => path.includes('afterMessageId'))).toHaveLength(
    0
  );
  expect(errors).toEqual([]);
});

test('ошибка истории из уведомления скрывает старый кеш и восстанавливается без повторного открытия', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 130 });
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-1', rows),
    makeMessages('performance-1', 115)
  );
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/performance-api/messages/topic/*?*', async route => {
    if (++requests === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Тестовая недоступность' }
      });
    await gate;
    return route.fallback();
  });
  try {
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-114')
    );
    await expect.poll(() => requests).toBeGreaterThan(1);
    await expect(message(page, 1, 114)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Повторить', exact: true })
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          performance.getEntriesByName('chat-notification:message-painted')
            .length
      )
    ).toBe(0);
    const editor = page.locator('.chat__input .ProseMirror');
    await editor.fill('Черновик после уведомления');
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-114')
    );
    await expect.poll(() => requests).toBeGreaterThan(2);
    release();
    await expect(message(page, 1, 129)).toBeVisible();
    await expect(message(page, 1, 114)).toHaveCount(1);
    await expect(editor).toHaveText('Черновик после уведомления');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              performance
                .getEntriesByName('chat-notification:history-resolved')
                .at(-1) as PerformanceMark | undefined
            )?.detail?.isFresh
        )
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            performance.getEntriesByName('chat-notification:message-painted')
              .length
        )
      )
      .toBe(1);
  } finally {
    release();
  }
  expect(errors).toEqual([]);
});

test('два быстрых уведомления одного чата сохраняют все 30 новых сообщений', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 130 });
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-1', rows),
    makeMessages('performance-1', 100)
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let requestCount = 0;
  const oldResponse = page.waitForResponse(
    async response =>
      response.url().includes('/messages/topic/performance-1?') &&
      (await response.json()).at(-1)?.id === 'performance-1-message-114'
  );
  await page.route(
    '**/performance-api/messages/topic/performance-1?*',
    async route => {
      if (++requestCount === 1) {
        await gate;
        return route.fulfill({ json: makeMessages('performance-1', 115) });
      }
      return route.fallback();
    }
  );
  try {
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-114')
    );
    await expect.poll(() => requestCount).toBe(1);
    await page.evaluate(() =>
      (window as any).topicPerformance.notify(1, 'performance-1-message-124')
    );
    await expect(message(page, 1, 129)).toBeVisible();
  } finally {
    release();
  }
  await oldResponse;
  await page.evaluate(
    () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            performance
              .getEntriesByName('chat-notification:message-painted')
              .at(-1) as PerformanceMark | undefined
          )?.detail?.notificationMessageId
      )
    )
    .toBe('performance-1-message-124');
  await expect(message(page, 1, 129)).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.messages
          .getFullMessagesByTopicId('performance-1')
          .at(-1)?.id
    )
  ).toBe('performance-1-message-129');
  expect(errors).toEqual([]);
});
