import { expect, test } from '@playwright/test';
import { installTauriCallWindowMock } from './fixtures/tauri-call-window-mock';

test.setTimeout(90_000);

async function openHeader(
  page: import('@playwright/test').Page,
  kind = 'group'
) {
  await installTauriCallWindowMock(page);
  await page.route('**/folder-menu-api/**', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/src/services/useCalls.ts*', route =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
    export async function joinGroupCall(topic, options) {
      window.joinCount = (window.joinCount || 0) + 1;
      window.joinSignal = options?.signal;
      await new Promise(resolve => { window.releaseJoin = resolve; });
      return false;
    }
    export const joinInviteGroupCall = joinGroupCall;
  `
    })
  );
  await page.goto(
    `/e2e/fixtures/header-context-menu.html?kind=${kind}&native-call-test=1`
  );
  await expect(page.getByTestId('Fixture-Header-Container')).toBeVisible();
}

test('Tauri открывает окно до ответа сервера, показывает ожидание и отменяет ещё не начатый вход', async ({
  page
}) => {
  await openHeader(page);
  await page.evaluate(async () => {
    const call = await import('/src/services/useCallState.ts');
    call.activeGroupCalls.value = {
      'header-topic': {
        roomId: 'waiting-room',
        topicId: 'header-topic',
        groupMode: true
      }
    };
  });
  const banner = page.locator('.chat__header-active-call');
  const popupPromise = page.waitForEvent('popup');
  await banner.click();
  await expect(banner).toHaveAttribute('aria-busy', 'true');
  await expect(banner).toContainText('Подключение…');
  await banner.dispatchEvent('click');
  const popup = await popupPromise;
  await expect(popup.getByTestId('DesktopCallPreparing')).toBeVisible();
  expect(await page.evaluate(() => (window as any).joinCount)).toBe(1);
  expect(await page.evaluate(() => (window as any).joinSignal.aborted)).toBe(
    false
  );
  await popup
    .getByRole('button', { name: 'Закрыть окно', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).joinSignal.aborted))
    .toBe(true);
  await expect(banner).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => (window as any).releaseJoin());
  await expect(banner).not.toHaveAttribute('aria-busy', 'true');
  expect(
    await page.evaluate(
      async () => (await import('/src/services/useCallState.ts')).open.value
    )
  ).toBe(false);
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test('отмена прямого звонка сохраняет инициалы даже после сброса топика звонка', async ({
  page
}) => {
  await openHeader(page, 'dm');
  await page.evaluate(async () => {
    const call = await import('/src/services/useCallState.ts');
    const presentation = await import(
      '/src/services/desktop-call-presentation.ts'
    );
    presentation.desktopCallWindowReady.value = true;
    call.topicId.value = 'header-topic';
    call.user.value = { id: 'other-user', initials: 'Иванов И.И.' } as any;
    call.isCalling.value = true;
    call.isModalVisible.value = true;
    call.open.value = true;
  });
  const label = page.locator('.chat__header-active-call__label');
  await expect(label).toHaveText('Иванов И.И.');
  await page.evaluate(async () => {
    const call = await import('/src/services/useCallState.ts');
    call.isCalling.value = false;
    call.topicId.value = null;
    call.remoteParticipants.value = [];
  });
  await expect(label).toHaveText('Иванов И.И.');
  await page.evaluate(async () => {
    (await import('/src/services/useCallState.ts')).open.value = false;
  });
  await expect(page.locator('.chat__header-active-call')).not.toBeVisible();
});

test('отмена во время проверки комнаты не отправляет ответ и не запускает RTC', async ({
  page
}) => {
  await openHeader(page);
  const results = await page.evaluate(async () => {
    const { getChatSDK } = await import('/src/services/useChat.ts');
    const core = await import('/src/services/useLiveKit.ts');
    const call = await import('/src/services/useCallState.ts');
    const sdk = getChatSDK() as any;
    let answers = 0;
    sdk.sendWebSocketEventWithAck = async () => {
      answers++;
      return { accepted: true };
    };
    const results: any[] = [];
    for (const invited of [false, true]) {
      const controller = new AbortController();
      let release!: (value: any) => void;
      sdk.getLiveKitCallStatus = () =>
        new Promise(resolve => {
          release = resolve;
        });
      call.activeGroupCalls.value = {
        'header-topic': { roomId: 'pending-room', topicId: 'header-topic' }
      };
      call.invitedGroupCall.value = {
        roomId: 'pending-room',
        topicId: 'header-topic',
        title: 'Встреча',
        inviteToken: 'local-token',
        isJoinAvailable: true,
        participantCount: 1,
        members: []
      };
      const request = invited
        ? core.joinInvitedGroupCall({ signal: controller.signal })
        : core.joinPendingGroupCall('header-topic', {
            signal: controller.signal
          });
      controller.abort();
      release({ active: true });
      results.push({ joined: await request, active: call.open.value, answers });
    }
    const statuses: Array<(status: any) => void> = [];
    sdk.getLiveKitCallStatus = () =>
      new Promise(resolve => {
        statuses.push(resolve);
      });
    const oldController = new AbortController();
    const retryController = new AbortController();
    const oldRequest = core.joinInvitedGroupCall({
      signal: oldController.signal
    });
    oldController.abort();
    const retryRequest = core.joinInvitedGroupCall({
      signal: retryController.signal
    });
    const retryRequests = statuses.length;
    statuses[0]({ active: true });
    await oldRequest;
    const duplicate = core.joinInvitedGroupCall({
      signal: retryController.signal
    });
    retryController.abort();
    statuses[1]({ active: true });
    const retries = await Promise.all([retryRequest, duplicate]);
    return {
      results,
      retryRequests,
      finalRequests: statuses.length,
      retries,
      answers
    };
  });
  expect(results).toEqual({
    results: [
      { joined: false, active: false, answers: 0 },
      { joined: false, active: false, answers: 0 }
    ],
    retryRequests: 2,
    finalRequests: 2,
    retries: [false, false],
    answers: 0
  });
});
