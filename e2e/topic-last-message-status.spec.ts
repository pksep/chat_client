import { expect, test, type Page } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

const topicId = 'performance-1';
const outgoing = {
  ...makeMessages(topicId, 1)[0],
  senderUserId: 'performance-user',
  status: 'DELIVERED'
};

async function mountTopicList(page: Page) {
  await page.evaluate(() => (window as any).topicPerformance.mountTopicList());
  return page.locator(`[data-topic-id="${topicId}"]`);
}

for (const [serverStatus, cachedStatus, icon] of [
  ['DELIVERED', 'WAIT', 'DeliveredIcon'],
  ['READ', 'DELIVERED', 'ReadIcon']
]) {
  test(`${serverStatus} отображается при устаревшем ${cachedStatus} в кеше без открытия топика`, async ({
    page
  }) => {
    const state = await openFixture(page);
    await page.evaluate(
      ({ outgoing, serverStatus, cachedStatus }) => {
        const fixture = (window as any).topicPerformance;
        fixture.seed(outgoing.topicId, [{ ...outgoing, status: cachedStatus }]);
        fixture.setTopics([
          {
            ...fixture.getSelectedTopic(outgoing.topicId),
            lastMessage: { ...outgoing, status: serverStatus }
          }
        ]);
      },
      { outgoing, serverStatus, cachedStatus }
    );
    const row = await mountTopicList(page);
    await expect(row.locator(`[data-testid$="-${icon}"]`)).toBeVisible();
    await expect(row.locator('[data-testid$="-SendingIcon"]')).toHaveCount(0);
    expect(
      state.requests.filter(url => url.includes('/messages/topic/'))
    ).toEqual([]);
    expect(state.errors).toEqual([]);
  });
}

test('прочтение закрытого топика сохраняется после запоздавшего кеша и обновления списка', async ({
  page
}) => {
  const state = await openFixture(page);
  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    fixture.setTopics([
      { ...fixture.getSelectedTopic(outgoing.topicId), lastMessage: outgoing }
    ]);
  }, outgoing);
  const row = await mountTopicList(page);
  await expect(row.locator('[data-testid$="-DeliveredIcon"]')).toBeVisible();

  const receiptState = await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    fixture.emitChatEvent({
      type: 'readMessage',
      payload: {
        topicId: outgoing.topicId,
        messageIds: [outgoing.id],
        userId: 'peer-1'
      }
    });
    return {
      lastMessage: fixture.getSelectedTopic(outgoing.topicId)?.lastMessage
    };
  }, outgoing);
  expect(receiptState).toMatchObject({ lastMessage: { status: 'READ' } });
  await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();

  await page.evaluate(outgoing => {
    (window as any).topicPerformance.seed(outgoing.topicId, [outgoing]);
  }, outgoing);
  await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();

  await page.evaluate(outgoing => {
    (window as any).topicPerformance.updateLocalLastMessageTopic(
      outgoing.topicId
    );
  }, outgoing);
  await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();

  await page.evaluate(outgoing => {
    const fixture = (window as any).topicPerformance;
    // Прочтение могло прийти раньше старого HTTP-ответа со списком топиков.
    fixture.setTopics([
      { ...fixture.getSelectedTopic(outgoing.topicId), lastMessage: outgoing }
    ]);
  }, outgoing);
  await expect(row.locator('[data-testid$="-ReadIcon"]')).toBeVisible();
  expect(
    state.requests.filter(url => url.includes('/messages/topic/'))
  ).toEqual([]);
  expect(state.errors).toEqual([]);
});
