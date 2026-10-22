import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const prepare = async (page: Page, count = 20) => {
  const state = await openFixture(page, { count, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, count - 1)).toBeInViewport();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await expect(
    page.locator('.chat-mobile-route-forward, .chat-mobile-route-back')
  ).toHaveCount(0);
  return state;
};

const incoming = (id: string) => ({
  ...makeMessages('performance-0', 1)[0],
  id,
  text: 'Новое входящее сообщение',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

test('отправка плавно появляется один раз, серверное подтверждение сохраняет тот же элемент и эффект', async ({
  page
}) => {
  const state = await prepare(page);
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const senderPath = '/e2e/fixtures/message-send-harness.ts';
    const networkPath = '/e2e/fixtures/network-harness.ts';
    const { mountMessageSender } = await import(/* @vite-ignore */ senderPath);
    const { controlConnection } = await import(/* @vite-ignore */ networkPath);
    controlConnection();
    fixture.sdk.sendWebSocketEvent = () => true;
    (window as any).sender = mountMessageSender('performance-0');
    await (window as any).sender.handleSend();
  });
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    1
  );
  const pending = await page.evaluate(() =>
    (window as any).topicPerformance.messages
      .getFullMessagesByTopicId('performance-0')
      .find((row: any) => row.senderUserId === 'performance-user')
  );
  const bubble = page.locator(`.message[data-message-id="${pending.id}"]`);
  await expect(bubble).toBeInViewport();
  await expect
    .poll(() =>
      bubble.evaluate(element => {
        const animations = element.getAnimations();
        animations.forEach(animation => animation.pause());
        return animations.length;
      })
    )
    .toBeGreaterThan(0);
  const appearance = await bubble.evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    const sample = (time: number) => {
      animation.currentTime = time;
      const style = getComputedStyle(element);
      return { opacity: Number(style.opacity), translate: style.translate };
    };
    const samples = [sample(0), sample(130), sample(260)];
    animation.currentTime = 80;
    (window as any).arrival = { animation, element };
    return samples;
  });
  expect(appearance[0].opacity).toBe(0);
  expect(appearance[1].opacity).toBeGreaterThan(0);
  expect(appearance[1].opacity).toBeLessThan(1);
  expect(appearance[2].opacity).toBe(1);
  expect(appearance[0].translate).toContain('12px');
  await page.evaluate(pending => {
    (window as any).topicPerformance.emitChatEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: pending.topicId,
        data: { ...pending, id: 'confirmed-arrival', status: 'DELIVERED' }
      }
    });
  }, pending);
  const confirmed = page.locator(
    '.message[data-message-id="confirmed-arrival"]'
  );
  await expect(confirmed).toHaveCount(1);
  expect(
    await confirmed.evaluate(element => ({
      sameElement: element === (window as any).arrival.element,
      sameAnimation:
        element.getAnimations()[0] === (window as any).arrival.animation,
      time: element.getAnimations()[0].currentTime
    }))
  ).toEqual({ sameElement: true, sameAnimation: true, time: 80 });
  await page.evaluate(() => (window as any).arrival.animation.play());
  await expect
    .poll(() => confirmed.evaluate(element => element.getAnimations().length))
    .toBe(0);
  await expect(confirmed).toHaveCSS('opacity', '1');
  expect(state.errors).toEqual([]);
});

test('входящее сообщение и соседи движутся плавно, обновление того же сообщения не повторяет появление', async ({
  page
}) => {
  const state = await prepare(page);
  const originalTop = await message(page, 0, 19).evaluate(
    element => element.getBoundingClientRect().top
  );
  await page.evaluate(
    row =>
      (window as any).topicPerformance.emitChatEvent({
        type: 'changeMessage',
        payload: { type: 'NEW', topicId: row.topicId, data: row }
      }),
    incoming('incoming-arrival')
  );
  const bubble = page.locator('.message[data-message-id="incoming-arrival"]');
  await expect
    .poll(() =>
      bubble.evaluate(element => {
        const animations = element.getAnimations();
        animations.forEach(animation => animation.pause());
        document
          .querySelector('[data-message-id="performance-0-message-19"]')
          ?.getAnimations()
          .forEach(animation => animation.pause());
        return animations.length;
      })
    )
    .toBeGreaterThan(0);
  const movement = await message(page, 0, 19).evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const start = element.getBoundingClientRect().top;
    animation.currentTime = 260;
    const end = element.getBoundingClientRect().top;
    animation.finish();
    return { start, end };
  });
  expect(Math.abs(movement.start - originalTop)).toBeLessThan(2);
  expect(movement.end).toBeLessThan(movement.start - 10);
  await bubble.evaluate(element =>
    element.getAnimations().forEach(animation => animation.play())
  );
  await expect
    .poll(() => bubble.evaluate(element => element.getAnimations().length))
    .toBe(0);
  await page.evaluate(
    row =>
      (window as any).topicPerformance.messages.addMessageToLocal(
        row.topicId,
        row
      ),
    incoming('incoming-arrival')
  );
  await expect(bubble).toHaveCSS('opacity', '1');
  expect(await bubble.evaluate(element => element.getAnimations().length)).toBe(
    0
  );
  await expect(bubble).toBeInViewport();
  expect(state.errors).toEqual([]);
});

test('история, replay и уменьшенная анимация не запускают появление', async ({
  page
}) => {
  const state = await prepare(page);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    makeMessages('performance-0', 24)
  );
  await expect(message(page, 0, 23)).toBeInViewport();
  expect(
    await message(page, 0, 23).evaluate(
      element => element.getAnimations().length
    )
  ).toBe(0);
  await page.evaluate(
    row =>
      (window as any).topicPerformance.emitChatEvent({
        type: 'syncReplay',
        payload: {
          fromPts: '10',
          toPts: '11',
          hasMore: false,
          events: [
            {
              eventId: 'arrival-replay',
              pts: '11',
              topicId: row.topicId,
              eventType: 'message.new',
              payload: { type: 'NEW', topicId: row.topicId, data: row }
            }
          ]
        }
      }),
    incoming('replayed-arrival')
  );
  const replay = page.locator('.message[data-message-id="replayed-arrival"]');
  await expect(replay).toBeInViewport();
  expect(await replay.evaluate(element => element.getAnimations().length)).toBe(
    0
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(
    row =>
      (window as any).topicPerformance.messages.addMessageToLocal(
        row.topicId,
        row
      ),
    incoming('reduced-arrival')
  );
  const reduced = page.locator('.message[data-message-id="reduced-arrival"]');
  await expect(reduced).toBeInViewport();
  expect(
    await reduced.evaluate(element => element.getAnimations().length)
  ).toBe(0);
  expect(state.errors).toEqual([]);
});

test('первое сообщение в пустом чате появляется мягко, переход в другой чат отменяет эффект', async ({
  page
}) => {
  const state = await openFixture(page, { count: 0, shell: true });
  await openTopic(page, 0);
  await expect(page.locator('.chat__message-bubble')).toHaveCount(1);
  await expect(
    page.locator('.chat-mobile-route-forward, .chat-mobile-route-back')
  ).toHaveCount(0);
  await page.evaluate(
    row =>
      (window as any).topicPerformance.messages.addMessageToLocal(
        row.topicId,
        row
      ),
    incoming('first-arrival')
  );
  const bubble = page.locator('.message[data-message-id="first-arrival"]');
  await expect
    .poll(() =>
      bubble.evaluate(element => {
        const animations = element.getAnimations();
        animations.forEach(animation => animation.pause());
        return animations.length;
      })
    )
    .toBeGreaterThan(0);
  await bubble.evaluate(element => {
    const animation = element.getAnimations()[0];
    animation.pause();
    (window as any).firstArrival = animation;
  });
  await openTopic(page, 1);
  expect(
    await page.evaluate(() => (window as any).firstArrival.playState)
  ).toBe('idle');
  expect(state.errors).toEqual([]);
});

test('пакет новых сообщений ограничивает эффекты и сохраняет все сообщения', async ({
  page
}) => {
  const state = await prepare(page);
  const rows = Array.from({ length: 40 }, (_, index) => ({
    ...incoming(`batch-arrival-${index}`),
    createdAt: new Date(Date.now() + index).toISOString()
  }));
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    (window as any).arrivalEffectIds = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (
        this.matches('.message[data-message-id]') &&
        Array.isArray(frames) &&
        frames.some(frame => frame.opacity !== undefined)
      )
        (window as any).arrivalEffectIds.push(
          (this as HTMLElement).dataset.messageId
        );
      return animate.call(this, frames, options);
    };
    for (const row of rows)
      fixture.messages.addMessageToLocal(row.topicId, row);
  }, rows);
  const last = page.locator('.message[data-message-id="batch-arrival-39"]');
  await expect
    .poll(() => page.evaluate(() => (window as any).arrivalEffectIds.length))
    .toBeGreaterThan(0);
  await expect(last).toBeInViewport();
  const animated = await page.evaluate(
    () => (window as any).arrivalEffectIds.length
  );
  expect(animated).toBeGreaterThan(0);
  expect(animated).toBeLessThanOrEqual(8);
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.messages
          .getFullMessagesByTopicId('performance-0')
          .filter((row: any) => row.id.startsWith('batch-arrival-')).length
    )
  ).toBe(40);
  await expect
    .poll(() => last.evaluate(element => element.getAnimations().length))
    .toBe(0);
  expect(state.errors).toEqual([]);
});

test('прокрутка пользователя во время прихода сообщения сохраняет просмотр истории', async ({
  page
}) => {
  const state = await prepare(page);
  await page.evaluate(async row => {
    const fixture = (window as any).topicPerformance;
    const container = document.querySelector<HTMLElement>(
      '.chat__message-wrapper'
    )!;
    fixture.messages.addMessageToLocal(row.topicId, row);
    queueMicrotask(() => {
      container.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -600, bubbles: true })
      );
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll'));
    });
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }, incoming('arrival-while-scrolling'));
  await expect(message(page, 0, 0)).toBeInViewport();
  expect(
    await page
      .locator('.chat__message-wrapper')
      .evaluate(element => element.scrollTop)
  ).toBe(0);
  await expect(
    page.locator('.message[data-message-id="arrival-while-scrolling"]')
  ).not.toBeInViewport();
  expect(state.errors).toEqual([]);
});
