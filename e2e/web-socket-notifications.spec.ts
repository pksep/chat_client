import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

test('входящий сокет уведомляет о другом чате с учётом прочтения, mute и упоминаний', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  test.setTimeout(60_000);
  const { errors } = await openFixture(page);
  await page.evaluate(() => {
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      value: 'granted'
    });
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'performance-test',
        user: { id: 'performance-user' }
      })
    );
    (window as any).socketNotifications = [];
    navigator.serviceWorker.getRegistration = async () =>
      ({
        active: {
          scriptURL: `${location.origin}/service-worker.js`,
          postMessage: (data: unknown) => {
            (window as any).socketNotifications.push(data);
          }
        }
      }) as unknown as ServiceWorkerRegistration;
  });
  await page.evaluate(
    async rows => {
      const fixture = (window as any).topicPerformance;
      const path = '/src/composables/useTopics.ts';
      const { getSelectedTopic, setTopics } = await import(
        /* @vite-ignore */ path
      );
      setTopics(fixture.topics);
      fixture.navigate('performance-0');
      const send = (id: string, extra = {}) =>
        fixture.emitChatEvent({
          type: 'newMessage',
          payload: { ...rows[0], id, isReadByMe: false, ...extra }
        });
      send('other-chat');
      send('other-chat');
      send('already-read', { isReadByMe: true });
      send('own', { senderUserId: 'performance-user' });
      send('system', { isSystem: true });
      getSelectedTopic('performance-1').info.isMute = true;
      send('muted');
      send('mention', { taggedUserIds: ['performance-user'] });
    },
    makeMessages('performance-1', 1)
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).socketNotifications
          .filter((item: any) => item.type === 'SOCKET_MESSAGE_NOTIFICATION')
          .map((item: any) => item.payload.messageId)
      )
    )
    .toEqual(['other-chat', 'mention']);
  expect(errors).toEqual([]);
});
