import { expect, test, type Page } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

const bottomDistance = (page: Page) =>
  page
    .locator('.chat__message-wrapper')
    .evaluate(element =>
      Math.max(
        0,
        element.scrollHeight - element.clientHeight - element.scrollTop
      )
    );

const updateReaction = async (
  page: Page,
  index: number,
  action: 'added' | 'removed'
) => {
  await page.evaluate(
    ({ index, action }) => {
      (window as any).topicPerformance.emitChatEvent({
        type: 'reactionUpdated',
        payload: {
          action,
          topicId: 'performance-0',
          messageId: `performance-0-message-${index}`,
          messageSenderUserId: 'peer-0',
          reactionSenderUserId: 'performance-user',
          reaction: {
            id: `scroll-reaction-${index}`,
            messageId: `performance-0-message-${index}`,
            senderUserId: 'performance-user',
            text: '❤️'
          }
        }
      });
    },
    { index, action }
  );
  await expect(
    page.locator(`[data-message-id="performance-0-message-${index}"] .reaction`)
  ).toHaveCount(action === 'added' ? 1 : 0);
};

test('реакции на нижние сообщения сохраняют чат внизу после ручной прокрутки', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 80, shell: true });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-79"]')
  ).toBeVisible();
  const scroller = page.locator('.chat__message-wrapper');

  for (const deltaY of [-400, 1000]) {
    await scroller.evaluate((element, deltaY) => {
      element.dispatchEvent(new WheelEvent('wheel', { deltaY }));
      element.scrollTop += deltaY;
      element.dispatchEvent(new Event('scroll'));
    }, deltaY);
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
  }
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);

  for (const index of [78, 76, 77, 74]) {
    await updateReaction(page, index, 'added');
    await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
  }
  for (const index of [76, 78, 74, 77]) {
    await updateReaction(page, index, 'removed');
    await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('реакции не прокручивают вниз при чтении сообщений выше', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 80, shell: true });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-79"]')
  ).toBeVisible();
  const scroller = page.locator('.chat__message-wrapper');
  const previousScrollTop = await scroller.evaluate(element => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -500 }));
    element.scrollTop -= 500;
    element.dispatchEvent(new Event('scroll'));
    return element.scrollTop;
  });
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(400);

  for (const index of [78, 79]) {
    await updateReaction(page, index, 'added');
    expect(
      Math.abs(
        (await scroller.evaluate(element => element.scrollTop)) -
          previousScrollTop
      )
    ).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});
