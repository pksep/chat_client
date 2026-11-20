import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

test('при ошибке быстрого ответа текст сохраняется в редакторе и не отмечается прочитанным', async ({
  page
}) => {
  const paths: string[] = [];
  await page.route('**/notification-actions-error/**', route => {
    paths.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 503, json: { message: 'Нет сети' } });
  });
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    (window as any).isTauri = true;
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-notification-test',
        user: { id: 'notification-owner' }
      })
    );
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    mockWindows('main');
    const commands: string[] = [];
    mockIPC(command => {
      commands.push(command);
      return true;
    });
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({
      CHAT_API_DOMAIN: location.origin + '/notification-actions-error'
    });
    const { handleDesktopNotificationAction } = await import(
      '/src/services/desktop-notification-actions.ts'
    );
    await handleDesktopNotificationAction({
      type: 'new_message',
      action: 'reply',
      accountId: 'notification-owner',
      topicType: 'GROUP',
      topicId: 'c8490ca4-47e9-4b24-a5ba-c2b0b4023bd7',
      messageId: 'bcd4d922-b955-4f6f-9fbc-16a3ff317672',
      replyClientId: '5e356d09-18bb-4e64-b0ac-a7587ada8537',
      replyText: '<b>Текст</b> & ответ\nвторая строка'
    });
    const { usePendingMessageDraft } = await import(
      '/src/composables/useMessageDraftTransfer.ts'
    );
    const draft = usePendingMessageDraft();
    return {
      topicId: draft.pendingDraftTopicId.value,
      text: draft.pendingDraftText.value,
      commands
    };
  });
  expect(result.topicId).toBe('c8490ca4-47e9-4b24-a5ba-c2b0b4023bd7');
  expect(result.text).toBe(
    '&lt;b&gt;Текст&lt;/b&gt; &amp; ответ<br>вторая строка'
  );
  expect(paths).toHaveLength(1);
  expect(paths[0]).toMatch(/\/reply$/);
  expect(
    result.commands.filter(command => command.startsWith('clear_windows'))
  ).toHaveLength(0);
});

test('уведомления показывают типы и имена вложений по-русски и привязку быстрых действий к аккаунту', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    const win = window as any;
    win.isTauri = true;
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      value: 'default'
    });
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-notification-test',
        user: { id: 'notification-owner' }
      })
    );
    const { mockIPC } = await import('/node_modules/@tauri-apps/api/mocks.js');
    const notifications: any[] = [];
    mockIPC((command, args) => {
      if (command === 'plugin:notification|is_permission_granted') return true;
      if (command === 'show_windows_notification') notifications.push(args);
      return true;
    });
    const { showTauriMessageNotification } = await import(
      '/src/services/useTauriNotifications.ts'
    );
    for (const [index, media] of [
      [{ type: 'IMAGE', originName: 'photo.jpg' }],
      [{ type: 'VIDEO', originName: 'video.mp4' }],
      [{ type: 'FILE', originName: 'Счёт.pdf' }],
      [
        { type: 'IMAGE' },
        { type: 'IMAGE' },
        { type: 'FILE', originName: 'архив.zip' }
      ]
    ].entries())
      await showTauriMessageNotification({
        message: {
          id: `message-${index}`,
          topicId: 'group',
          text: '',
          media
        } as any,
        sender: { initials: 'Иван' } as any,
        topic: { id: 'group', type: 'GROUP', name: 'Отдел' } as any
      });
    return notifications.map(({ body, title, payload }) => ({
      body,
      title,
      payload: JSON.parse(payload)
    }));
  });
  expect(result.map(item => item.body)).toEqual([
    'Фото',
    'Видео',
    'Документ: Счёт.pdf',
    '2 фото, 1 файл'
  ]);
  for (const item of result) {
    expect(item.title).toBe('Иван в Отдел');
    expect(item.payload.accountId).toBe('notification-owner');
    expect(item.payload.replyClientId).toMatch(/^[a-f0-9-]{14}4[a-f0-9-]{21}$/);
  }
});

test('кнопки Windows вызывают те же подтверждаемые действия, что Android, без дублей callback', async ({
  page
}) => {
  const requests: Array<{ path: string; body: any }> = [];
  await page.route('**/notification-actions-test/**', route => {
    const path = new URL(route.request().url()).pathname;
    requests.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({
      json: path.endsWith('/reply')
        ? { id: 'sent-reply' }
        : { success: true, messageIds: [] }
    });
  });
  await page.goto('/e2e/fixtures/call-download.html');
  await page.evaluate(async () => {
    const win = window as any;
    win.isTauri = true;
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-notification-test',
        user: { id: 'notification-owner' }
      })
    );
    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({
      CHAT_API_DOMAIN: location.origin + '/notification-actions-test'
    });
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    mockWindows('main');
    mockIPC(
      command =>
        command === 'consume_pending_notification_target' ? null : true,
      { shouldMockEvents: true }
    );
    const { initPushNotifications } = await import(
      '/src/services/usePushNotifications.ts'
    );
    await initPushNotifications();
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    const payload = {
      type: 'new_message',
      accountId: 'notification-owner',
      topicId: 'c8490ca4-47e9-4b24-a5ba-c2b0b4023bd7',
      messageId: 'bcd4d922-b955-4f6f-9fbc-16a3ff317672',
      replyClientId: '5e356d09-18bb-4e64-b0ac-a7587ada8537'
    };
    win.testNotificationAction = async (action: string) => {
      await emit(
        'sep-chat://notification-click',
        JSON.stringify({ ...payload, action, replyText: '  <Тест> & ответ  ' })
      );
    };
    await win.testNotificationAction('like');
  });
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate(() => (window as any).testNotificationAction('read'));
  await expect.poll(() => requests.length).toBe(2);
  await page.evaluate(() => (window as any).testNotificationAction('reply'));
  await expect.poll(() => requests.length).toBe(4);
  await page.evaluate(() => (window as any).testNotificationAction('reply'));
  await page.waitForTimeout(150);
  expect(requests.map(item => item.path.split('/').at(-1))).toEqual([
    'reaction',
    'read',
    'reply',
    'read'
  ]);
  expect(requests[0].body.emoji).toBe('❤️');
  expect(requests[2].body).toEqual({
    text: '<Тест> & ответ',
    clientId: '5e356d09-18bb-4e64-b0ac-a7587ada8537',
    replyMessageId: 'bcd4d922-b955-4f6f-9fbc-16a3ff317672'
  });
});

test('Tauri запускает уведомления, пока запрос геолокации остаётся без ответа', async ({
  page
}) => {
  test.setTimeout(60_000);
  const fixture = await createAndroidPerformanceServer({
    port: 5206,
    topicCount: 2,
    userCount: 4,
    messagesPerTopic: 2
  });
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
          JSON.stringify({
            token: 'chat-294-local-fixture',
            user
          })
        );
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        const win = window as any;
        win.isTauri = true;
        win.tauriStartup = {
          locationRequested: false,
          notificationsReady: false
        };
        win.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { label: 'main' }
          },
          transformCallback: () => 1,
          invoke: async (command: string) => {
            if (command === 'consume_pending_notification_target') {
              win.tauriStartup.notificationsReady = true;
              return null;
            }
            if (command === 'plugin:tray|get_by_id') return null;
            if (command === 'plugin:window|is_minimized') return false;
            if (command === 'plugin:window|theme') return 'light';
            if (command === 'plugin:window|scale_factor') return 1;
            return true;
          }
        };
        Object.defineProperty(navigator.permissions, 'query', {
          value: async () => ({ state: 'prompt', onchange: null })
        });
        Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
          value: () => {
            win.tauriStartup.locationRequested = true;
          }
        });
      },
      { origin: fixture.origin, config: fixture.config, user: fixture.user }
    );
    await page.goto('/');
    await expect
      .poll(() => page.evaluate(() => (window as any).tauriStartup), {
        timeout: 45_000
      })
      .toEqual({ locationRequested: true, notificationsReady: true });
  } finally {
    await fixture.close();
  }
});

test('Windows: запуск, переход и очистка уведомлений без мобильного API', async ({
  page
}) => {
  await page.route('**/*', route => {
    const { hostname } = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    (window as any).isTauri = true;
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      value: 'default'
    });
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    const commands: Array<{ command: string; args: any }> = [];
    mockWindows('main');
    mockIPC(
      (command, args) => {
        commands.push({ command, args });
        if (command === 'plugin:notification|is_permission_granted')
          return true;
        if (command === 'consume_pending_notification_target') {
          return JSON.stringify({
            topicId: 'pending-topic',
            type: 'new_message'
          });
        }
        if (command === 'plugin:window|is_minimized') return true;
        if (command.startsWith('plugin:notification|')) {
          throw new Error(`Мобильный API недоступен на desktop: ${command}`);
        }
        return true;
      },
      { shouldMockEvents: true }
    );
    const notifications = await import(
      '/src/services/useTauriNotifications.ts'
    );
    const actions: unknown[] = [];
    await notifications.initTauriNotifications(payload =>
      actions.push(payload)
    );
    await notifications.initTauriNotifications(payload =>
      actions.push(payload)
    );
    await emit(
      'sep-chat://notification-click',
      JSON.stringify({
        topicId: 'clicked-topic',
        type: 'incoming_call'
      })
    );
    await notifications.activateTauriAppWindow();
    await notifications.clearTauriMessageNotification('topic-1', 'message-1');
    await notifications.clearTauriTopicNotifications('topic-1');
    await notifications.clearAllTauriNotifications();
    return { actions, commands };
  });

  expect(result.actions).toEqual([
    { topicId: 'pending-topic', type: 'new_message' },
    { topicId: 'clicked-topic', type: 'incoming_call' }
  ]);
  expect(
    result.commands
      .filter(({ command }) => command.startsWith('plugin:notification|'))
      .map(({ command }) => command)
  ).toEqual(
    expect.arrayContaining(['plugin:notification|is_permission_granted'])
  );
  expect(
    result.commands.filter(
      ({ command }) =>
        command.startsWith('plugin:notification|') &&
        command !== 'plugin:notification|is_permission_granted'
    )
  ).toHaveLength(0);
  expect(
    result.commands
      .filter(({ command }) => command.startsWith('plugin:window|'))
      .map(({ command }) => command)
  ).toEqual([
    'plugin:window|is_minimized',
    'plugin:window|unminimize',
    'plugin:window|show',
    'plugin:window|set_focus'
  ]);
  expect(
    result.commands.filter(({ command }) => command.startsWith('clear_'))
  ).toEqual([
    {
      command: 'clear_windows_topic_notifications',
      args: {
        topicId: 'topic-1',
        messagesOnly: true
      }
    },
    {
      command: 'clear_windows_topic_notifications',
      args: { topicId: 'topic-1' }
    },
    { command: 'clear_all_windows_notifications', args: {} }
  ]);
});
