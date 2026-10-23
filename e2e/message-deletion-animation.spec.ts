import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test('удалённые сообщения рассыпаются, соседние плавно перемещаются, копии очищаются', async ({
  page
}, testInfo) => {
  const state = await openFixture(page, { count: 24, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 23)).toBeInViewport();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  const originalTop = await message(page, 0, 22).evaluate(
    element => element.getBoundingClientRect().top
  );
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    void fixture.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-21'
    );
    void fixture.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-23'
    );
  });
  const layer = page.locator('.message-deletion-layer');
  const ghosts = layer.locator('.message-deletion-ghost');
  await expect(ghosts).toHaveCount(2);
  await expect(message(page, 0, 21)).toHaveCount(0);
  await expect(message(page, 0, 23)).toHaveCount(0);
  await expect(ghosts.nth(0)).toContainText('Сообщение 21');
  await expect(ghosts.nth(1)).toContainText('Сообщение 23');
  await expect(layer.locator('[data-message-id], [data-testid]')).toHaveCount(
    0
  );
  expect(
    await layer.evaluate(element => ({
      inert: (element as HTMLElement).inert,
      pointerEvents: getComputedStyle(element).pointerEvents,
      hidden: element.getAttribute('aria-hidden')
    }))
  ).toEqual({ inert: true, pointerEvents: 'none', hidden: 'true' });
  await expect
    .poll(() =>
      message(page, 0, 22).evaluate(element => element.getAnimations().length)
    )
    .toBeGreaterThan(0);
  const movement = await message(page, 0, 22).evaluate(element => {
    const animation = element.getAnimations()[0];
    const time = animation.currentTime;
    animation.pause();
    const sample = (time: number) => {
      animation.currentTime = time;
      return element.getBoundingClientRect().top;
    };
    const result = {
      start: sample(0),
      early: sample(150),
      middle: sample(350),
      end: sample(600)
    };
    animation.currentTime = time;
    animation.play();
    return result;
  });
  expect(Math.abs(movement.start - originalTop)).toBeLessThan(2);
  const distance = Math.abs(movement.end - movement.start);
  const earlyDistance = Math.abs(movement.early - movement.start);
  expect(earlyDistance).toBeGreaterThan(0.5);
  expect(earlyDistance).toBeLessThan(distance * 0.4);
  expect(Math.abs(movement.middle - movement.start)).toBeGreaterThan(
    earlyDistance
  );
  await expect
    .poll(() =>
      layer
        .locator('feDisplacementMap')
        .first()
        .getAttribute('scale')
        .then(Number)
    )
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath('message-dissolving.png')
  });
  await expect(layer).toHaveCount(0, { timeout: 2500 });
  await expect(message(page, 0, 22)).toBeInViewport();
  await expect(message(page, 0, 22)).toHaveCSS('transform', 'none');
  expect(state.errors).toEqual([]);
});

test('удаление выбранных сообщений совмещает выход из выбора и движение без переноса строк', async ({
  page,
  isMobile
}) => {
  const state = await openFixture(page, { count: 8, shell: true });
  const rows = makeMessages('performance-0', 8);
  rows.forEach((row, index) => {
    if (index >= 4) {
      row.senderUserId = 'performance-user';
      row.senderUser = { id: 'performance-user', name: 'Тест' };
    }
    if (index === 3 || index === 6)
      row.text =
        'Длинное сообщение для проверки сохранения переноса строк. '.repeat(4);
  });
  await page.route('**/performance-api/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  await expect(message(page, 0, 7)).toBeInViewport();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await expect(
    page.locator('.chat-mobile-route-forward, .chat-mobile-route-back')
  ).toHaveCount(0);
  const geometry = () =>
    page.evaluate(() =>
      [3, 6].map(index => {
        const element = document.querySelector<HTMLElement>(
          `[data-message-id="performance-0-message-${index}"] .message__content__articles`
        )!;
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          width: bounds.width,
          height: bounds.height
        };
      })
    );
  const before = await geometry();
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    for (const index of [5, 7])
      fixture.selection.enterMessageSelection('performance-0', rows[index]);
  }, rows);
  await expect(page.locator('.message--selection-active')).toHaveCount(8);
  await expect
    .poll(async () =>
      Math.abs(
        (await geometry())[0].left - before[0].left - (isMobile ? 30 : 0)
      )
    )
    .toBeLessThan(2);
  await expect
    .poll(async () =>
      Math.abs(
        (await geometry())[1].left - before[1].left - (isMobile ? 0 : -30)
      )
    )
    .toBeLessThan(2);
  const selected = await geometry();
  for (let index = 0; index < before.length; index += 1) {
    expect(selected[index].width).toBeCloseTo(before[index].width, 0);
    expect(selected[index].height).toBeCloseTo(before[index].height, 0);
  }
  const checkbox = message(page, 0, 7).locator('input[type="checkbox"]');
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeInViewport();
  await checkbox.locator('..').click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.locator('..').click();
  await expect(checkbox).toBeChecked();

  await page.locator('[data-testid$="-SelectedMessages-DeleteButton"]').click();
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await expect(page.locator('.message-deletion-ghost')).toHaveCount(2);
  await expect(page.locator('.message--selection-active')).toHaveCount(0);
  await expect(message(page, 0, 5)).toHaveCount(0);
  await expect(message(page, 0, 7)).toHaveCount(0);
  const transitions = await page.evaluate(() =>
    [...document.querySelectorAll('.message__content__articles')]
      .flatMap(element => element.getAnimations())
      .map(animation => (animation as CSSTransition).transitionProperty)
  );
  expect(transitions).not.toContain('width');
  await expect(page.locator('.message-deletion-layer')).toHaveCount(0, {
    timeout: 2500
  });
  const after = await geometry();
  for (let index = 0; index < before.length; index += 1) {
    expect(after[index].left).toBeCloseTo(before[index].left, 0);
    expect(after[index].width).toBeCloseTo(before[index].width, 0);
    expect(after[index].height).toBeCloseTo(before[index].height, 0);
  }
  await expect(message(page, 0, 6)).toBeInViewport();
  expect(state.errors).toEqual([]);
});

test('замена окна истории не запускает эффект, переход в другой чат очищает удаление', async ({
  page
}) => {
  const state = await openFixture(page, { count: 20, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 19)).toBeInViewport();
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    makeMessages('performance-0', 15)
  );
  await expect(message(page, 0, 19)).toHaveCount(0);
  await expect(page.locator('.message-deletion-layer')).toHaveCount(0);
  await page.evaluate(() => {
    void (window as any).topicPerformance.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-14'
    );
  });
  await expect(page.locator('.message-deletion-ghost')).toHaveCount(1);
  await openTopic(page, 1);
  await expect(page.locator('.message-deletion-layer')).toHaveCount(0);
  await expect(message(page, 1, 19)).toBeInViewport();
  expect(state.errors).toEqual([]);
});

test('анимация сохраняет кадр canvas и не запускает видео повторно', async ({
  page
}) => {
  const state = await openFixture(page, { count: 2, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 1)).toBeInViewport();
  await message(page, 0, 1)
    .locator('.message-content__html')
    .evaluate(element => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 80;
      canvas.style.display = 'block';
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'rgb(60, 120, 240)';
      context.fillRect(0, 0, 160, 80);
      element.append(canvas);
      const video = document.createElement('video');
      video.setAttribute('autoplay', '');
      video.width = 80;
      video.height = 40;
      element.append(video);
    });
  await page.evaluate(() => {
    void (window as any).topicPerformance.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-1'
    );
  });
  const ghost = page.locator('.message-deletion-ghost');
  await expect(ghost).toHaveCount(1);
  expect(
    await ghost
      .locator('canvas')
      .evaluate((element: HTMLCanvasElement) =>
        Array.from(element.getContext('2d')!.getImageData(1, 1, 1, 1).data)
      )
  ).toEqual([60, 120, 240, 255]);
  expect(
    await ghost.locator('video').evaluate((element: HTMLVideoElement) => ({
      autoplay: element.autoplay,
      muted: element.muted,
      source: element.getAttribute('src')
    }))
  ).toEqual({ autoplay: false, muted: true, source: null });
  await expect(ghost).toHaveCount(0, { timeout: 2500 });
  expect(state.errors).toEqual([]);
});

test('удаление вне экрана и уменьшенная анимация обходятся без декоративных копий', async ({
  page
}) => {
  const state = await openFixture(page, { count: 100, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 99)).toBeInViewport();
  await page.evaluate(() => {
    void (window as any).topicPerformance.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-60'
    );
  });
  await expect(message(page, 0, 60)).toHaveCount(0);
  await expect(page.locator('.message-deletion-layer')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    void (window as any).topicPerformance.messages.deleteMessageFromLocal(
      'performance-0',
      'performance-0-message-99'
    );
  });
  await expect(message(page, 0, 99)).toHaveCount(0);
  await expect(page.locator('.message-deletion-layer')).toHaveCount(0);
  await expect(message(page, 0, 98)).toBeInViewport();
  expect(state.errors).toEqual([]);
});

test('пакетное удаление последней группы ограничивает фильтры и сразу удаляет данные', async ({
  page
}) => {
  const state = await openFixture(page, { count: 20, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 19)).toBeInViewport();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    for (let index = 0; index < 20; index += 1) {
      void fixture.messages.deleteMessageFromLocal(
        'performance-0',
        `performance-0-message-${index}`
      );
    }
  });
  await expect(page.locator('.message[data-message-id]')).toHaveCount(0);
  const layer = page.locator('.message-deletion-layer');
  await expect(layer).toHaveCount(1);
  expect(await layer.locator('filter').count()).toBeLessThanOrEqual(4);
  expect(
    await layer.locator('.message-deletion-ghost').count()
  ).toBeLessThanOrEqual(24);
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.messages.getFullMessagesByTopicId(
          'performance-0'
        ).length
    )
  ).toBe(0);
  await expect(layer).toHaveCount(0, { timeout: 2500 });
  expect(state.errors).toEqual([]);
});
