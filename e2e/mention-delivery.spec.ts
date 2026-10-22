import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

const mentionedUserId = '05d01ee8-74cb-4ac1-ab7e-1da66c4540c3';
const caption = `<p>Проверка <span data-span data-user-id="${mentionedUserId}">@Князян Э. А.</span></p>`;

for (const retry of [false, true]) {
  test(`упоминание в подписи вложения передаётся серверу${retry ? ' после повтора' : ''}`, async ({
    page
  }) => {
    await openFixture(page, { count: 0 });
    await page.evaluate(
      async ({ caption, mentionedUserId, retry }) => {
        const fixture = (window as any).topicPerformance;
        const { controlConnection } = await import(
          '/e2e/fixtures/network-harness.ts'
        );
        const { mountMessageSender } = await import(
          '/e2e/fixtures/message-send-harness.ts'
        );
        controlConnection();
        const state = { attempts: [] as any[], accepted: [] as any[] };
        (window as any).mentionDelivery = state;
        fixture.sdk.sendWebSocketEvent = (_type: string, payload: any) => {
          if (!payload.medias) return true;
          state.attempts.push(payload);
          if (retry && state.attempts.length === 1) return false;
          state.accepted.push(payload);
          return true;
        };
        fixture.sdk.uploadFile = async () => ({
          objectName: 'mention-attachment',
          thumbnailObjectName: null
        });
        const file = retry
          ? new File(['test'], 'mention.txt', { type: 'text/plain' })
          : new File(
              [
                Uint8Array.from(
                  atob(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ocAAAAASUVORK5CYII='
                  ),
                  value => value.charCodeAt(0)
                )
              ],
              'image.png',
              { type: 'image/png' }
            );
        (window as any).mentionSender = mountMessageSender('performance-0');
        await (window as any).mentionSender.handleSend({
          content: caption,
          taggedUserIds: [mentionedUserId],
          ...(retry ? { files: [file] } : { mediaFiles: [file] })
        });
      },
      { caption, mentionedUserId, retry }
    );
    try {
      await expect
        .poll(() =>
          page.evaluate(() => (window as any).mentionDelivery.accepted.length)
        )
        .toBe(1);
      const result = await page.evaluate(() => ({
        attempts: (window as any).mentionDelivery.attempts,
        local: (window as any).topicPerformance.messages
          .getFullMessagesByTopicId('performance-0')
          .filter((row: any) => row.senderUserId === 'performance-user')
      }));
      expect(result.attempts).toHaveLength(retry ? 2 : 1);
      for (const payload of result.attempts) {
        expect(payload.taggedUserIds).toEqual([mentionedUserId]);
        expect(payload.text).toContain(mentionedUserId);
        expect(payload.medias).toHaveLength(1);
      }
      expect(result.local).toHaveLength(1);
      expect(result.local[0].taggedUserIds).toEqual([mentionedUserId]);
    } finally {
      await page.evaluate(() => (window as any).mentionSender.stop());
    }
  });
}

test('значок @ сохраняется при частичной истории и исчезает после прочтения упоминания', async ({
  page
}) => {
  await openFixture(page, { count: 0, topicCount: 1 });
  const rows = makeMessages('performance-0', 5).map((row, index) => ({
    ...row,
    isReadByMe: false,
    taggedUserIds: index === 0 ? ['performance-user'] : []
  }));
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    const topics = await import('/src/composables/useTopics.ts');
    fixture.setTopics([
      {
        ...fixture.topics[0],
        lastMessage: rows.at(-1),
        unreadMessageCount: rows.length,
        taggedMe: true
      }
    ]);
    topics.syncTopicUnreadState('performance-0');
    fixture.mountTopicList();
  }, rows);
  const badge = page.locator('.contact-list__mention');
  await expect(badge).toBeVisible();
  await page.evaluate(async rows => {
    const fixture = (window as any).topicPerformance;
    await fixture.shadow.loadShadowReadState('performance-0');
    fixture.seed('performance-0', rows.slice(-2));
  }, rows);
  await expect(badge).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.getSelectedTopic('performance-0')
          .unreadMessageCount
    )
  ).toBe(5);
  await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    // Чужая квитанция чтения не относится к нашему упоминанию.
    fixture.messages.changeLocalReadStatus(
      'performance-0',
      ['performance-0-message-4'],
      'peer-0'
    );
    fixture.messages.changeLocalReadStatus(
      'performance-0',
      ['performance-0-message-4'],
      'performance-user'
    );
  });
  await expect(badge).toBeVisible();
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    fixture.seed(
      'performance-0',
      rows.map((row: any, index: number) => ({
        ...row,
        isReadByMe: index === 4
      }))
    );
    fixture.messages.changeLocalReadStatus(
      'performance-0',
      [rows[0].id],
      'performance-user'
    );
  }, rows);
  await expect(badge).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as any).topicPerformance.getSelectedTopic('performance-0')
          .unreadMessageCount
    )
  ).toBe(3);
});
