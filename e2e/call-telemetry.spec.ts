import { expect, test, type Page } from '@playwright/test';

const recordProbe = (page: Page) =>
  page.evaluate(async () => {
    const { authedUser, setConfig, telemetry } = await import(
      '/e2e/fixtures/call-telemetry.ts'
    );
    authedUser.value = { id: 'telemetry-tabs-user', initials: 'Т' } as any;
    setConfig({ CHAT_API_DOMAIN: `${location.origin}/call-telemetry-api` });
    telemetry.recordTelemetryEvent({
      category: 'call',
      name: 'call.livekit.connect.start',
      traceId: 'page-probe'
    });
    await telemetry.flushTelemetryEvents();
  });

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    document.cookie = 'authToken=call-telemetry-test;path=/';
  });
  await context.route('**/__call-telemetry', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div>'
    })
  );
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.fallback()
      : route.abort();
  });
});

test('телеметрия считает 1 → 2 → 3 вкладки, звонок во второй, закрытие и refresh', async ({
  page,
  context
}) => {
  const events: any[] = [];
  await context.route('**/call-telemetry-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  const readTabs = async (target: Page) => {
    await recordProbe(target);
    return events.filter(event => event.traceId === 'page-probe').at(-1).context
      .tabs;
  };
  await page.goto('/__call-telemetry');
  expect(await readTabs(page)).toMatchObject({
    status: 'available',
    openTabCount: 1
  });

  const second = await context.newPage();
  await second.goto('/__call-telemetry');
  await recordProbe(second);
  await second.evaluate(async () => {
    const { calls } = await import('/e2e/fixtures/call-telemetry.ts');
    calls.roomId.value = 'livekit-second-tab';
    calls.open.value = true;
  });
  const twoTabs = await readTabs(second);
  expect(twoTabs.openTabCount).toBe(2);
  expect(twoTabs.tabsWithCallCount).toBe(1);
  const secondPageId = twoTabs.tabs.find(
    (tab: any) => tab.callRoomId === 'livekit-second-tab'
  ).pageInstanceId;

  const third = await context.newPage();
  await third.goto('/__call-telemetry');
  await recordProbe(third);
  const threeTabs = await readTabs(page);
  expect(threeTabs.openTabCount).toBe(3);
  expect(threeTabs.tabsWithCallCount).toBe(1);
  expect(threeTabs.tabs.map((tab: any) => tab.pageInstanceId)).toContain(
    secondPageId
  );
  await expect
    .poll(async () => {
      await recordProbe(page);
      return events.some(
        event =>
          event.name === 'app.page.tabs_snapshot' &&
          event.payload.openTabCount === 3
      );
    })
    .toBeTruthy();
  await third.close();
  await expect.poll(async () => (await readTabs(page)).openTabCount).toBe(2);

  await second.reload();
  const afterRefresh = await readTabs(second);
  expect(afterRefresh.openTabCount).toBe(2);
  expect(afterRefresh.tabs.map((tab: any) => tab.pageInstanceId)).not.toContain(
    secondPageId
  );
  await second.close();
  await expect.poll(async () => (await readTabs(page)).openTabCount).toBe(1);
});

test('отличает refresh и вторую вкладку даже при одинаковом sessionId', async ({
  page,
  context
}) => {
  const events: any[] = [];
  await context.route('**/call-telemetry-api/telemetry/events', route => {
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.goto('/__call-telemetry');
  await recordProbe(page);
  const first = events.find(event => event.traceId === 'page-probe');
  expect(first.context.page.instanceId).toMatch(/^page-/);
  expect(first.context.page.navigationType).toBe('navigate');

  const popupPromise = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/__call-telemetry'));
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await recordProbe(popup);
  const second = events.filter(event => event.traceId === 'page-probe').at(-1);
  expect(second.sessionId).toBe(first.sessionId);
  expect(second.context.page.instanceId).not.toBe(
    first.context.page.instanceId
  );
  await popup.close();

  await page.reload();
  await recordProbe(page);
  const refreshed = events
    .filter(event => event.traceId === 'page-probe')
    .at(-1);
  expect(refreshed.sessionId).toBe(first.sessionId);
  expect(refreshed.context.page.instanceId).not.toBe(
    first.context.page.instanceId
  );
  expect(refreshed.context.page.navigationType).toBe('reload');
});

test('сбой звонка переживает недоступность API и refresh с исходным SID и идентификатором страницы', async ({
  page,
  context
}) => {
  const events: any[] = [];
  let reachable = false;
  await context.route('**/call-telemetry-api/telemetry/events', route => {
    if (!reachable) return route.abort();
    events.push(...route.request().postDataJSON().events);
    return route.fulfill({ json: { accepted: events.length } });
  });
  await page.goto('/__call-telemetry');
  await recordProbe(page);
  const original = await page.evaluate(async () => {
    const telemetry = await import('/src/services/useTelemetry.ts');
    telemetry.recordTelemetryEvent({
      category: 'call',
      name: 'call.livekit.disconnected.observed',
      level: 'warn',
      traceId: 'offline-call',
      entityId: 'livekit-test',
      payload: {
        reasonName: 'DUPLICATE_IDENTITY',
        callConnection: { instanceId: 'room-test', participantSid: 'PA_test' }
      }
    });
    await telemetry.flushTelemetryEvents();
    return JSON.parse(
      localStorage.getItem('chat.telemetry.network.pending.v1') || '[]'
    ).find((event: any) => event.traceId === 'offline-call');
  });
  expect(original.context.location).toBeUndefined();
  expect(original.payload.callConnection.participantSid).toBe('PA_test');

  await page.reload();
  reachable = true;
  await recordProbe(page);
  await expect
    .poll(() => events.find(event => event.id === original.id))
    .toBeTruthy();
  const restored = events.find(event => event.id === original.id);
  expect(restored).toEqual(original);
  const current = events.filter(event => event.traceId === 'page-probe').at(-1);
  expect(restored.context.page.instanceId).not.toBe(
    current.context.page.instanceId
  );
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'app.page.hide',
        context: expect.objectContaining({
          page: expect.objectContaining({
            instanceId: original.context.page.instanceId
          })
        })
      })
    ])
  );
});
