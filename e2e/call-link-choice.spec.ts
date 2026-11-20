import { expect, test, type Page } from '@playwright/test';

const invite = 'callRoom=choice-room&callInvite=signed%2Btoken%2F%3D';
const fixture = '/e2e/fixtures/call-link-choice.html';

async function isolatedChoice(page: Page, query = invite) {
  // Только локальные синтетические ссылки; SDK и звонки не подключаются.
  await page.route('**/src/services/useChat.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'export const getChatSDK = () => window.choiceSDK;'
    })
  );
  await page.route('**/src/services/useCalls.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'export const restoreInvitedGroupCallFromUrl = async () => { window.restoredInvites = [...(window.restoredInvites || []), location.search]; };'
    })
  );
  await page.goto(`${fixture}?${query}`);
  await expect(page.getByTestId('DesktopCallInvitePrompt')).toBeVisible();
}

for (const theme of ['light', 'dark']) {
  test(`выбор ${theme}: узкий экран, фокус и отсутствие автоматического запуска`, async ({
    page
  }, info) => {
    await page.setViewportSize({ width: 280, height: 568 });
    const protocols: string[] = [];
    page.on('request', request => {
      if (/^(sepchat|intent):/.test(request.url()))
        protocols.push(request.url());
    });
    await isolatedChoice(page);
    await page.evaluate(theme => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.className = `theme-${theme}`;
    }, theme);
    const prompt = page.getByTestId('DesktopCallInvitePrompt');
    await expect(prompt).toBeFocused();
    const bounds = await prompt.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(280);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
    const download = prompt.getByRole('link', { name: 'Скачать приложение' });
    const android = await page.evaluate(() =>
      /Android/i.test(navigator.userAgent)
    );
    await expect(download).toHaveAttribute(
      'href',
      android
        ? 'https://pksep.github.io/sep-chat-ui/android/'
        : 'https://github.com/pksep/chat_client/releases/latest'
    );
    await page.keyboard.press('Shift+Tab');
    await expect(download).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      prompt.getByRole('link', { name: 'Продолжить в приложении' })
    ).toBeFocused();
    expect(protocols).toEqual([]);
    await prompt.screenshot({
      path: info.outputPath(`call-choice-${theme}.png`)
    });
  });
}

test('выбор браузера восстанавливает звонок только после нажатия и сохраняется после входа', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as any).choiceSDK = { isConnected: () => true };
  });
  await isolatedChoice(page, `${invite}&organization=old&callAppFallback=1`);
  expect(
    await page.evaluate(() => (window as any).restoredInvites)
  ).toBeUndefined();
  await page.getByRole('button', { name: 'Остаться в браузере' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).restoredInvites?.length))
    .toBe(1);
  const url = new URL(page.url());
  expect(url.searchParams.get('callClient')).toBe('web');
  expect(url.searchParams.has('callAppFallback')).toBe(false);
  const authorization = await page.evaluate(async () => {
    const { buildGroupCallInviteAuthorizationUrl } = await import(
      '/src/utils/groupCallInviteUrl.ts'
    );
    return buildGroupCallInviteAuthorizationUrl(location.href);
  });
  expect(new URL(authorization).search).toBe(url.search);
  await page.reload();
  await expect(page.getByTestId('DesktopCallInvitePrompt')).toBeHidden();
});

test('новое приглашение и переход назад показывают новый выбор, старая организация удаляется', async ({
  page
}) => {
  await isolatedChoice(page, `${invite}&organization=old`);
  await page.getByRole('button', { name: 'Остаться в браузере' }).click();
  await page.evaluate(() => {
    history.pushState({}, '', '?callRoom=next-room&callInvite=next-token');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const prompt = page.getByTestId('DesktopCallInvitePrompt');
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole('link', { name: 'Продолжить в приложении' })
  ).toHaveAttribute('href', /callRoom=next-room/);
  await page.getByRole('button', { name: 'Остаться в браузере' }).click();
  expect(new URL(page.url()).searchParams.has('organization')).toBe(false);
  await page.goBack();
  await expect(prompt).toBeHidden();
  await page.evaluate(() => {
    history.pushState({}, '', '?callRoom=third-room&callInvite=third-token');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(prompt).toBeVisible();
});

test('нажатие ссылки внутри чата показывает выбор без запроса предпросмотра', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/call-download.html');
  const result = await page.evaluate(async () => {
    const { openGroupCallInviteUrl } = await import(
      '/src/services/useLiveKit.ts'
    );
    const { pendingDesktopCallInvite } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    const { invitedGroupCall } = await import('/src/services/useCallState.ts');
    const accepted = await openGroupCallInviteUrl(
      'https://chat.pksep.ru/?callRoom=in-chat&callInvite=synthetic',
      { allowTrustedOrigin: true }
    );
    return {
      accepted,
      target: pendingDesktopCallInvite.value,
      joined: invitedGroupCall.value
    };
  });
  expect(result.accepted).toBe(true);
  expect(result.target).toContain('callRoom=in-chat');
  expect(result.joined).toBeNull();
});

test('запоздалый ответ старого приглашения не открывает звонок и не стирает новую ссылку', async ({
  page
}) => {
  await page.goto(
    '/e2e/fixtures/call-download.html?callRoom=old&callInvite=old-token&callClient=web'
  );
  const result = await page.evaluate(async () => {
    const { ChatSDK } = await import('/src/services/useChatSDK/index.ts');
    ChatSDK.prototype.connect = () => new Promise<void>(() => {});
    const { initializeChat, getChatSDK } = await import(
      '/src/services/useChat.ts'
    );
    await initializeChat({
      userId: 'me',
      token: 'synthetic',
      apiUrl: location.origin,
      wsUrl: 'ws://127.0.0.1:65530'
    });
    let finish: (preview: null) => void;
    (getChatSDK() as any).getGroupCallInvitePreview = () =>
      new Promise(resolve => {
        finish = resolve;
      });
    const { hydrateInvitedGroupCallFromUrl } = await import(
      '/src/services/useLiveKit.ts'
    );
    const pending = hydrateInvitedGroupCallFromUrl();
    history.replaceState({}, '', '?callRoom=new&callInvite=new-token');
    window.dispatchEvent(new PopStateEvent('popstate'));
    finish!(null);
    const accepted = await pending;
    const { pendingDesktopCallInvite } = await import(
      '/src/services/useDesktopCallLinks.ts'
    );
    const { invitedGroupCall } = await import('/src/services/useCallState.ts');
    return {
      accepted,
      target: pendingDesktopCallInvite.value,
      joined: invitedGroupCall.value,
      search: location.search
    };
  });
  expect(result.accepted).toBe(false);
  expect(result.target).toContain('callRoom=new');
  expect(result.search).toContain('callInvite=new-token');
  expect(result.joined).toBeNull();
});

test('новое приглашение восстанавливается, пока запрос прежнего ещё выполняется', async ({
  page
}) => {
  await page.route('**/src/services/useLiveKit.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const hydrateInvitedGroupCallFromUrl = () => new Promise(resolve => {
      const room = new URL(location.href).searchParams.get('callRoom');
      window.inviteResolvers = window.inviteResolvers || {};
      window.inviteResolvers[room] = resolve;
    });`
    })
  );
  await page.goto(
    '/e2e/fixtures/call-download.html?callRoom=old&callInvite=old-token&callClient=web'
  );
  const result = await page.evaluate(async () => {
    const { restoreInvitedGroupCallFromUrl } = await import(
      '/src/services/useCalls.ts'
    );
    const old = restoreInvitedGroupCallFromUrl();
    while (!(window as any).inviteResolvers?.old)
      await new Promise(resolve => setTimeout(resolve, 0));
    history.replaceState(
      {},
      '',
      '?callRoom=new&callInvite=new-token&callClient=web'
    );
    const current = restoreInvitedGroupCallFromUrl();
    const duplicate = restoreInvitedGroupCallFromUrl();
    while (!(window as any).inviteResolvers?.new)
      await new Promise(resolve => setTimeout(resolve, 0));
    (window as any).inviteResolvers.old(false);
    await old;
    const afterOld = restoreInvitedGroupCallFromUrl();
    (window as any).inviteResolvers.new(true);
    return {
      different: old !== current,
      same: duplicate === current && afterOld === current,
      accepted: await current
    };
  });
  expect(result).toEqual({ different: true, same: true, accepted: true });
});
