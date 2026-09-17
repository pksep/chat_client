import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test('звук упоминания обходит mute, обычное сообщение и дубликат молчат', async ({
  page
}) => {
  const fixture = await createAndroidPerformanceServer({
    port: 0,
    topicCount: 3,
    userCount: 5,
    messagesPerTopic: 2
  });
  // Порт назначается ОС, чтобы desktop и mobile не делили сокеты.
  const address = fixture.io.httpServer.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;
  const config = Object.fromEntries(
    Object.entries(fixture.config).map(([key, value]) => [
      key,
      value.replace(fixture.origin, origin)
    ])
  );
  fixture.topics[1].info.isMute = true;
  try {
    await page.route('**/*', route =>
      ['localhost', '127.0.0.1'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    );
    await page.addInitScript(
      ({ origin, config, user }) => {
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'mention-fixture', user })
        );
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        localStorage.setItem(
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
        );
        (window as any).__messageSounds = 0;
        (window as any).Audio = class extends EventTarget {
          src = '';
          preload = '';
          load() {
            this.dispatchEvent(new Event('canplaythrough'));
          }
          async play() {
            if (this.src.endsWith('/audio/new-message.mp3'))
              (window as any).__messageSounds++;
          }
        };
      },
      { origin, config, user: fixture.user }
    );
    await page.goto('/');
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    await expect.poll(() => fixture.io.sockets.sockets.size).toBe(1);
    const topic = fixture.topics[1];
    const send = (index: number, taggedUserIds: string[] = []) => ({
      ...topic.lastMessage,
      id: `29410000-0000-4000-8000-99999999900${index}`,
      text: `Проверка упоминания ${index}`,
      taggedUserIds,
      isReadByMe: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const row = page.locator(`[data-topic-id="${topic.id}"]`).first();
    fixture.io.emit('newMessage', send(1));
    await expect(row).toContainText('Проверка упоминания 1');
    expect(await page.evaluate(() => (window as any).__messageSounds)).toBe(0);
    fixture.io.emit('newMessage', send(2, [fixture.users[2].id]));
    await expect(row).toContainText('Проверка упоминания 2');
    expect(await page.evaluate(() => (window as any).__messageSounds)).toBe(0);
    const mention = send(3, [fixture.user.id]);
    fixture.io.emit('newMessage', mention);
    await expect
      .poll(() => page.evaluate(() => (window as any).__messageSounds))
      .toBe(1);
    fixture.io.emit('newMessage', mention);
    fixture.io.emit('newMessage', send(4));
    await expect(row).toContainText('Проверка упоминания 4');
    expect(await page.evaluate(() => (window as any).__messageSounds)).toBe(1);
  } finally {
    await fixture.close();
  }
});
