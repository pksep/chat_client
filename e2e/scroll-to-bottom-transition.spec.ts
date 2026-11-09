import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

for (const source of ['history', 'pin', 'reduced-motion']) {
  test(`кнопка вниз раскрывает готовый конец истории: ${source}`, async ({
    page
  }, testInfo) => {
    const state = await openFixture(page, {
      shell: true,
      count: 240,
      pinOutsideHistory: source === 'pin'
    });
    await openTopic(page, 0);
    await expect(message(page, 0, 239)).toBeInViewport();
    if (source === 'pin') {
      await page
        .getByTestId('Pinned-Messages')
        .locator('.chat__input__action__blog')
        .click();
      await expect(message(page, 0, 0)).toBeInViewport();
      await expect(
        page.locator('.chat__message-navigation-overlay')
      ).toBeHidden();
    } else {
      await page.locator('.chat__message-wrapper').hover();
      await page.mouse.wheel(0, -700);
    }
    if (source === 'reduced-motion') {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }

    const rows = makeMessages('performance-0', 241);
    const latest = rows.slice(-50).map(row => ({
      ...row,
      ...(row.id === rows[240].id
        ? {
            text: 'Последнее сообщение с полными данными',
            senderUser: { id: 'peer-0', initials: 'Автор сообщения' },
            replyMessage: { ...rows[235], text: 'Цитата последнего сообщения' },
            reactions: [
              {
                id: 'latest-reaction',
                messageId: row.id,
                senderUserId: 'peer-0',
                text: '👍',
                createdAt: row.createdAt
              }
            ]
          }
        : {})
    }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route('**/messages/topic/performance-0?*', async route => {
      if (
        new URL(route.request().url()).searchParams.get('newMessages') !==
        'true'
      ) {
        return route.fallback();
      }
      await gate;
      await route.fulfill({ json: latest });
    });
    try {
      await expect(
        page.getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
      ).toBeVisible();
      await page.evaluate(() => {
        (window as any).bottomRevealFrames = [];
        (window as any).localBottomReveal = null;
        let clickedAt = 0;
        document
          .querySelector('.chat__message-bubble__arrow-down')!
          .addEventListener(
            'click',
            () => {
              clickedAt = performance.now();
            },
            { once: true }
          );
        const sample = () => {
          const container = document.querySelector('.chat__message-wrapper')!;
          const localTarget = container.querySelector(
            '[data-message-id="performance-0-message-239"]'
          );
          if (
            clickedAt &&
            localTarget &&
            !(window as any).localBottomReveal &&
            !container.classList.contains(
              'chat__message-wrapper--navigating'
            ) &&
            localTarget.getBoundingClientRect().bottom >
              container.getBoundingClientRect().top &&
            localTarget.getBoundingClientRect().top <
              container.getBoundingClientRect().bottom
          ) {
            (window as any).localBottomReveal = {
              elapsed: performance.now() - clickedAt,
              animated:
                container
                  .querySelector('.chat__message-bubble')!
                  .getAnimations().length > 0
            };
          }
          const target = container.querySelector(
            '[data-message-id="performance-0-message-240"]'
          );
          if (
            target &&
            !container.classList.contains('chat__message-wrapper--navigating')
          ) {
            (window as any).bottomRevealFrames.push({
              reply: !!target.querySelector('.message-reference-reply'),
              reaction: !!target.querySelector('.reaction'),
              neighbor: !!container.querySelector(
                '[data-message-id="performance-0-message-239"]'
              ),
              height: target.getBoundingClientRect().height,
              distanceFromBottom:
                container.scrollHeight -
                container.clientHeight -
                container.scrollTop,
              bottomGap:
                container.getBoundingClientRect().bottom -
                target.getBoundingClientRect().bottom
            });
          }
          if ((window as any).bottomRevealFrames.length < 20)
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const request = page.waitForRequest(
        request =>
          new URL(request.url()).searchParams.get('newMessages') === 'true'
      );
      await page
        .getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
        .click();
      await request;
      const overlay = page.locator('.chat__message-navigation-overlay');
      await expect(message(page, 0, 239)).toBeInViewport();
      await expect(overlay).toBeHidden();
      const localReveal = await page.evaluate(
        () => (window as any).localBottomReveal
      );
      expect(localReveal.elapsed).toBeLessThan(150);
      expect(localReveal.animated).toBe(source !== 'reduced-motion');
      await expect(message(page, 0, 240)).not.toBeAttached();
      release();
      await expect(message(page, 0, 240)).toBeInViewport();
      await expect(overlay).toBeHidden();
      await page.screenshot({
        path: testInfo.outputPath('scroll-to-bottom.png')
      });
      await expect(
        page.locator('.chat__message-wrapper--navigating')
      ).toHaveCount(0);
      await expect(
        message(page, 0, 240).locator('.message-reference-reply')
      ).toContainText('Цитата последнего сообщения');
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).bottomRevealFrames.length)
        )
        .toBe(20);
      const frames = await page.evaluate(
        () => (window as any).bottomRevealFrames as Record<string, any>[]
      );
      expect(
        frames.every(frame => frame.reply && frame.reaction && frame.neighbor)
      ).toBe(true);
      const heights = frames.map(frame => frame.height);
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1);
      const gaps = frames.map(frame => frame.bottomGap);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(40);
      expect(Math.abs(frames.at(-1)!.distanceFromBottom)).toBeLessThan(2);
      await expect(
        page.getByRole('button', {
          name: 'Перейти к новым сообщениям',
          exact: true
        })
      ).toBeHidden();
      expect(state.errors).toEqual([]);
    } finally {
      release();
    }
  });
}

test('ручная прокрутка отменяет фоновый возврат вниз после мгновенного перехода', async ({
  page
}) => {
  const state = await openFixture(page, {
    shell: true,
    count: 240,
    pinOutsideHistory: true
  });
  await openTopic(page, 0);
  await page
    .getByTestId('Pinned-Messages')
    .locator('.chat__input__action__blog')
    .click();
  await expect(message(page, 0, 0)).toBeInViewport();
  await expect(page.locator('.chat__message-navigation-overlay')).toBeHidden();
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/messages/topic/performance-0?*', async route => {
    if (
      new URL(route.request().url()).searchParams.get('newMessages') !== 'true'
    )
      return route.fallback();
    await gate;
    await route.fulfill({
      json: makeMessages('performance-0', 241).slice(-50)
    });
  });
  try {
    await page
      .getByRole('button', { name: 'Перейти к новым сообщениям', exact: true })
      .click();
    await expect(message(page, 0, 239)).toBeInViewport();
    await expect(
      page.locator('.chat__message-navigation-overlay')
    ).toBeHidden();
    await page.locator('.chat__message-wrapper').hover();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    const before = await page
      .locator('.chat__message-wrapper')
      .evaluate(element => element.scrollTop);
    const response = page.waitForResponse(
      response =>
        new URL(response.url()).searchParams.get('newMessages') === 'true'
    );
    release();
    await response;
    await page.waitForTimeout(300);
    await expect(message(page, 0, 240)).not.toBeAttached();
    const after = await page
      .locator('.chat__message-wrapper')
      .evaluate(element => element.scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(2);
    expect(state.errors).toEqual([]);
  } finally {
    release();
  }
});
