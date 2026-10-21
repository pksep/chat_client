import { expect, test } from '@playwright/test';
import {
  makeMessages,
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

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

for (const unreadCount of [3, 180]) {
  test(`плашка непрочитанных видна при открытии и сохраняется после чтения: ${unreadCount}`, async ({
    page
  }) => {
    const state = await openFixture(page, { count: 240, unreadCount });
    const firstUnreadIndex = 240 - unreadCount;
    const rows = makeMessages('performance-0', 240).map((row, index) => ({
      ...row,
      isReadByMe: index < firstUnreadIndex
    }));
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

test('возврат вниз после закрепа запрашивает последние сообщения и игнорирует поздний контекст', async ({
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
    await expect(message(page, 0, 0)).toBeInViewport();
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
