import { expect, test, type Page } from '@playwright/test';

const invite = 'callRoom=choice-room&callInvite=signed%2Btoken%2F%3D';
const fixture = '/e2e/fixtures/call-link-choice.html';

const isolatedChoice = async (page: Page, query = invite): Promise<void> => {
  await page.addInitScript(() => {
    const win = window as any;
    win.nativeLinks = [];
    win.browserFocused = true;
    win.choiceSDK = { isConnected: () => true };
    Object.defineProperty(document, 'hasFocus', {
      configurable: true,
      value: () => win.browserFocused
    });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (/^(sepchat|intent):/.test(this.href)) win.nativeLinks.push(this.href);
      else click.call(this);
    };
  });
  await page.clock.install();
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
  await expect
    .poll(() => page.evaluate(() => (window as any).appLinksReady))
    .toBe(true);
};

test('обычный вход предлагает приложение системным протоколом без своей модалки', async ({
  page
}) => {
  await isolatedChoice(page, '');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const android = await page.evaluate(() =>
    /Android/i.test(navigator.userAgent)
  );
  const links = await page.evaluate(() => (window as any).nativeLinks);
  expect(links).toHaveLength(1);
  expect(links[0]).toMatch(
    android ? /^intent:\/\/chat\.pksep\.ru\// : /^sepchat:\/\/open$/
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as any).appLinksReady))
    .toBe(true);
  expect(await page.evaluate(() => (window as any).nativeLinks)).toEqual([]);
});

test('ERP явно открывает приложение после выбора веба, ERP-токен остаётся в HTTPS', async ({
  page
}) => {
  await isolatedChoice(page, 'appClient=web');
  expect(await page.evaluate(() => (window as any).nativeLinks)).toEqual([]);
  await page.goto(
    `${fixture}?appClient=app&token=erp-secret&organization=https%3A%2F%2Ferp.example.test`
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeLinks.length))
    .toBe(1);
  const target = await page.evaluate(() => (window as any).nativeLinks[0]);
  expect(target).not.toContain('erp-secret');
  expect(target).toContain('organization=');
  expect(new URL(page.url()).searchParams.get('token')).toBe('erp-secret');
  expect(new URL(page.url()).searchParams.get('appClient')).toBeNull();
});

test('для звонка передаётся приглашение; отмена системного запроса продолжает веб-звонок', async ({
  page
}) => {
  await isolatedChoice(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const target = await page.evaluate(() => (window as any).nativeLinks[0]);
  expect(target).toContain('callRoom=choice-room');
  expect(target).toContain('callInvite=signed%2Btoken%2F%3D');
  expect(
    await page.evaluate(() => (window as any).restoredInvites)
  ).toBeUndefined();
  await page.clock.fastForward(2500);
  await expect
    .poll(() => page.evaluate(() => (window as any).restoredInvites?.length))
    .toBe(1);
  expect(new URL(page.url()).searchParams.get('callClient')).toBe('web');
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => (window as any).appLinksReady))
    .toBe(true);
  expect(await page.evaluate(() => (window as any).nativeLinks)).toEqual([]);
});

test('открытый системный запрос не подключает второй звонок в вебе', async ({
  page
}) => {
  await isolatedChoice(page);
  await page.evaluate(() => {
    (window as any).browserFocused = false;
    window.dispatchEvent(new Event('blur'));
  });
  await page.clock.fastForward(10_000);
  expect(
    await page.evaluate(() => (window as any).restoredInvites)
  ).toBeUndefined();
  await page.evaluate(() => {
    (window as any).browserFocused = true;
    window.dispatchEvent(new Event('focus'));
  });
  await page.clock.fastForward(500);
  await expect
    .poll(() => page.evaluate(() => (window as any).restoredInvites?.length))
    .toBe(1);
});

test('при уходе в приложение веб не подключает параллельный звонок', async ({
  page
}) => {
  await isolatedChoice(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.fastForward(10_000);
  expect(
    await page.evaluate(() => (window as any).restoredInvites)
  ).toBeUndefined();
});

test('новая ссылка отменяет ожидание старой и не наследует организацию', async ({
  page
}) => {
  await isolatedChoice(page, `${invite}&organization=old`);
  await page.evaluate(() => {
    history.pushState({}, '', '?callRoom=next-room&callInvite=next-token');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const links = await page.evaluate(() => (window as any).nativeLinks);
  expect(links).toHaveLength(2);
  expect(links[1]).toContain('callRoom=next-room');
  expect(links[1]).not.toContain('organization');
  await page.clock.fastForward(2500);
  expect(new URL(page.url()).searchParams.get('callRoom')).toBe('next-room');
  expect(new URL(page.url()).searchParams.has('organization')).toBe(false);
});

test('iPhone сохраняет веб/PWA без desktop-протокола', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
    });
  });
  await isolatedChoice(page);
  expect(await page.evaluate(() => (window as any).nativeLinks)).toEqual([]);
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
