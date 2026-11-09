import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

for (const { delayed, targetIndex } of [
  { delayed: false, targetIndex: 0 },
  { delayed: true, targetIndex: 0 },
  { delayed: true, targetIndex: 40 }
]) {
  test(`далёкий закреп сохраняет автора и геометрию при догрузке: задержка ${delayed}, цель ${targetIndex}`, async ({
    page
  }, testInfo) => {
    const state = await openFixture(page, {
      shell: true,
      count: 240,
      pinOutsideHistory: true
    });
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      Object.assign(fixture.topics[0], {
        type: 'GROUP',
        members: [{ id: 'peer-0', initials: 'Собеседник Т.', avatarUrl: '' }]
      });
      fixture.setTopics(fixture.topics);
    });
    const rows = makeMessages('performance-0', 81);
    const context = rows.map((row, index) => ({
      ...row,
      senderUser: undefined,
      ...(index === targetIndex
        ? {
            replyMessage: { ...rows[0], text: 'Цитата из исходного сообщения' },
            reactions: [
              {
                id: 'pin-reaction',
                messageId: row.id,
                senderUserId: 'peer-0',
                text: '👍',
                createdAt: row.createdAt
              }
            ]
          }
        : {}),
      ...(index === 8
        ? { isSystem: true, text: 'Участник добавлен в группу' }
        : {})
    }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/messages/topic/performance-0/pinned', route =>
      route.fulfill({
        json: [
          { ...makeMessages('performance-0', 81)[targetIndex], isPin: true }
        ]
      })
    );
    await page.route(
      `**/messages/performance-0-message-${targetIndex}/around*`,
      async route => {
        if (delayed) await gate;
        await route.fulfill({ json: context });
      }
    );
    try {
      await page.evaluate(async () => {
        const path = '/src/composables/navigation/index.ts';
        const { navigateToGroup } = await import(/* @vite-ignore */ path);
        navigateToGroup('performance-0');
      });
      await expect(message(page, 0, 239)).toBeInViewport();
      expect(
        await page.evaluate(() =>
          (window as any).topicPerformance.getSelectedTopic('performance-0')
        )
      ).toMatchObject({
        type: 'GROUP',
        members: [{ id: 'peer-0', initials: 'Собеседник Т.' }]
      });
      await page.evaluate(targetIndex => {
        (window as any).pinnedRevealFrames = [];
        let remainingFrames = 20;
        const sample = () => {
          const container = document.querySelector('.chat__message-wrapper')!;
          const target = container.querySelector(
            `[data-message-id="performance-0-message-${targetIndex}"]`
          );
          if (
            target &&
            !container.classList.contains('chat__message-wrapper--navigating')
          ) {
            (window as any).pinnedRevealFrames.push({
              reply: !!target.querySelector('.message-reference-reply'),
              reaction: !!target.querySelector('.reaction'),
              neighbor: !!container.querySelector(
                `[data-message-id="performance-0-message-${targetIndex + 1}"]`
              ),
              height: target.getBoundingClientRect().height
            });
            remainingFrames -= 1;
          }
          if (remainingFrames > 0) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, targetIndex);
      await page
        .getByTestId('Pinned-Messages')
        .locator('.chat__input__action__blog')
        .click();
      const target = message(page, 0, targetIndex);
      if (delayed) {
        await page.waitForTimeout(200);
        await expect(target).not.toBeAttached();
      }
      release();
      await expect(
        target.getByRole('heading', { name: 'Собеседник Т.' })
      ).toBeVisible();
      await expect(
        page.locator('.chat__message-navigation-overlay')
      ).toBeHidden();
      const before = await target.boundingBox();
      const geometry = () =>
        target.evaluate(element => {
          const root = element.closest('.chat__message-bubble') as HTMLElement;
          const container = root.closest(
            '.chat__message-wrapper'
          ) as HTMLElement;
          return {
            targetTop: element.getBoundingClientRect().top,
            containerTop: container.getBoundingClientRect().top,
            containerHeight: container.clientHeight,
            scrollTop: container.scrollTop,
            rootHeight: root.clientHeight,
            classes: root.className,
            firstMargin: getComputedStyle(root.firstElementChild!).marginTop
          };
        });
      const beforeGeometry = await geometry();
      const wrapperBefore = await page
        .locator('.chat__message-wrapper')
        .boundingBox();
      await expect(message(page, 0, 80)).toBeAttached();
      await expect(message(page, 0, 8)).toContainText(
        'Участник добавлен в группу'
      );
      await expect(
        target.getByRole('heading', { name: 'Собеседник Т.' })
      ).toBeVisible();
      const after = await target.boundingBox();
      const wrapperAfter = await page
        .locator('.chat__message-wrapper')
        .boundingBox();
      expect(
        Math.abs(before!.y - wrapperBefore!.y - (after!.y - wrapperAfter!.y)),
        JSON.stringify({ beforeGeometry, afterGeometry: await geometry() })
      ).toBeLessThan(2);
      expect(after!.height).toBeCloseTo(before!.height, 0);
      await expect(target.locator('.message-reference-reply')).toContainText(
        'Цитата из исходного сообщения'
      );
      await expect(target.locator('.reaction')).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).pinnedRevealFrames.length)
        )
        .toBe(20);
      const frames = await page.evaluate(
        () => (window as any).pinnedRevealFrames as Record<string, any>[]
      );
      expect(
        frames.every(frame => frame.reply && frame.reaction && frame.neighbor)
      ).toBe(true);
      const heights = frames.map(frame => frame.height);
      expect(
        Math.max(...heights) - Math.min(...heights),
        JSON.stringify(frames)
      ).toBeLessThan(1);
      await expect(
        page.locator('.chat__message-navigation-overlay [data-message-id]')
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('pinned-context.png')
      });
      expect(state.errors).toEqual([]);
    } finally {
      release();
    }
  });
}

test('быстрый повторный переход и уменьшение движения очищают слой анимации', async ({
  page
}) => {
  const state = await openFixture(page, {
    shell: true,
    count: 240,
    pinOutsideHistory: true
  });
  await openTopic(page, 0);
  await expect(message(page, 0, 239)).toBeInViewport();
  const pin = page
    .getByTestId('Pinned-Messages')
    .locator('.chat__input__action__blog');
  await pin.click({ clickCount: 2 });
  await expect(message(page, 0, 0)).toBeInViewport();
  await expect(page.locator('.chat__message-wrapper--navigating')).toHaveCount(
    0
  );
  await expect(page.locator('.chat__message-navigation-overlay')).toBeHidden();
  await page
    .getByRole('button', { name: 'Перейти к новым сообщениям', exact: true })
    .click();
  await expect(message(page, 0, 239)).toBeInViewport();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pin.click();
  await expect(message(page, 0, 0)).toBeInViewport();
  await expect(page.locator('.chat__message-navigation-overlay')).toBeHidden();
  expect(state.errors).toEqual([]);
});
