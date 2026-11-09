import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const topicId = 'performance-0';
const outgoing = {
  ...makeMessages(topicId, 1)[0],
  senderUserId: 'performance-user',
  text: 'Проверяем доставку',
  status: 'DELIVERED',
  deliveryState: {
    recipientUserIds: ['reader', 'delivered', 'waiting'],
    delivered: [{ userId: 'delivered', createdAt: '2026-11-06T08:00:00Z' }],
    read: [{ userId: 'reader', createdAt: '2026-11-06T08:01:00Z' }]
  }
};

async function seed(
  page: Page,
  group = true,
  favorites = false,
  recipientCount = 0
) {
  const state = await openFixture(page, { count: 0 });
  const row = recipientCount
    ? {
        ...outgoing,
        deliveryState: {
          recipientUserIds: Array.from(
            { length: recipientCount },
            (_, index) => `recipient-${index}`
          ),
          delivered: [],
          read: []
        }
      }
    : favorites
      ? {
          ...outgoing,
          deliveryState: { recipientUserIds: [], delivered: [], read: [] }
        }
      : group
        ? outgoing
        : {
            ...outgoing,
            deliveryState: {
              recipientUserIds: ['waiting'],
              delivered: [],
              read: []
            }
          };
  await page.route('**/performance-api/messages/topic/performance-0*', route =>
    route.fulfill({
      json: route.request().url().includes('/pinned') ? [] : [row]
    })
  );
  await page.evaluate(
    ({ outgoing, group, favorites, recipientCount }) => {
      const fixture = (window as any).topicPerformance;
      const members = [
        { id: 'performance-user', initials: 'Я' },
        { id: 'waiting', initials: 'Анна Ожидает' },
        { id: 'delivered', initials: 'Борис Получил' },
        { id: 'reader', initials: 'Вера Прочитала' }
      ];
      if (recipientCount) {
        members.splice(
          1,
          3,
          ...outgoing.deliveryState.recipientUserIds.map((id, index) => ({
            id,
            initials: `Участник ${String(index).padStart(2, '0')}`
          }))
        );
      }
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic(outgoing.topicId),
          type: group ? 'GROUP' : 'DM',
          isFavorite: favorites,
          members: favorites ? [members[0]] : members,
          user: members[favorites ? 0 : 1],
          lastMessage: outgoing
        }
      ]);
      fixture.seed(outgoing.topicId, [outgoing]);
    },
    { outgoing: row, group, favorites, recipientCount }
  );
  await openTopic(page, 0);
  return state;
}

async function showDetails(page: Page) {
  const bubble = page.locator(`[data-message-id="${outgoing.id}"]`);
  await expect(bubble).toBeVisible();
  await bubble.locator('.message__article').click({ button: 'right' });
  const trigger = page.locator('[data-testid$="-MessageBubble-DetailsButton"]');
  if (page.viewportSize()!.width > 768) await trigger.hover();
  else await trigger.click();
  return page.locator('[data-testid$="-MessageBubble-ReceiptList"]');
}

test('В избранном контекстное меню не показывает Данные', async ({ page }) => {
  const { errors } = await seed(page, false, true);
  const bubble = page.locator(`[data-message-id="${outgoing.id}"]`);
  await expect(bubble).toBeVisible();
  await bubble.locator('.message__article').click({ button: 'right' });
  const menu = page.locator('.message-context-menu');
  await expect(menu).toBeVisible();
  await expect(
    menu.locator('[data-testid$="-MessageBubble-DetailsButton"]')
  ).toHaveCount(0);
  await expect(
    menu.getByRole('button', { name: 'Ответить', exact: true })
  ).toBeVisible();
  await expect(
    menu.getByRole('button', { name: 'Удалить', exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Длинный список данных прокручивается со скрытой полосой прокрутки', async ({
  page
}) => {
  const { errors } = await seed(page, true, false, 40);
  const list = await showDetails(page);
  await expect(list.locator('[data-user-id]')).toHaveCount(40);
  const scroller =
    page.viewportSize()!.width > 768
      ? page.locator('.message-context-menu__details-panel')
      : list;
  await expect(scroller).toHaveCSS('overflow-y', 'auto');
  await expect(scroller).toHaveCSS('scrollbar-width', 'none');
  expect(
    await scroller.evaluate(
      element => getComputedStyle(element, '::-webkit-scrollbar').display
    )
  ).toBe('none');
  expect(
    await scroller.evaluate(
      element => element.scrollHeight - element.clientHeight
    )
  ).toBeGreaterThan(500);
  await scroller.hover();
  await page.mouse.wheel(0, 2000);
  await expect
    .poll(() => scroller.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(list.locator('[data-user-id="recipient-39"]')).toBeInViewport();
  expect(errors).toEqual([]);
});

for (const favorites of [true, false]) {
  for (const flipped of [false, true]) {
    test(`Контекстное меню ${favorites ? 'избранного скрывает данные' : 'группы не сдвигается при открытии данных'}, ${flipped ? 'над точкой клика' : 'у верхней границы'}`, async ({
      page,
      isMobile
    }) => {
      test.skip(isMobile, 'Наведение открывает боковую панель на десктопе');
      await page.setViewportSize({ width: 1000, height: 600 });
      const { errors } = await seed(page, !favorites, favorites);
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'dark';
      });
      const bubble = page.locator(`[data-message-id="${outgoing.id}"]`);
      await expect(bubble).toBeVisible();
      const anchor = { clientX: 970, clientY: 20 };
      const openAt = (coordinates: typeof anchor) =>
        bubble.evaluate((element, coordinates) => {
          element.dispatchEvent(
            new MouseEvent('contextmenu', {
              ...coordinates,
              bubbles: true,
              cancelable: true
            })
          );
        }, coordinates);
      await openAt(anchor);
      const menu = page.locator('.message-context-menu');
      await expect(menu).toHaveCSS('top', '55px');
      if (flipped) {
        const rect = (await menu.boundingBox())!;
        await openAt({
          ...anchor,
          clientY: rect.height + 20
        });
        await expect(menu).toHaveClass(/context-menu--flip-y/);
      }
      const reactions = menu.locator('.select-reactions--ready');
      await expect(reactions).toBeVisible();
      const details = menu.locator(
        '[data-testid$="-MessageBubble-DetailsButton"]'
      );
      const remove = menu.locator(
        '[data-testid$="-MessageBubble-DeleteButton"]'
      );
      const panel = menu.locator('.message-context-menu__details-panel');
      if (favorites) {
        await expect(details).toHaveCount(0);
        await expect(panel).toHaveCount(0);
        await expect(remove).toBeVisible();
        await expect(
          menu.getByRole('button', { name: 'Ответить', exact: true })
        ).toBeVisible();
        expect(errors).toEqual([]);
        return;
      }
      await page.evaluate(() => {
        const selectors = [
          '.message-context-menu',
          '.select-reactions',
          '[data-testid$="-MessageBubble-DetailsButton"]',
          '[data-testid$="-MessageBubble-DeleteButton"]'
        ];
        const frames: number[][][] = [];
        (window as any).menuHoverFrames = frames;
        (window as any).sampleMenuHover = true;
        const sample = () => {
          if (!(window as any).sampleMenuHover) return;
          frames.push(
            selectors.map(selector => {
              const rect = document
                .querySelector(selector)!
                .getBoundingClientRect();
              return [rect.x, rect.y, rect.width, rect.height];
            })
          );
          requestAnimationFrame(sample);
        };
        sample();
      });
      for (let index = 0; index < 3; index++) {
        await details.hover();
        await expect(panel).toBeVisible();
        await expect(menu).toHaveCSS('top', '55px');
        await expect(panel.locator('[data-user-id]')).toHaveCount(3);
        const rect = (await panel.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(8);
        expect(rect.y).toBeGreaterThanOrEqual(8);
        expect(rect.x + rect.width).toBeLessThanOrEqual(992);
        expect(rect.y + rect.height).toBeLessThanOrEqual(592);
        await panel.hover();
        await expect(panel).toBeVisible();
        await remove.hover();
        await expect(panel).toHaveCount(0);
      }
      const frames = await page.evaluate(() => {
        (window as any).sampleMenuHover = false;
        return (window as any).menuHoverFrames as number[][][];
      });
      expect(frames.length).toBeGreaterThan(10);
      for (let element = 0; element < frames[0].length; element++) {
        for (let coordinate = 0; coordinate < 4; coordinate++) {
          const values = frames.map(frame => frame[element][coordinate]);
          expect(Math.max(...values) - Math.min(...values)).toBeLessThan(1);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

test('Данные показывает всех получателей по порядку: прочитано, доставлено, ожидается', async ({
  page
}, testInfo) => {
  const { errors } = await seed(page);
  const bubble = page.locator(`[data-message-id="${outgoing.id}"]`);
  await expect(bubble.locator('[data-testid$="-SentIcon"]')).toBeVisible();
  const details = await showDetails(page);
  await expect(details.locator('[data-user-id]')).toHaveCount(3);
  expect(
    await details
      .locator('[data-user-id]')
      .evaluateAll(elements =>
        elements.map(element => element.getAttribute('data-user-id'))
      )
  ).toEqual(['reader', 'delivered', 'waiting']);
  await expect(
    details.locator('[data-user-id="reader"] [data-testid$="-ReadIcon"]')
  ).toBeVisible();
  await expect(
    details.locator(
      '[data-user-id="delivered"] [data-testid$="-DeliveredIcon"]'
    )
  ).toBeVisible();
  await expect(
    details.locator('[data-user-id="waiting"] [data-testid$="-SentIcon"]')
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('message-receipts.png') });
  expect(errors).toEqual([]);
});

test('галочки переходят в доставлено и прочитано после подтверждений всех участников', async ({
  page
}) => {
  const { errors } = await seed(page);
  const bubble = page.locator(`[data-message-id="${outgoing.id}"]`);
  await expect(bubble.locator('[data-testid$="-SentIcon"]')).toBeVisible();
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    fixture.emitChatEvent({
      type: 'messageDelivered',
      payload: {
        topicId: outgoing.topicId,
        userId: 'waiting',
        deliveries: [
          { messageId: outgoing.id, createdAt: '2026-11-06T08:02:00Z' }
        ]
      }
    });
  }, outgoing);
  await expect(bubble.locator('[data-testid$="-DeliveredIcon"]')).toBeVisible();
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    for (const userId of ['delivered', 'waiting'])
      fixture.emitChatEvent({
        type: 'readMessage',
        payload: {
          topicId: outgoing.topicId,
          userId,
          messageIds: [outgoing.id]
        }
      });
    fixture.seed(outgoing.topicId, [outgoing]);
  }, outgoing);
  await expect(bubble.locator('[data-testid$="-ReadIcon"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Данные доступно до первого прочтения, в том числе в личном чате', async ({
  page
}) => {
  await seed(page, false);
  const details = await showDetails(page);
  await expect(details.locator('[data-user-id]')).toHaveCount(1);
  await expect(details.locator('[data-user-id="waiting"]')).toContainText(
    'Не доставлено'
  );
});

test('получение сообщения закрытого чата подтверждает доставку без прочтения', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 0 });
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    const calls: any[] = [];
    (window as any).deliveryCalls = calls;
    fixture.sdk.socket = { connected: true, emit: () => {} };
    fixture.sdk.ws.sendWebSocketEventWithAck = async (
      type: string,
      payload: any
    ) => {
      calls.push({ type, payload });
      return { success: true };
    };
    fixture.sdk.handleWebSocketEvent({
      type: 'changeMessage',
      payload: {
        type: 'NEW',
        topicId: outgoing.topicId,
        data: {
          ...outgoing,
          senderUserId: 'peer-0',
          deliveryState: {
            recipientUserIds: ['performance-user'],
            delivered: [],
            read: []
          }
        }
      }
    });
  }, outgoing);
  await expect
    .poll(() => page.evaluate(() => (window as any).deliveryCalls))
    .toEqual([
      {
        type: 'deliverMessage',
        payload: { topicId, messageIds: [outgoing.id] }
      }
    ]);
  const message = await page.evaluate(
    outgoing =>
      (window as any).topicPerformance.messages.getFullMessagesByTopicId(
        outgoing.topicId
      )[0],
    outgoing
  );
  expect(message.messageRead).toEqual([]);
  expect(errors).toEqual([]);
});

test('превью закрытой группы сохраняет подтверждения после устаревшего списка чатов', async ({
  page
}) => {
  await openFixture(page, { count: 0 });
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    fixture.setTopics([
      {
        ...fixture.getSelectedTopic(outgoing.topicId),
        type: 'GROUP',
        lastMessage: outgoing
      }
    ]);
    fixture.mountTopicList();
  }, outgoing);
  const row = page.locator(`[data-topic-id="${topicId}"]`);
  await expect(row.locator('[data-testid$="-SentIcon"]')).toBeVisible();
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    fixture.emitChatEvent({
      type: 'messageDelivered',
      payload: {
        topicId: outgoing.topicId,
        userId: 'waiting',
        deliveries: [
          { messageId: outgoing.id, createdAt: '2026-11-06T08:02:00Z' }
        ]
      }
    });
    fixture.setTopics([
      {
        ...fixture.getSelectedTopic(outgoing.topicId),
        lastMessage: outgoing
      }
    ]);
  }, outgoing);
  await expect(row.locator('[data-testid$="-DeliveredIcon"]')).toBeVisible();
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    for (const userId of ['waiting', 'delivered'])
      fixture.emitChatEvent({
        type: 'readMessage',
        payload: {
          topicId: outgoing.topicId,
          userId,
          messageIds: [outgoing.id]
        }
      });
    fixture.setTopics([
      {
        ...fixture.getSelectedTopic(outgoing.topicId),
        lastMessage: outgoing
      }
    ]);
  }, outgoing);
  await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();
});
