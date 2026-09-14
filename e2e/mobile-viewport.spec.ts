import { expect, test, type Page } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';
import {
  openFixture,
  openTopic,
  message
} from './fixtures/topic-performance-page';

const bottomDistance = (page: Page) =>
  page
    .locator('.chat__message-wrapper')
    .evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop);

test('последнее сообщение остаётся над инпутом при изменении высоты экрана', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { requests, errors } = await openFixture(page, {
    count: 300,
    shell: true
  });
  await openTopic(page, 0);
  await expect(message(page, 0, 299)).toBeVisible();
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
  const requestCount = requests.length;
  await page.locator('[contenteditable="true"]').focus();
  for (const height of Array.from({ length: 10 }, () => [
    700, 600, 506, 600, 700, 832
  ]).flat()) {
    await page.setViewportSize({ width: 392, height });
    await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const last = document.querySelector(
            '[data-message-id="performance-0-message-299"]'
          );
          const input = document.querySelector('.chat__input');
          if (!last?.getClientRects().length || !input?.getClientRects().length)
            return Infinity;
          return (
            last.getBoundingClientRect().bottom -
            input.getBoundingClientRect().top
          );
        })
      )
      .toBeLessThanOrEqual(1);
  }
  expect(requests.length).toBe(requestCount);
  expect(errors).toEqual([]);
});

test('изменение прокручиваемой области без resize не сбрасывает привязку к последнему сообщению', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { count: 300, shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0, 299)).toBeVisible();
  await page.waitForTimeout(800);
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
  await page.locator('.chat__message-wrapper').evaluate(el => {
    el.querySelector<HTMLElement>('.chat__message-bubble')!.style.transform =
      'translateY(5px)';
    el.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
  await page.setViewportSize({ width: 392, height: 506 });
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
  await page.locator('.chat__message-wrapper').evaluate(el => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -300 }));
    el.scrollTop -= 300;
    el.querySelector<HTMLElement>('.chat__message-bubble')!.style.transform =
      'translateY(10px)';
  });
  await page.waitForTimeout(100);
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(250);
  expect(errors).toEqual([]);
});

test('изменение высоты экрана сохраняет место чтения старых сообщений', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { count: 300, shell: true });
  await openTopic(page, 0);
  await expect.poll(() => bottomDistance(page)).toBeLessThanOrEqual(2);
  await page.locator('.chat__message-wrapper').evaluate(el => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -300 }));
    el.scrollTop -= 300;
  });
  await expect.poll(() => bottomDistance(page)).toBeGreaterThan(250);
  const anchor = await page.locator('.chat__message-wrapper').evaluate(el => {
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      row => row.getBoundingClientRect().top >= top
    )!;
    return {
      id: row.dataset.messageId,
      top: row.getBoundingClientRect().top - top
    };
  });
  await page.locator('[contenteditable="true"]').focus();
  await page.setViewportSize({ width: 392, height: 506 });
  await page.waitForTimeout(250);
  const relativeTop = await page
    .locator(`[data-message-id="${anchor.id}"]`)
    .first()
    .evaluate(
      el =>
        el.getBoundingClientRect().top -
        el.closest('.chat__message-wrapper')!.getBoundingClientRect().top
    );
  expect(Math.abs(relativeTop - anchor.top)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('возврат из топика не двигает список по вертикали и сохраняет прокрутку', async ({
  page,
  isMobile
}, testInfo) => {
  const fixture = await createAndroidPerformanceServer({
    port: 5310 + testInfo.parallelIndex,
    topicCount: 50,
    userCount: 80,
    messagesPerTopic: 20
  });
  try {
    await page.setViewportSize({ width: 392, height: 832 });
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    );
    await page.addInitScript(
      ({ origin, config, user, topics }) => {
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'chat-294-local-fixture', user })
        );
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        localStorage.setItem(
          `chat-offline-fast-topics-v1:${user.id}`,
          JSON.stringify(topics)
        );
        localStorage.setItem(
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
        );
      },
      {
        origin: fixture.origin,
        config: fixture.config,
        user: fixture.user,
        topics: fixture.topics
      }
    );
    await page.goto('/');
    const list = page.locator('.mobile-list-container__section--chats');
    await expect(list.locator('.contact-list__item').first()).toBeVisible({
      timeout: 30000
    });
    await expect(page.locator('#startup-shell')).toHaveCount(0);
    if (isMobile) {
      await page.getByRole('button', { name: 'Остаться в браузере' }).click();
    }
    for (const scroll of [0, 800, 2400]) {
      await list.evaluate((el, top) => {
        el.scrollTop = top;
      }, scroll);
      await expect
        .poll(() => list.evaluate(el => el.scrollTop))
        .toBeCloseTo(scroll, 0);
      await list
        .locator('.contact-list__item')
        .nth(scroll ? Math.ceil(scroll / 80) + 2 : 2)
        .click();
      await expect(page.locator('.chat__input')).toBeVisible();
      await page.waitForTimeout(350);
      const frames = await page.evaluate(async () => {
        const samples: { top: number; scroll: number }[] = [];
        const started = performance.now();
        const sample = () => {
          const list = document.querySelector<HTMLElement>(
            '.mobile-list-container__section--chats'
          )!;
          if (list.clientHeight)
            samples.push({
              top: list.getBoundingClientRect().top,
              scroll: list.scrollTop
            });
          if (performance.now() - started < 500) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        document
          .querySelector<HTMLButtonElement>(
            '[data-testid$="Header-BackButton"]'
          )!
          .click();
        await new Promise(resolve => setTimeout(resolve, 550));
        return samples;
      });
      expect(frames.length).toBeGreaterThan(3);
      expect(Math.max(...frames.map(f => Math.abs(f.top)))).toBeLessThanOrEqual(
        1
      );
      expect(
        Math.max(...frames.map(f => Math.abs(f.scroll - scroll)))
      ).toBeLessThanOrEqual(1);
    }
  } finally {
    await page.close();
    await fixture.close();
  }
});
