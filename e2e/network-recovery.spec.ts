import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60000);
test.use({
  launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] }
});

async function localChat(
  page: Page,
  options: { deny?: boolean; stallSync?: boolean } = {}
) {
  const http = createServer();
  const server = new Server(http, { cors: { origin: '*' } });
  const state = {
    deny: !!options.deny,
    reply: true,
    capability: true,
    attempts: 0,
    healthChecks: 0,
    httpChecks: 0,
    folderChecks: 0,
    sentMessages: [] as Array<{ topicId: string; text: string; ex: string }>
  };
  const namespace = server.of('/chat');
  namespace.use((_socket, next) => {
    state.attempts++;
    if (!state.deny) return next();
    const error = Object.assign(
      new Error('Сервис авторизации временно недоступен'),
      {
        data: { status: 503, code: 'AUTH_UNAVAILABLE' }
      }
    );
    next(error);
  });
  namespace.on('connection', socket => {
    if (state.capability) socket.emit('connectionReady');
    socket.on('checkConnection', ack => {
      state.healthChecks++;
      if (state.reply) ack({ success: true });
    });
    socket.on('getChatFolders', (_payload, ack) => {
      state.folderChecks++;
      ack([]);
    });
    socket.on('sendMessage', raw => {
      const message = JSON.parse(raw);
      state.sentMessages.push(message);
      socket.emit('changeMessage', {
        type: 'NEW',
        topicId: message.topicId,
        data: {
          ...message,
          id: `confirmed-${state.sentMessages.length}`,
          senderUserId: 'network-user',
          createdAt: new Date().toISOString(),
          status: 'DELIVERED',
          media: [],
          reactions: [],
          messageRead: []
        }
      });
    });
    socket.on('authenticate', (_payload, ack) => ack({ success: true }));
  });
  await new Promise<void>(resolve =>
    http.listen(0, '127.0.0.1', () => resolve())
  );
  const address = http.address() as { port: number };
  const wsUrl = `http://127.0.0.1:${address.port}/chat`;
  let releaseSync!: () => void;
  const syncGate = new Promise<void>(resolve => {
    releaseSync = resolve;
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname === '/__network-recovery') {
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      });
    }
    if (url.pathname === '/live-health') {
      state.httpChecks++;
      return route.fulfill({ json: { status: 'ok' } });
    }
    if (url.pathname.endsWith('/sync/token') && options.stallSync)
      await syncGate;
    if (
      ['/performance-api/users', '/performance-api/topics'].includes(
        url.pathname
      )
    ) {
      return route.fulfill({
        json: { data: [], meta: { totalPages: 1, currentPage: 1 } }
      });
    }
    if (url.pathname.startsWith('/performance-api/')) {
      return route.fulfill({ json: [] }).catch(() => {});
    }
    return route.fallback();
  });
  await page.goto('/__network-recovery');
  return {
    state,
    namespace,
    async initialize() {
      await page.evaluate(async wsUrl => {
        const configPath = '/src/services/useConfig.ts';
        const authPath = '/src/composables/useAuth.ts';
        const chatPath = '/src/services/useChat.ts';
        const config = await import(/* @vite-ignore */ configPath);
        const auth = await import(/* @vite-ignore */ authPath);
        const chat = await import(/* @vite-ignore */ chatPath);
        auth.authedUser.value = {
          id: 'network-user',
          initials: 'Проверка сети'
        };
        config.setConfig({
          CHAT_API_DOMAIN: `${location.origin}/performance-api`
        });
        const options = {
          token: 'local-test-token',
          userId: 'network-user',
          apiUrl: `${location.origin}/performance-api`,
          wsUrl
        };
        await chat.initializeChat(options);
        (window as any).networkRecovery = {
          sdk: chat.getChatSDK(),
          chat,
          options
        };
      }, wsUrl);
    },
    async close() {
      releaseSync();
      await page
        .evaluate(() => (window as any).networkRecovery?.sdk.disconnect())
        .catch(() => {});
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  };
}

const connected = (page: Page) =>
  page.evaluate(() => (window as any).networkRecovery.sdk.isConnected());

test('после временного 503 чат подключается сам при работающем HTTP', async ({
  page
}) => {
  const fixture = await localChat(page, { deny: true });
  try {
    await fixture.initialize();
    await expect.poll(() => fixture.state.attempts).toBeGreaterThan(0);
    await expect.poll(connected.bind(null, page)).toBe(false);
    fixture.state.deny = false;
    await expect.poll(connected.bind(null, page), { timeout: 8000 }).toBe(true);
    expect(fixture.state.attempts).toBe(2);
    await page.evaluate(() => (window as any).networkRecovery.sdk.connect());
  } finally {
    await fixture.close();
  }
});

test('Manager восстанавливает транспорт, но готовность чата ждёт авторизации', async ({
  page
}) => {
  const fixture = await localChat(page);
  let releaseAuth: (() => void) | undefined;
  fixture.namespace.use((_socket, next) => {
    if (fixture.state.attempts > 1) releaseAuth = next;
    else next();
  });
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    [...fixture.namespace.sockets.values()][0].conn.close();
    await expect.poll(() => !!releaseAuth, { timeout: 8000 }).toBe(true);
    const beforeAuth = await page.evaluate(() => {
      const { sdk, chat } = (window as any).networkRecovery;
      (window as any).reconnectCompleted = false;
      void sdk.connect().then(() => {
        (window as any).reconnectCompleted = true;
      });
      return {
        connected: sdk.isConnected(),
        ready: chat.getHasWebsocketConnection(),
        events: JSON.parse(
          localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
        )
      };
    });
    expect(beforeAuth.connected).toBe(false);
    expect(beforeAuth.ready).toBe(false);
    expect(beforeAuth.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'network.websocket.reconnect_attempt'
        }),
        expect.objectContaining({
          name: 'network.websocket.transport_reconnected',
          payload: expect.objectContaining({ namespaceReady: false })
        })
      ])
    );
    expect(await page.evaluate(() => (window as any).reconnectCompleted)).toBe(
      false
    );
    releaseAuth!();
    await expect
      .poll(() => page.evaluate(() => (window as any).reconnectCompleted))
      .toBe(true);
    expect(fixture.state.attempts).toBe(2);
    expect(fixture.namespace.sockets.size).toBe(1);
  } finally {
    releaseAuth?.();
    await fixture.close();
  }
});

test('звонок, начавшийся во время проверки, защищён от сброса сокета', async ({
  page
}) => {
  const fixture = await localChat(page);
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    fixture.state.reply = false;
    await expect
      .poll(() => fixture.state.healthChecks, { timeout: 25000 })
      .toBe(2);
    await page.evaluate(async () => {
      const path = '/src/services/useCallState.ts';
      const call = await import(/* @vite-ignore */ path);
      call.open.value = true;
    });
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            JSON.parse(
              localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
            ).some(
              (event: any) =>
                event.name === 'network.websocket.health_failed' &&
                event.payload.failures === 2
            )
          ),
        { timeout: 8000 }
      )
      .toBe(true);
    expect(fixture.state.attempts).toBe(1);
    fixture.state.reply = true;
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as any).networkRecovery.chat.getHasWebsocketConnection()
          ),
        { timeout: 15000 }
      )
      .toBe(true);
    expect(fixture.state.attempts).toBe(1);
    expect(
      await page.evaluate(async () => {
        const path = '/src/services/useCallState.ts';
        return (await import(/* @vite-ignore */ path)).open.value;
      })
    ).toBe(true);
  } finally {
    await fixture.close();
  }
});

for (const endCall of [false, true]) {
  test(`готовность и очередь восстанавливаются по ACK ${endCall ? 'после выхода из звонка' : 'во время звонка'} без перезагрузки`, async ({
    page
  }) => {
    const fixture = await localChat(page);
    const replies: Array<() => void> = [];
    fixture.state.reply = false;
    fixture.namespace.on('connection', socket => {
      socket.on('checkConnection', ack => {
        replies.push(() => ack({ success: true }));
      });
    });
    try {
      await fixture.initialize();
      await expect.poll(connected.bind(null, page)).toBe(true);
      await page.evaluate(async () => {
        const call = await import('/src/services/useCallState.ts');
        const topics = await import('/src/composables/useTopics.ts');
        const messages = await import('/src/services/useMessages.ts');
        const { mountConnectionProfile } = await import(
          '/e2e/fixtures/network-harness.ts'
        );
        const { mountMessageSender } = await import(
          '/e2e/fixtures/message-send-harness.ts'
        );
        const auth = await import('/src/composables/useAuth.ts');
        auth.authedUser.value = {
          id: 'network-user',
          initials: 'Проверка сети'
        };
        const fixture = (window as any).networkRecovery;
        call.open.value = true;
        topics.setTopics([
          { id: 'network-topic', type: 'DM', name: 'Проверка очереди' }
        ]);
        // HTTP/resume может сбросить готовность UI без разрыва сокета.
        fixture.sdk.emitConnectionState(false);
        mountConnectionProfile();
        fixture.messages = messages;
        fixture.sender = mountMessageSender('network-topic');
        fixture.sender.setAuthUser(auth.authedUser.value);
        await fixture.sender.handleSend({
          content: 'Проверка очереди после звонка'
        });
      });
      expect(await connected(page)).toBe(true);
      expect(fixture.state.sentMessages).toHaveLength(0);
      expect(
        await page.evaluate(
          () =>
            (window as any).networkRecovery.messages.getFullMessagesByTopicId(
              'network-topic'
            ).length
        )
      ).toBe(1);
      await expect
        .poll(() => replies.length, { timeout: 12000 })
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(() =>
          (window as any).networkRecovery.chat.getHasWebsocketConnection()
        )
      ).toBe(false);
      if (endCall) {
        await page.evaluate(async () => {
          const call = await import('/src/services/useCallState.ts');
          call.open.value = false;
        });
      }
      fixture.state.reply = true;
      replies.splice(0).forEach(reply => reply());
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              (window as any).networkRecovery.chat.getHasWebsocketConnection()
            ),
          { timeout: 1500 }
        )
        .toBe(true);
      await expect(page.locator('.connection-status')).toHaveCount(0);
      await expect.poll(() => fixture.state.sentMessages.length).toBe(1);
      await expect
        .poll(() =>
          page.evaluate(() =>
            (window as any).networkRecovery.messages
              .getFullMessagesByTopicId('network-topic')
              .map((message: any) => message.status)
          )
        )
        .toEqual(['DELIVERED']);
      expect(fixture.state.attempts).toBe(1);
      const folderChecks = fixture.state.folderChecks;
      const healthChecks = fixture.state.healthChecks;
      await page.clock.install();
      await page.clock.runFor(12000);
      await expect
        .poll(() => fixture.state.healthChecks)
        .toBeGreaterThan(healthChecks);
      expect(fixture.state.folderChecks).toBe(folderChecks);
      expect(fixture.state.sentMessages).toHaveLength(1);
      expect(fixture.state.attempts).toBe(1);
      expect(
        await page.evaluate(async () => {
          const call = await import('/src/services/useCallState.ts');
          return call.open.value;
        })
      ).toBe(!endCall);
    } finally {
      await page.evaluate(() =>
        (window as any).networkRecovery?.sender?.stop()
      );
      await fixture.close();
    }
  });
}

test('готовность сокета журналирует источник сброса и восстановления без дублирования ACK', async ({
  page
}) => {
  const fixture = await localChat(page);
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    await page.evaluate(async () => {
      const fixture = (window as any).networkRecovery;
      fixture.sdk.emitConnectionState(false);
      await fixture.sdk.checkConnectionHealth();
      fixture.sdk.emitConnectionState(true);
    });
    const events = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
      ).filter(
        (event: any) => event.name === 'network.websocket.readiness_changed'
      )
    );
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: 'sdk-connection-state',
          previousReady: true,
          ready: false,
          socketConnected: true,
          sendAvailable: false
        })
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          reason: 'sdk-connection-state',
          previousReady: false,
          ready: true,
          socketConnected: true,
          sendAvailable: true
        })
      })
    ]);
    expect(
      events.filter((event: any) => event.payload.ready === true)
    ).toHaveLength(2);
  } finally {
    await fixture.close();
  }
});

test('таймаут отправки диагностики сохраняет очередь и разрешает следующую отправку', async ({
  page
}) => {
  const fixture = await localChat(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const batches: Array<{ events: Array<{ name: string }> }> = [];
  await page.route('**/telemetry/events', async route => {
    batches.push(route.request().postDataJSON());
    if (batches.length === 1) await gate;
    await route.fulfill({ status: 204 }).catch(() => {});
  });
  try {
    await page.clock.install();
    await page.evaluate(async () => {
      document.cookie = 'authToken=local-telemetry-token;path=/';
      const configPath = '/src/services/useConfig.ts';
      const telemetryPath = '/src/services/useTelemetry.ts';
      (await import(/* @vite-ignore */ configPath)).setConfig({
        CHAT_API_DOMAIN: `${location.origin}/performance-api`
      });
      const telemetry = await import(/* @vite-ignore */ telemetryPath);
      (window as any).telemetryForRecovery = telemetry;
      telemetry.recordTelemetryEvent({
        category: 'network',
        name: 'network.test.pending'
      });
      (window as any).flushCompleted = false;
      void telemetry.flushTelemetryEvents().then(() => {
        (window as any).flushCompleted = true;
      });
    });
    await expect.poll(() => batches.length).toBe(1);
    await page.clock.runFor(10100);
    await expect
      .poll(() => page.evaluate(() => (window as any).flushCompleted))
      .toBe(true);
    expect(
      await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
        ).some((event: any) => event.name === 'network.test.pending')
      )
    ).toBe(true);
    await page.evaluate(() =>
      (window as any).telemetryForRecovery.flushTelemetryEvents()
    );
    expect(batches.length).toBe(2);
    expect(
      batches[1].events.some(event => event.name === 'network.test.pending')
    ).toBe(true);
    expect(
      await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
        ).some((event: any) => event.name === 'network.test.pending')
      )
    ).toBe(false);
  } finally {
    release();
    await fixture.close();
  }
});

test('выход отменяет повтор после 503', async ({ page }) => {
  const fixture = await localChat(page, { deny: true });
  try {
    await fixture.initialize();
    await expect.poll(() => fixture.state.attempts).toBe(1);
    await page.evaluate(() => (window as any).networkRecovery.sdk.disconnect());
    fixture.state.deny = false;
    await page.waitForTimeout(1800);
    expect(fixture.state.attempts).toBe(1);
  } finally {
    await fixture.close();
  }
});

test('зависший фоновый запрос не блокирует запуск канала сообщений', async ({
  page
}) => {
  const fixture = await localChat(page, { stallSync: true });
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page), { timeout: 2500 }).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('повторная инициализация и connect не оставляют параллельных сокетов', async ({
  page
}) => {
  const fixture = await localChat(page);
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    await page.evaluate(async () => {
      const { sdk, chat, options } = (window as any).networkRecovery;
      await Promise.all(Array.from({ length: 20 }, () => sdk.connect()));
      await chat.initializeChat(options);
      (window as any).networkRecovery.sdk = chat.getChatSDK();
    });
    await expect.poll(connected.bind(null, page)).toBe(true);
    await expect.poll(() => fixture.namespace.sockets.size).toBe(1);
    expect(fixture.state.attempts).toBe(2);
  } finally {
    await fixture.close();
  }
});

test('зависший сокет восстанавливается при доступном HTTP без действий пользователя', async ({
  page
}) => {
  const fixture = await localChat(page);
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    fixture.state.reply = false;
    await expect
      .poll(() => fixture.state.healthChecks, { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect.poll(() => fixture.state.attempts, { timeout: 25000 }).toBe(2);
    expect(fixture.state.httpChecks).toBeGreaterThan(1);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    fixture.state.reply = true;
    await expect.poll(connected.bind(null, page)).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('старый сервер без новой проверки не вызывает цикл переподключений', async ({
  page
}) => {
  const fixture = await localChat(page);
  fixture.state.capability = false;
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    await page.clock.install();
    await page.clock.runFor(30000);
    expect(fixture.state.healthChecks).toBe(0);
    expect(fixture.state.attempts).toBe(1);
    expect(await connected(page)).toBe(true);
  } finally {
    await fixture.close();
  }
});

test('отмена HTTP-проверки при скрытии не записывается как потеря сети', async ({
  page
}) => {
  const fixture = await localChat(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let started = 0;
  await page.route('**/live-health*', async route => {
    started++;
    await gate;
    await route.fulfill({ json: { status: 'ok' } }).catch(() => {});
  });
  try {
    await fixture.initialize();
    await expect.poll(connected.bind(null, page)).toBe(true);
    await expect.poll(() => started, { timeout: 8000 }).toBeGreaterThan(0);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden'
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(200);
    const failures = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
      ).filter((event: any) => event.name === 'network.chat_health.unreachable')
    );
    expect(failures).toEqual([]);
  } finally {
    release();
    await fixture.close();
  }
});
