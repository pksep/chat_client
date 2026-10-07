import { expect, test } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

test('новое socket-сообщение в открытой истории добавляется без следующей прокрутки', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 80 });
  await openTopic(page, 0);

  const scroller = page.locator('.chat__message-wrapper');
  await expect(
    page.locator('[data-message-id="performance-0-message-79"]')
  ).toBeVisible();

  await scroller.evaluate(element => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -500 }));
    element.scrollTop -= 500;
    element.dispatchEvent(new Event('scroll'));
  });

  const messageId = await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    const topicId = fixture.topics[0].id;
    const messageId = `${topicId}-socket-arrived`;

    fixture.emitChatEvent({
      type: 'newMessage',
      payload: {
        id: messageId,
        topicId,
        text: 'Сообщение из socket',
        type: 'TEXT',
        senderUserId: 'peer-0',
        senderUser: { id: 'peer-0', name: 'Собеседник 0' },
        createdAt: '2026-10-06T10:00:00.000Z',
        updatedAt: '2026-10-06T10:00:00.000Z',
        status: 'DELIVERED',
        media: [],
        reactions: [],
        messageRead: [],
        isReadByMe: false
      }
    });

    return messageId;
  });

  await expect(page.locator(`[data-message-id="${messageId}"]`)).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { getBufferedIncomingMessagesCountForTopic } = await import(
          /* @vite-ignore */ '/src/services/useChat.ts'
        );
        return getBufferedIncomingMessagesCountForTopic('performance-0');
      })
    )
    .toBe(0);
  expect(errors).toEqual([]);
});

test('реакция на видимое собственное сообщение очищается без прокрутки', async ({
  page
}) => {
  const { errors } = await openFixture(page, { count: 5 });
  await openTopic(page, 0);

  const wasCleared = await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const topicId = fixture.topics[0].id;
    const message = fixture.appendOwnMessage(topicId);

    fixture.setMessageVisibility(topicId, false);
    fixture.emitChatEvent({
      type: 'reactionUpdated',
      payload: {
        action: 'added',
        topicId,
        messageId: message.id,
        messageSenderUserId: 'performance-user',
        reactionSenderUserId: 'peer-0',
        reaction: {
          id: 'reaction-from-peer',
          senderUserId: 'peer-0',
          text: '❤️'
        }
      }
    });
    fixture.setMessageVisibility(topicId, true);

    const { getSelectedTopic } = await import(
      /* @vite-ignore */ '/src/composables/useTopics.ts'
    );
    return new Promise<boolean>(resolve => {
      window.setTimeout(
        () => resolve(!getSelectedTopic(topicId)?.hasUnreadReaction),
        80
      );
    });
  });

  expect(wasCleared).toBe(true);
  expect(errors).toEqual([]);
});
