import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.locator('dialog.ios-push-modal[open]'),
    async dialog => {
      await dialog
        .getByRole('button', { name: 'Настроить позже', exact: true })
        .click();
    }
  );
});

test('фон цитаты сжимается вокруг текста и повторяется без сдвига строк', async ({
  page
}, testInfo) => {
  const state = await openFixture(page, { count: 20, shell: true });
  const quote =
    'Нужный фрагмент с достаточно длинным продолжением на нескольких строках';
  const rows = makeMessages('performance-0', 20).map((row, index) =>
    index === 18
      ? {
          ...row,
          text: `До цитаты. <strong>Нужный фрагмент</strong>${quote.slice('Нужный фрагмент'.length)}. После цитаты.`
        }
      : row
  );
  const history = rows.map((row, index) =>
    index === 19
      ? {
          ...row,
          replyMessage: rows[18],
          ex: JSON.stringify({ replyQuoteText: quote })
        }
      : row
  );
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: history })
  );
  await page.route('**/messages/performance-0-message-18/around*', route =>
    route.fulfill({ json: history })
  );
  await openTopic(page, 0);
  const source = message(page, 0, 18);
  const content = source.locator('.message-content__html');
  await content.evaluate(element => {
    (element as HTMLElement).style.width = '230px';
  });
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  const reply = message(page, 0, 19).locator('.message-reference-reply');
  await reply.click();
  const mark = source.locator('mark.message-quote-highlight');
  const backgrounds = mark.locator('.message-quote-highlight__rect');
  await expect(mark).toHaveText(quote);
  await expect.poll(() => backgrounds.count()).toBeGreaterThan(1);
  await page.waitForTimeout(100);

  const sample = (time: number) =>
    mark.evaluate((element, time) => {
      const rects = Array.from(
        element.querySelectorAll<HTMLElement>('.message-quote-highlight__rect')
      );
      rects.forEach(rect =>
        rect.getAnimations().forEach(animation => {
          animation.pause();
          animation.currentTime = time;
        })
      );
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      let node = walker.nextNode();
      while (node) {
        nodes.push(node as Text);
        node = walker.nextNode();
      }
      const range = document.createRange();
      range.setStart(nodes[0], 0);
      range.setEnd(nodes.at(-1)!, nodes.at(-1)!.length);
      return {
        text: range.getBoundingClientRect().toJSON(),
        scale:
          rects[0].getBoundingClientRect().width /
          parseFloat(rects[0].style.width),
        opacity: Number(getComputedStyle(rects[0]).opacity)
      };
    }, time);
  const expanding = await sample(100);
  expect(expanding.scale).toBeGreaterThan(1.5);
  expect(expanding.opacity).toBeGreaterThan(0);
  await source.screenshot({
    path: testInfo.outputPath('quote-background-expanding.png')
  });
  const settled = await sample(400);
  expect(settled.scale).toBeCloseTo(1, 2);
  expect(settled.text).toEqual(expanding.text);
  expect(settled.opacity).toBe(1);
  await source.screenshot({
    path: testInfo.outputPath('quote-background-settled.png')
  });

  const previousMark = await mark.elementHandle();
  await reply.click();
  await expect
    .poll(() => previousMark!.evaluate(element => element.isConnected))
    .toBe(false);
  await expect.poll(() => backgrounds.count()).toBeGreaterThan(1);
  const repeated = await sample(100);
  expect(repeated.scale).toBeGreaterThan(1.5);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reply.click();
  await expect.poll(() => backgrounds.count()).toBeGreaterThan(1);
  await expect
    .poll(() =>
      backgrounds.first().evaluate(element => ({
        transform: getComputedStyle(element).transform,
        opacity: getComputedStyle(element).opacity,
        animations: element.getAnimations().length
      }))
    )
    .toEqual({ transform: 'none', opacity: '1', animations: 0 });
  await expect(mark).toHaveCount(0, { timeout: 4500 });
  await expect(content).toContainText(quote);
  await expect(content.locator('strong')).toHaveText('Нужный фрагмент');
  await expect(
    source.locator('.message-quote-highlight__background')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('цитата в длинном сообщении прокручивается один раз и сохраняет позицию после контекста', async ({
  page
}) => {
  const state = await openFixture(page, { count: 30, shell: true });
  const quote = 'Нужный фрагмент';
  const rows = makeMessages('performance-0', 30).map((row, index) =>
    index === 20
      ? {
          ...row,
          text: Array.from({ length: 55 }, (_, line) =>
            line === 4 || line === 30 ? quote : `Строка ${line}`
          ).join('<br>')
        }
      : row
  );
  const history = rows.map((row, index) =>
    index === 29
      ? {
          ...row,
          replyMessage: rows[20],
          ex: JSON.stringify({
            replyQuoteText: quote,
            replyQuoteOccurrenceIndex: 1
          })
        }
      : row
  );
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: history })
  );
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(
    '**/messages/performance-0-message-20/around*',
    async route => {
      await gate;
      await route.fulfill({
        json: rows
          .slice(0, 29)
          .map((row, index) =>
            index === 18 ? { ...row, text: 'Контекст обновлён' } : row
          )
      });
    }
  );
  try {
    await openTopic(page, 0);
    await expect(message(page, 0, 29)).toBeInViewport();
    await expect(
      page.locator('.ProseMirror[contenteditable="true"]')
    ).toBeVisible();
    await expect(page.locator('.chat__input--booting')).toHaveCount(0);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    const sourceContent = message(page, 0, 20).locator(
      '.message-content__html'
    );
    const sourceText = await sourceContent.textContent();
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      fixture.navigationScrolls = [];
      const scrollTo = HTMLElement.prototype.scrollTo;
      HTMLElement.prototype.scrollTo = function (...args: any[]) {
        if (this.classList.contains('chat__message-wrapper')) {
          fixture.navigationScrolls.push({
            before: this.scrollTop,
            ...args[0]
          });
        }
        return scrollTo.apply(this, args as any);
      };
    });
    await message(page, 0, 29).locator('.message-reference-reply').click();
    const mark = message(page, 0, 20).locator('mark.message-quote-highlight');
    await expect(mark).toHaveText(quote);
    const quoteOffset = () =>
      mark.evaluate(element => {
        const container = element.closest('.chat__message-wrapper')!;
        const bounds = container.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2 - (bounds.top + bounds.height / 2);
      });
    await expect
      .poll(async () => Math.abs(await quoteOffset()))
      .toBeLessThan(3);
    release();
    await expect(message(page, 0, 18)).toContainText('Контекст обновлён');
    await page.waitForTimeout(300);
    await expect
      .poll(async () => Math.abs(await quoteOffset()))
      .toBeLessThan(3);
    const movements = await page.evaluate(() =>
      (window as any).topicPerformance.navigationScrolls.filter(
        (scroll: any) => Math.abs(scroll.top - scroll.before) > 1
      )
    );
    expect(movements).toHaveLength(1);
    expect(movements[0].behavior).toBe('smooth');
    await expect(mark).toHaveCount(0, { timeout: 4500 });
    await expect(sourceContent).toHaveText(sourceText || '');
    expect(state.errors).toEqual([]);
  } finally {
    release();
  }
});

for (const receiveWhileLoading of [false, true]) {
  test(`переход по цитате сохраняет конец открытого чата: новое сообщение во время запроса ${receiveWhileLoading}`, async ({
    page
  }) => {
    const state = await openFixture(page);
    const rows = makeMessages('performance-0', 21);
    const history = rows
      .slice(0, 20)
      .map((row, index) =>
        index === 19 ? { ...row, replyMessage: rows[16] } : row
      );
    await page.route('**/messages/topic/performance-0?*', route =>
      route.fulfill({ json: history })
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(
      '**/messages/performance-0-message-16/around*',
      async route => {
        await gate;
        await route.fulfill({
          json: rows
            .slice(0, 19)
            .map((row, index) =>
              index === 16 ? { ...row, text: 'Обновлённое сообщение' } : row
            )
        });
      }
    );
    try {
      await openTopic(page, 0);
      await expect(message(page, 0, 19)).toBeInViewport();
      const contextRequest = page.waitForRequest(request =>
        request.url().includes('/messages/performance-0-message-16/around')
      );
      await message(page, 0, 19).locator('.message-reference-reply').click();
      await contextRequest;
      if (receiveWhileLoading) {
        await page.evaluate(row => {
          (window as any).topicPerformance.messages.addMessageToLocal(
            'performance-0',
            row
          );
        }, rows[20]);
        await expect(message(page, 0, 20)).toBeAttached();
      }
      release();
      await expect(message(page, 0, 16)).toContainText('Обновлённое сообщение');
      await expect(message(page, 0, 19)).toBeAttached();
      await expect(
        message(page, 0, 19).locator('.message-reference-reply')
      ).toBeAttached();
      if (receiveWhileLoading) {
        await expect(message(page, 0, 20)).toBeAttached();
      }
      expect(state.errors).toEqual([]);
    } finally {
      release();
    }
  });
}

for (const readFlag of [false, undefined]) {
  test(`переход к старому закрепу не создаёт непрочитанные из isReadByMe=${readFlag}`, async ({
    page
  }) => {
    const state = await openFixture(page, {
      shell: true,
      count: 240,
      pinOutsideHistory: true
    });
    const rows = makeMessages('performance-0', 240);
    await page.route('**/messages/performance-0-message-0/around*', route =>
      route.fulfill({
        json: rows.slice(0, 40).map(row => ({ ...row, isReadByMe: readFlag }))
      })
    );
    await openTopic(page, 0);
    await expect(message(page, 0, 239)).toBeInViewport();
    const divider = page.locator('.chat__message-unread_messages_start');
    await expect(divider).toHaveCount(0);
    await page
      .getByTestId('Pinned-Messages')
      .locator('.chat__input__action__blog')
      .click();
    await expect(message(page, 0, 0)).toBeInViewport();
    await expect(message(page, 0, 39)).toBeAttached();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(divider).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Перейти к новым сообщениям', exact: true })
      .click();
    await expect(message(page, 0, 239)).toBeInViewport();
    await expect(divider).toHaveCount(0);
    expect(state.errors).toEqual([]);
  });
}

test('прочитанный чат не создаёт плашку из старых флагов начальной страницы', async ({
  page
}) => {
  const state = await openFixture(page, { count: 40 });
  const rows = makeMessages('performance-0', 40).map(row => ({
    ...row,
    isReadByMe: false
  }));
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  await expect(message(page, 0, 39)).toBeInViewport();
  await expect(
    page.locator('.chat__message-unread_messages_start')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

for (const pinCount of [1, 2]) {
  test(`SELF-открепление сразу убирает значок и отправляет исходный ID: ${pinCount} закрепов`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true, count: 20 });
    const rows = makeMessages('performance-0', 20).map((row, index) => ({
      ...row,
      isPin: index >= 20 - pinCount,
      isPinnedOnlyMe: index >= 20 - pinCount,
      isPinnedForMe: index >= 20 - pinCount,
      isPinnedForAll: false
    }));
    await page.route('**/messages/topic/performance-0?*', route =>
      route.fulfill({ json: rows })
    );
    await page.route('**/messages/topic/performance-0/pinned', route =>
      route.fulfill({ json: rows.filter(row => row.isPin) })
    );
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      fixture.pinEvents = [];
      fixture.sdk.sendWebSocketEvent = (type: string, payload: unknown) => {
        if (type === 'togglePinMessage') fixture.pinEvents.push(payload);
        return true;
      };
    });
    await openTopic(page, 0);
    await expect(message(page, 0, 19)).toBeInViewport();
    const pinIcon = message(page, 0, 19).locator('[data-testid$="-PinIcon"]');
    await expect(pinIcon).toBeVisible();
    await expect(page.getByTestId('Pinned-Messages')).toContainText(
      'Сообщение 19 в performance-0'
    );
    await page.getByTestId('Pinned-Messages-CloseButton').click();
    await page.getByRole('button', { name: 'Да', exact: true }).click();
    await expect(pinIcon).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).topicPerformance.pinEvents)
      )
      .toEqual([
        {
          topicId: 'performance-0',
          messageId: 'performance-0-message-19',
          userId: 'performance-user',
          scope: 'SELF'
        }
      ]);
    if (pinCount === 1) {
      await expect(page.getByTestId('Pinned-Messages')).toHaveCount(0);
    } else {
      await expect(page.getByTestId('Pinned-Messages')).toContainText(
        'Сообщение 18 в performance-0'
      );
      await expect(
        message(page, 0, 18).locator('[data-testid$="-PinIcon"]')
      ).toBeVisible();
    }
    expect(state.errors).toEqual([]);
  });
}

test('своя отправка скрывает плашку непрочитанных и она не возвращается после обновления списка и фокуса', async ({
  page
}) => {
  const state = await openFixture(page, { count: 40, unreadCount: 3 });
  const rows = makeMessages('performance-0', 40).map((row, index) => ({
    ...row,
    isReadByMe: index < 37
  }));
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  const divider = page.locator('.chat__message-unread_messages_start');
  await expect(divider).toBeInViewport();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  const editor = page.locator('.chat__input .ProseMirror');
  await editor.fill('Мой ответ в этом чате');
  await expect(divider).toBeAttached();
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const { controlConnection } = await import(/* @vite-ignore */ path);
    controlConnection();
    (window as any).topicPerformance.sdk.sendWebSocketEvent = () => true;
  });
  await page.locator('.chat__input .toolbar-button.right:visible').click();
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    1
  );
  await expect(divider).toHaveCount(0);
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    fixture.messages.mergeMessagesForTopic(
      'performance-0',
      fixture.messages
        .getMessagesByTopicId('performance-0')
        .map((row: any) => ({
          ...row,
          isReadByMe: true
        })),
      'replace',
      { syncLastMessage: false }
    );
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(divider).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('своя реакция скрывает плашку только в текущем чате и она не возвращается от read-receipt', async ({
  page
}) => {
  const state = await openFixture(page, { count: 40, unreadCount: 3 });
  const rows = makeMessages('performance-0', 40).map((row, index) => ({
    ...row,
    isReadByMe: index < 37,
    reactions:
      index === 37
        ? [
            {
              id: 'reaction',
              messageId: row.id,
              senderUserId: 'peer',
              text: '❤️'
            }
          ]
        : []
  }));
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  const divider = page.locator('.chat__message-unread_messages_start');
  await expect(divider).toBeInViewport();
  await page.evaluate(async () => {
    (window as any).topicPerformance.sdk.sendWebSocketEvent = () => true;
    const path = '/src/services/useChat.ts';
    await (
      await import(/* @vite-ignore */ path)
    ).setReactionMessage({
      messageId: 'another-message',
      topicId: 'performance-1',
      emoji: '❤️'
    });
  });
  await expect(divider).toBeInViewport();
  await message(page, 0, 37).locator('.reaction').first().click();
  await expect(divider).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(divider).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('прочитанный чат без устаревших read-флагов не получает плашку непрочитанных', async ({
  page
}) => {
  const state = await openFixture(page, { count: 40, unreadCount: 0 });
  const rows = makeMessages('performance-0', 40).map(row => ({
    ...row,
    isReadByMe: undefined
  }));
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await expect(message(page, 0, 39)).toBeInViewport();
  await expect(
    page.locator('.chat__message-unread_messages_start')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

for (const unreadCount of [3, 180, 900]) {
  test(`плашка непрочитанных видна при открытии и сохраняется после чтения: ${unreadCount}`, async ({
    page
  }) => {
    const messageCount = Math.max(240, unreadCount + 60);
    const state = await openFixture(page, { count: messageCount, unreadCount });
    const firstUnreadIndex = messageCount - unreadCount;
    const rows = makeMessages('performance-0', messageCount).map(
      (row, index) => ({
        ...row,
        isReadByMe: index < firstUnreadIndex
      })
    );
    await page.route('**/messages/topic/performance-0?*', async route => {
      const params = new URL(route.request().url()).searchParams;
      const limit = Number(params.get('limit') || 48);
      if (params.has('afterMessageId')) {
        const cursor = rows.findIndex(
          row => row.id === params.get('afterMessageId')
        );
        return route.fulfill({
          json: rows.slice(cursor + 1, cursor + 1 + limit)
        });
      }
      // Production's default page is around the first unread, not the newest page.
      const start = Math.max(0, firstUnreadIndex - 20);
      return route.fulfill({
        json:
          params.get('newMessages') === 'true'
            ? rows.slice(-limit)
            : rows.slice(start, start + 81)
      });
    });
    await openTopic(page, 0);
    const divider = page.locator('.chat__message-unread_messages_start');
    await expect(divider).toBeInViewport();
    await expect(message(page, 0, firstUnreadIndex)).toBeInViewport();
    await page.evaluate(() => {
      const fixture = (window as any).topicPerformance;
      const visible = fixture.messages.getMessagesByTopicId('performance-0');
      fixture.messages.mergeMessagesForTopic(
        'performance-0',
        visible.map((row: any) => ({ ...row, isReadByMe: true })),
        'replace',
        { syncLastMessage: false }
      );
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    await expect(divider).toBeAttached();
    await expect(divider.locator('..')).toContainText(
      'Непрочитанные сообщения'
    );
    await page.waitForTimeout(1200);
    await expect(divider).toBeInViewport();
    if (unreadCount > 100) {
      const wrapper = page.locator('.chat__message-wrapper');
      const initialTop = await wrapper.evaluate(element => {
        const initialTop = element.scrollTop;
        element.scrollTop += 500;
        element.dispatchEvent(new Event('scroll'));
        return initialTop;
      });
      await expect(divider).toBeAttached();
      await wrapper.evaluate((element, top) => {
        element.scrollTop = top;
        element.dispatchEvent(new Event('scroll'));
      }, initialTop);
      await expect(divider).toBeInViewport();
    }
    expect(state.errors).toEqual([]);
  });
}

test('возврат вниз отменяет ожидающий переход к закрепу и игнорирует поздний контекст', async ({
  page
}) => {
  const state = await openFixture(page, {
    shell: true,
    count: 240,
    pinOutsideHistory: true
  });
  const rows = makeMessages('performance-0', 240);
  await page.route('**/messages/topic/performance-0?*', async route => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({
      json:
        params.get('newMessages') === 'true'
          ? rows.slice(-50)
          : rows.slice(100, 150)
    });
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(
    '**/messages/performance-0-message-0/around*',
    async route => {
      await gate;
      await route.fulfill({ json: rows.slice(0, 40) });
    }
  );
  try {
    await openTopic(page, 0);
    await expect(page.getByTestId('Pinned-Messages')).toBeVisible();
    await page
      .getByTestId('Pinned-Messages')
      .locator('.chat__input__action__blog')
      .click();
    await expect(
      page.locator('.chat__message-navigation-overlay')
    ).toBeVisible();
    await expect(message(page, 0, 0)).not.toBeAttached();
    await page.locator('.chat__message-wrapper').hover();
    await page.mouse.wheel(0, -500);
    const latestRequest = page.waitForRequest(request => {
      const url = new URL(request.url());
      return (
        url.pathname.endsWith('/messages/topic/performance-0') &&
        url.searchParams.get('newMessages') === 'true'
      );
    });
    await page
      .getByRole('button', { name: 'Перейти к новым сообщениям', exact: true })
      .click();
    await latestRequest;
    await expect(message(page, 0, 239)).toBeInViewport();
    release();
    await page.waitForTimeout(800);
    await expect(message(page, 0, 239)).toBeInViewport();
    await expect(message(page, 0, 0)).not.toBeAttached();
    expect(state.errors).toEqual([]);
  } finally {
    release();
  }
});

test('закреп из разрозненного кеша получает последовательное окружение с сервера', async ({
  page
}) => {
  const state = await openFixture(page, {
    shell: true,
    count: 240,
    pinOutsideHistory: true
  });
  const rows = makeMessages('performance-0', 240);
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    [...rows.slice(0, 10), ...rows.slice(-50)]
  );
  await page.route('**/messages/performance-0-message-0/around*', route =>
    route.fulfill({ json: rows.slice(0, 40) })
  );
  await openTopic(page, 0);
  await expect(message(page, 0, 239)).toBeInViewport();
  await page
    .getByTestId('Pinned-Messages')
    .locator('.chat__input__action__blog')
    .click();
  await expect(message(page, 0, 0)).toBeInViewport();
  await expect(message(page, 0, 39)).toBeAttached();
  await expect(message(page, 0, 190)).not.toBeAttached();
  expect(state.errors).toEqual([]);
});
