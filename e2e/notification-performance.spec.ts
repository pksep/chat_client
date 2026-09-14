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

test('уведомление показывает кеш до ответа сети и ограничивает DOM длинной истории', async ({
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
    await expect(message(page, 1, 4999)).toBeVisible();
    await expect.poll(() => networkStarted).toBe(true);
    expect((await metrics(page)).skeletonFrames).toBe(0);
    expect(await page.locator('[data-message-id]').count()).toBeLessThanOrEqual(
      isMobile ? 72 : 250
    );
  } finally {
    release();
  }
  await expect
    .poll(
      () => requests.filter(path => path.includes('newMessages=true')).length
    )
    .toBe(1);
  await page.waitForTimeout(350);
  expect(requests.filter(path => path.includes('/around'))).toHaveLength(0);
  expect(errors).toEqual([]);
});

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
