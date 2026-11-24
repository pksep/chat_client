import { expect, test } from '@playwright/test';

test('новая desktop-ссылка без организации не наследует организацию предыдущего звонка', async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.goto('/e2e/fixtures/call-download.html');
  await page.evaluate(async () => {
    (window as any).isTauri = true;
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    mockWindows('main');
    mockIPC(
      command =>
        command === 'desktop_get_open_urls'
          ? [
              'sepchat://invite?callRoom=first&callInvite=first-token&organization=https%3A%2F%2Fold.example.invalid'
            ]
          : null,
      { shouldMockEvents: true }
    );
    const { initDesktopCallLinks } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    await initDesktopCallLinks();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        new URL(location.href).searchParams.get('organization')
      )
    )
    .toBe('https://old.example.invalid');
  await page.evaluate(async () => {
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    await emit('deep-link://new-url', [
      'sepchat://invite?callRoom=second&callInvite=second-token'
    ]);
  });
  await expect
    .poll(() =>
      page.evaluate(() => new URL(location.href).searchParams.get('callRoom'))
    )
    .toBe('second');
  expect(
    await page.evaluate(() =>
      new URL(location.href).searchParams.get('organization')
    )
  ).toBeNull();
});

test('ссылка из адресной строки вызывает системный протокол до входа и сохраняет веб-fallback', async ({
  page
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => true
    });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (/^(sepchat|intent):/.test(this.href))
        (window as any).selectedAppLink = this.href;
      else click.call(this);
    };
  });
  await page.goto(
    '/?callRoom=shared-room&callInvite=signed%2Btoken&organization=https%3A%2F%2Fexample.invalid'
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).selectedAppLink), {
      timeout: 90_000
    })
    .toBeTruthy();
  await expect(page.getByTestId('DesktopCallInvitePrompt')).toHaveCount(0);
  const android = await page.evaluate(() =>
    /Android/i.test(navigator.userAgent)
  );
  expect(await page.evaluate(() => (window as any).selectedAppLink)).toEqual(
    android
      ? expect.stringMatching(
          /^intent:\/\/chat\.pksep\.ru\/\?callRoom=shared-room.*#Intent;scheme=https;package=sep\.pksep\.app;/
        )
      : 'sepchat://invite?callRoom=shared-room&callInvite=signed%2Btoken&organization=https%3A%2F%2Fexample.invalid'
  );
  expect(
    await page.evaluate(() => localStorage.getItem('chat_auth_session'))
  ).toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('callClient'))
    .toBe('web');
  expect(new URL(page.url()).searchParams.get('callInvite')).toBe(
    'signed+token'
  );
  expect(new URL(page.url()).searchParams.get('callClient')).toBe('web');
  await page.reload();
  await expect(page.getByTestId('DesktopCallInvitePrompt')).toHaveCount(0);
});

test('Tauri ставит launch URL в очередь до входа и открывает повторное событие только один раз', async ({
  page
}) => {
  test.setTimeout(60_000);
  await page.route('**/src/services/useLiveKit.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const openGroupCallInviteUrl = async (url) => { window.openedInvites.push(url); return true; };`
    })
  );
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    const win = window as any;
    win.isTauri = true;
    win.openedInvites = [];
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    const { emit } = await import('/node_modules/@tauri-apps/api/event.js');
    const launch =
      'sepchat://invite?callRoom=cold-room&callInvite=cold-token&organization=https%3A%2F%2Fexample.invalid';
    mockWindows('main');
    mockIPC(
      command => (command === 'desktop_get_open_urls' ? [launch] : null),
      { shouldMockEvents: true }
    );
    const { initDesktopCallLinks } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    await initDesktopCallLinks();
    const { flushPendingGroupCallInviteUrl } = await import(
      '/src/services/useCallKit.ts'
    );
    await emit('deep-link://new-url', [launch]);
    await flushPendingGroupCallInviteUrl();
    const beforeLogin = [...win.openedInvites];
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    ChatSDK.prototype.getGroupCallInvitePreview = async (roomId: string) => ({
      roomId
    });
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    await initializeChat({
      userId: 'me',
      token: 'isolated-test',
      apiUrl: location.origin,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    (getChatSDK() as any).isConnected = () => true;
    await flushPendingGroupCallInviteUrl();
    await emit('deep-link://new-url', [launch]);
    await flushPendingGroupCallInviteUrl();
    const firstOpened = [...win.openedInvites];
    await emit('deep-link://new-url', [
      'sepchat://invite?callRoom=warm-room&callInvite=warm-token'
    ]);
    await flushPendingGroupCallInviteUrl();
    return {
      beforeLogin,
      firstOpened,
      opened: win.openedInvites,
      search: location.search
    };
  });
  expect(result.beforeLogin).toEqual([]);
  expect(result.firstOpened).toEqual([
    'https://chat.pksep.ru/?callRoom=cold-room&callInvite=cold-token&organization=https%3A%2F%2Fexample.invalid'
  ]);
  expect(result.opened).toHaveLength(2);
  expect(result.search).toContain('callRoom=warm-room');
  expect(result.search).not.toContain('organization');
});

test('Tauri открывает конкретную переписку из обычной веб-ссылки', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/call-download.html');
  await page.evaluate(async () => {
    (window as any).isTauri = true;
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    mockWindows('main');
    mockIPC(
      command =>
        command === 'desktop_get_open_urls'
          ? ['sepchat://open?path=%2Fdialogs%2Fperson']
          : null,
      { shouldMockEvents: true }
    );
    const { initDesktopCallLinks } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    await initDesktopCallLinks();
  });
  await expect.poll(() => new URL(page.url()).pathname).toBe('/dialogs/person');
  expect(new URL(page.url()).searchParams.has('token')).toBe(false);
});

test('приглашение Tauri сразу открывает состояние модалки и начинает подключение к нужной комнате', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/call-download.html');
  await page.evaluate(async () => {
    const win = window as any;
    win.isTauri = true;
    const { mockIPC, mockWindows } = await import(
      '/node_modules/@tauri-apps/api/mocks.js'
    );
    mockWindows('main');
    mockIPC(
      command =>
        command === 'desktop_get_open_urls'
          ? ['sepchat://invite?callRoom=direct-room&callInvite=direct-token']
          : null,
      { shouldMockEvents: true }
    );
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    await initializeChat({
      userId: 'synthetic-user',
      token: 'synthetic',
      apiUrl: location.origin,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    const sdk = getChatSDK() as any;
    sdk.isConnected = () => true;
    sdk.getGroupCallInvitePreview = async () => ({
      roomId: 'direct-room',
      topicId: 'direct-topic',
      members: []
    });
    sdk.getLiveKitCallStatus = async () => ({
      active: true,
      roomId: 'direct-room',
      topicId: 'direct-topic',
      groupMode: true
    });
    sdk.sendWebSocketEventWithAck = (_event: unknown, payload: unknown) => {
      win.nativeCallJoin = payload;
      // Запрос удерживается до подтверждения: настоящие звонки и устройства не используются.
      return new Promise(() => {});
    };
    const { authedUser } = await import('/src/composables/useAuth.ts');
    authedUser.value = { id: 'synthetic-user', name: 'Проверка' } as any;
    win.nativeCallState = await import('/src/services/useCallState.ts');
    const { initDesktopCallLinks } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    void initDesktopCallLinks();
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).nativeCallState.isModalVisible.value)
    )
    .toBe(true);
  expect(
    await page.evaluate(() => (window as any).nativeCallState.roomId.value)
  ).toBe('direct-room');
  expect(
    await page.evaluate(() => (window as any).nativeCallJoin)
  ).toMatchObject({ roomId: 'direct-room', inviteToken: 'direct-token' });
});

test('iOS принимает sepchat-приглашение без браузерного диалога и ждёт авторизации', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as any).CapacitorCustomPlatform = { name: 'ios' };
    (window as any).openedInvites = [];
  });
  await page.route('**/src/services/useLiveKit.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'export const openGroupCallInviteUrl = async url => { window.openedInvites.push(url); return true; };'
    })
  );
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    const { handleAppUrlOpen, flushPendingGroupCallInviteUrl } = await import(
      '/src/services/useCallKit.ts'
    );
    await handleAppUrlOpen({
      url: 'sepchat://invite?callRoom=ios-room&callInvite=signed%2Btoken'
    });
    const beforeLogin = [...(window as any).openedInvites];
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    ChatSDK.prototype.getGroupCallInvitePreview = async roomId =>
      ({ roomId }) as any;
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    await initializeChat({
      userId: 'me',
      token: 'synthetic',
      apiUrl: location.origin,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    (getChatSDK() as any).isConnected = () => true;
    await flushPendingGroupCallInviteUrl();
    const { pendingDesktopCallInvite } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    return {
      beforeLogin,
      opened: (window as any).openedInvites,
      prompt: pendingDesktopCallInvite.value
    };
  });
  expect(result.beforeLogin).toEqual([]);
  expect(result.opened).toEqual([
    'https://chat.pksep.ru/?callRoom=ios-room&callInvite=signed%2Btoken'
  ]);
  expect(result.prompt).toBeNull();
});
