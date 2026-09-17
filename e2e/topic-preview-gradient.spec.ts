import { expect, test, type Locator } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test('градиент превью сохраняется при переподключении, новых сообщениях и возврате в список', async ({
  page,
  isMobile
}) => {
  test.setTimeout(90_000);
  const fixture = await createAndroidPerformanceServer({
    port: isMobile ? 5196 : 5197,
    topicCount: 6,
    userCount: 12,
    messagesPerTopic: 4
  });
  const topic = fixture.topics[1];
  const longText =
    'Длинное последнее сообщение для проверки плавного затухания текста в конце строки. '.repeat(
      3
    );
  topic.lastMessage!.text = longText;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const expectFade = async (description: Locator, overflow: boolean) => {
    await expect
      .poll(
        () =>
          description.evaluate(element => ({
            overflows: element.scrollWidth > element.clientWidth + 1,
            fades:
              getComputedStyle(element).maskImage.includes('linear-gradient')
          })),
        { timeout: 1500 }
      )
      .toEqual({ overflows: overflow, fades: overflow });
  };
  try {
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
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 60_000
    });
    if (isMobile)
      await page.getByRole('button', { name: 'Остаться в браузере' }).click();
    const row = page.locator(`[data-topic-id="${topic.id}"]:visible`);
    const preview = row.locator('.contact-list__description');
    await expect(preview).toHaveText(longText.trim());
    await expect.poll(() => fixture.io.engine.clientsCount).toBe(1);
    // Сначала измеряем видимый список, затем обрываем только транспорт.
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ ...viewport, width: viewport.width - 1 });
    await expectFade(preview, true);
    const connectionsBefore = fixture.connections.filter(
      item => item.event === 'connect'
    ).length;
    fixture.latency.topics = 5000;
    for (const socket of fixture.io.sockets.sockets.values())
      socket.conn.close();
    await expect
      .poll(
        () =>
          fixture.connections.filter(item => item.event === 'connect').length
      )
      .toBeGreaterThan(connectionsBefore);
    // Дожидаемся обработки connect на клиенте до проверки кадра.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { getHasWebsocketConnection } = await import(
            '/src/services/useChat.ts'
          );
          return getHasWebsocketConnection();
        })
      )
      .toBe(true);
    await expectFade(preview, true);
    fixture.latency.topics = 0;

    let sequence = 0;
    const send = async (text: string) => {
      const message = {
        ...topic.lastMessage!,
        id: `29410000-0000-4000-9000-${String(++sequence).padStart(12, '0')}`,
        text,
        createdAt: new Date(Date.now() + sequence * 1000).toISOString()
      };
      topic.lastMessage = message;
      fixture.histories.get(topic.id)!.push(message);
      fixture.io.emit('newMessage', message);
      await expect(preview).toHaveText(text.trim());
    };
    await send('Ок');
    await expectFade(preview, false);
    await send(`Новое 🚀 ${longText}`);
    await expectFade(preview, true);
    fixture.io.emit('typingStatus', {
      topicId: topic.id,
      userId: topic.user.id,
      isTyping: true
    });
    await expect(
      row.locator('.contact-list__description--typing')
    ).toBeVisible();
    fixture.io.emit('typingStatus', {
      topicId: topic.id,
      userId: topic.user.id,
      isTyping: false
    });
    await expect(row.locator('.contact-list__description--typing')).toHaveCount(
      0
    );
    await expectFade(preview, true);
    await row.click();
    await expect(
      page.locator('[data-message-id]:visible').first()
    ).toBeVisible();
    if (isMobile) {
      await page.locator('[data-testid$="-Header-BackButton"]:visible').click();
      await expectFade(preview, true);
    }
    await page.setViewportSize({ ...viewport, width: isMobile ? 320 : 1000 });
    await expectFade(preview, true);
    await page.screenshot({
      path: test.info().outputPath('topic-preview-gradient.png')
    });
    expect(errors).toEqual([]);
  } finally {
    await page.close();
    await fixture.close();
  }
});
