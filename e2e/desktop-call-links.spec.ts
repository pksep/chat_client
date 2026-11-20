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

test('ссылка из адресной строки предлагает приложение до входа и сохраняет браузерный вход', async ({
  page,
  isMobile
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(
    '/?callRoom=shared-room&callInvite=signed%2Btoken&organization=https%3A%2F%2Fexample.invalid'
  );
  if (isMobile) {
    await expect(page.getByTestId('DesktopCallInvitePrompt')).toBeHidden();
    return;
  }
  const prompt = page.getByTestId('DesktopCallInvitePrompt');
  await expect(prompt).toBeVisible({ timeout: 90_000 });
  await prompt.screenshot({
    path: testInfo.outputPath('desktop-call-invite.png')
  });
  await expect(
    prompt.getByRole('link', { name: 'Открыть СЭП Чат', exact: true })
  ).toHaveAttribute(
    'href',
    'sepchat://invite?callRoom=shared-room&callInvite=signed%2Btoken&organization=https%3A%2F%2Fexample.invalid'
  );
  expect(
    await page.evaluate(() => localStorage.getItem('chat_auth_session'))
  ).toBeNull();
  await prompt.getByRole('button', { name: 'Продолжить в браузере' }).click();
  await expect(prompt).toBeHidden();
  expect(new URL(page.url()).searchParams.get('callInvite')).toBe(
    'signed+token'
  );
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
    const launch = 'sepchat://invite?callRoom=cold-room&callInvite=cold-token';
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
    return { beforeLogin, opened: win.openedInvites, search: location.search };
  });
  expect(result.beforeLogin).toEqual([]);
  expect(result.opened).toEqual([
    'https://chat.pksep.ru/?callRoom=cold-room&callInvite=cold-token'
  ]);
  expect(result.search).toContain('callRoom=cold-room');
});
