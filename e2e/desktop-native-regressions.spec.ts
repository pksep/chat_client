import { expect, test } from '@playwright/test';

test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });

test('скрытое окно остаётся неактивным после запоздалого снимка и уведомляет о последнем чате', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname.startsWith('/native-test-api/'))
      return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    (window as any).isTauri = true;
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      value: 'default'
    });
    Object.defineProperty(document, 'hasFocus', { value: () => true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
    history.replaceState(null, '', '/dialogs/last-topic');
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    let state = { focused: true, visible: true, minimized: false };
    let release: ((value: typeof state) => void) | null = null;
    let hold = false;
    const commands: Array<{ command: string; args: any }> = [];
    mockWindows('main');
    mockIPC(
      (command, args) => {
        commands.push({ command, args });
        if (command === 'desktop_window_state') {
          if (hold)
            return new Promise(resolve => {
              release = resolve;
            });
          return state;
        }
        if (command === 'plugin:notification|is_permission_granted')
          return true;
        return null;
      },
      { shouldMockEvents: true }
    );
    const visibility = await import('/src/services/useAppVisibility.ts');
    visibility.ensureTauriWindowStateTracking();
    await new Promise(resolve => setTimeout(resolve, 0));
    await visibility.syncTauriWindowState();
    const initiallyActive = visibility.getIsAppActivelyVisible();
    hold = true;
    const snapshot = visibility.syncTauriWindowState();
    state = { focused: false, visible: false, minimized: false };
    await emit('sep-chat://window-state', state);
    release!({ focused: true, visible: true, minimized: false });
    await snapshot;
    hold = false;
    const hiddenAfterSnapshot = !visibility.getIsAppActivelyVisible();

    const { setConfig } = await import('/src/services/useConfig.ts');
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/native-test-api` });
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    await initializeChat({
      userId: 'me',
      token: 'isolated-test',
      apiUrl: `${location.origin}/native-test-api`,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    (getChatSDK() as any).ws.handleWebSocketEvent({
      type: 'newMessage',
      payload: {
        id: 'hidden-message',
        topicId: 'last-topic',
        text: 'Сообщение в закрытое окно',
        senderUserId: 'other-user',
        senderUser: { id: 'other-user', initials: 'Собеседник' },
        createdAt: new Date().toISOString(),
        isReadByMe: false,
        media: []
      }
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    const notifications = commands.filter(
      ({ command }) => command === 'show_windows_notification'
    );
    const clears = commands.filter(
      ({ command }) => command === 'clear_windows_topic_notifications'
    );
    state = { focused: true, visible: true, minimized: false };
    await emit('sep-chat://window-state', state);
    return {
      initiallyActive,
      hiddenAfterSnapshot,
      notifications,
      clears,
      activeAgain: visibility.getIsAppActivelyVisible()
    };
  });
  expect(result.initiallyActive).toBe(true);
  expect(result.hiddenAfterSnapshot).toBe(true);
  expect(result.notifications).toHaveLength(1);
  expect(JSON.parse(result.notifications[0].args.payload)).toMatchObject({
    topicId: 'last-topic',
    messageId: 'hidden-message'
  });
  expect(result.clears).toEqual([]);
  expect(result.activeAgain).toBe(true);
});

test('входящий звонок на русском и кнопки передают действия с правильной комнатой', async ({
  page
}) => {
  await page.route('**/src/services/useLiveKit.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'export const handleNativeCallAction = async (...args) => window.callActions.push(args);'
    })
  );
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
      JSON.stringify({ token: 'isolated-token', user: { id: 'me' } })
    );
    win.callActions = [];
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    const toasts: any[] = [];
    mockWindows('main');
    mockIPC(
      (command, args) => {
        if (command === 'plugin:notification|is_permission_granted')
          return true;
        if (command === 'show_windows_notification') {
          toasts.push(args);
          return true;
        }
        return null;
      },
      { shouldMockEvents: true }
    );
    const { initPushNotifications } = await import(
      '/src/services/usePushNotifications.ts'
    );
    await initPushNotifications();
    const { showTauriIncomingCallNotification } = await import(
      '/src/services/useTauriNotifications.ts'
    );
    await showTauriIncomingCallNotification({
      caller: { id: 'caller', initials: 'Иван' } as any,
      roomId: 'room-1',
      topicId: 'topic-1',
      topicType: 'DM'
    });
    const payload = JSON.parse(toasts[0].payload);
    await emit(
      'sep-chat://notification-click',
      JSON.stringify({ ...payload, action: 'accept' })
    );
    await emit(
      'sep-chat://notification-click',
      JSON.stringify({ ...payload, action: 'accept' })
    );
    await emit(
      'sep-chat://notification-click',
      JSON.stringify({ ...payload, roomId: 'room-2', action: 'decline' })
    );
    await new Promise(resolve => setTimeout(resolve, 100));
    return { toasts, actions: win.callActions };
  });
  expect(result.toasts[0]).toMatchObject({
    title: 'Входящий звонок',
    body: 'Иван'
  });
  expect(
    result.actions.sort((a: string[], b: string[]) => a[0].localeCompare(b[0]))
  ).toEqual([
    ['accept', 'room-1', 'topic-1'],
    ['decline', 'room-2', 'topic-1']
  ]);
});

test('Tauri подавляет штатное контекстное меню, сохраняя меню чата и браузерное поведение', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    const win = window as any;
    const { suppressDefaultDesktopContextMenu } = await import(
      '/src/utils/desktop-context-menu.ts'
    );
    const disposeBrowser = suppressDefaultDesktopContextMenu();
    const browser = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    });
    document.body.dispatchEvent(browser);
    disposeBrowser();
    win.isTauri = true;
    const dispose = suppressDefaultDesktopContextMenu();
    let customOpened = false;
    document.body.addEventListener('contextmenu', () => {
      customOpened = true;
    });
    const native = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true
    });
    document.body.dispatchEvent(native);
    dispose();
    return {
      browserSuppressed: browser.defaultPrevented,
      nativeSuppressed: native.defaultPrevented,
      customOpened
    };
  });
  expect(result).toEqual({
    browserSuppressed: false,
    nativeSuppressed: true,
    customOpened: true
  });
});
