import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

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
  ).toEqual(['plugin:notification|is_permission_granted']);
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
