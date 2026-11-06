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

async function seed(page: Page, group = true) {
  const state = await openFixture(page, { count: 0 });
  const row = group
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
    ({ outgoing, group }) => {
      const fixture = (window as any).topicPerformance;
      const members = [
        { id: 'performance-user', initials: 'Я' },
        { id: 'waiting', initials: 'Анна Ожидает' },
        { id: 'delivered', initials: 'Борис Получил' },
        { id: 'reader', initials: 'Вера Прочитала' }
      ];
      fixture.setTopics([
        {
          ...fixture.getSelectedTopic(outgoing.topicId),
          type: group ? 'GROUP' : 'DM',
          members,
          user: members[1],
          lastMessage: outgoing
        }
      ]);
      fixture.seed(outgoing.topicId, [outgoing]);
    },
    { outgoing: row, group }
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
