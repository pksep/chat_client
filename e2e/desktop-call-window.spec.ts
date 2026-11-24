import { expect, test } from '@playwright/test';
test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
});

test('Tauri: отдельная поверхность, управление окном, быстрый микрофон и завершение', async ({
  page
}) => {
  test.setTimeout(120_000);
  const reports: any[] = [];
  await page.route('http://127.0.0.1:5213/report', async route => {
    const report = JSON.parse(route.request().postData()!);
    reports.push(report);
    if (
      process.env.DESKTOP_CALL_SCREENSHOT &&
      ['compact-incoming', 'context-menu', 'screen-permission'].includes(
        report.step
      )
    ) {
      const popup = page
        .context()
        .pages()
        .filter(item => item !== page && !item.isClosed())
        .at(-1)!;
      await popup.bringToFront();
      const name =
        report.step === 'compact-incoming' ? 'incoming-call' : report.step;
      await popup.screenshot({
        path: test.info().outputPath(`${name}.png`),
        timeout: 15_000,
        animations: 'disabled'
      });
    }
    await route.fulfill({
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  });
  await page.route('http://127.0.0.1:5213/**', route =>
    new URL(route.request().url()).pathname === '/report'
      ? route.fallback()
      : route.fulfill({
          json: [],
          headers: { 'Access-Control-Allow-Origin': '*' }
        })
  );
  await page.addInitScript(() => {
    const win = window as any;
    win.deliveredCallActivities = [];
    win.callControlsSnapshots = [];
    win.isTauri = true;
    let id = 0;
    const callbacks = new Map();
    const listeners: any[] = [];
    const windows: Record<string, any> = {
      main: {
        visible: true,
        minimized: false,
        maximized: false,
        fullscreen: false,
        focused: true
      },
      call: {
        visible: false,
        minimized: false,
        maximized: false,
        fullscreen: false,
        focused: false
      }
    };
    const emit = (label: string, event: string) =>
      listeners
        .filter(item => item.target.label === label && item.event === event)
        .forEach(item =>
          callbacks.get(item.handler)?.({
            event,
            payload: { width: 960, height: 720 }
          })
        );
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      },
      transformCallback: (callback: any) => {
        callbacks.set(++id, callback);
        return id;
      },
      invoke: async (command: string, args: any = {}) => {
        if (command === 'desktop_sync_call_controls') {
          win.callControlsSnapshots.push(args.snapshot);
          return;
        }
        if (command === 'desktop_window_state')
          return {
            label: args.label || 'main',
            ...windows[args.label || 'main']
          };
        if (command === 'desktop_notification_permission') return true;
        if (command === 'show_windows_notification') {
          if (args.tag.length > 64)
            throw new Error('The size of the notification tag is too large');
          win.deliveredCallActivities.push(args);
          return true;
        }
        if (command === 'plugin:event|emit') {
          listeners
            .filter(item => item.event === args.event)
            .forEach(item =>
              callbacks.get(item.handler)?.({
                event: args.event,
                payload: args.payload
              })
            );
          return;
        }
        if (command === 'desktop_call_window_available') return true;
        if (command === 'desktop_close_call_window') {
          win.open('', 'sep-chat-call')?.close();
          return;
        }
        if (command === 'plugin:event|listen') {
          listeners.push(args);
          return args.handler;
        }
        if (command === 'plugin:event|unlisten') return;
        const state = windows[args.label || 'main'];
        switch (command) {
          case 'plugin:window|is_decorated':
            return false;
          case 'plugin:window|is_fullscreen':
            return state.fullscreen;
          case 'plugin:window|is_maximized':
            return state.maximized;
          case 'plugin:window|is_minimized':
            return state.minimized;
          case 'plugin:window|is_visible':
            return state.visible;
          case 'plugin:window|is_focused':
            return state.focused;
          case 'plugin:window|set_focus':
            Object.values(windows).forEach(item => {
              item.focused = false;
            });
            state.focused = true;
            return;
          case 'plugin:window|inner_size':
            return state.size || { width: 960, height: 720 };
          case 'plugin:window|scale_factor':
            return 1;
          case 'plugin:window|set_size':
            state.size = args.value.size || args.value.Logical;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|minimize':
            state.minimized = true;
            state.focused = false;
            return;
          case 'plugin:window|unminimize':
            state.minimized = false;
            return;
          case 'plugin:window|toggle_maximize':
            state.maximized = !state.maximized;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|set_fullscreen':
            state.fullscreen = args.value;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|hide':
            state.visible = false;
            state.focused = false;
            return;
          case 'plugin:window|show':
            state.visible = true;
            return;
          case 'plugin:window|close':
            if (args.label === 'main') state.visible = false;
            else emit(args.label, 'tauri://close-requested');
            return;
          default:
            return null;
        }
      }
    };
  });
  await page.goto('/e2e/fixtures/desktop-call-window.html?nativeToasts=1');
  await expect
    .poll(
      () =>
        reports.some(item => item.step === 'complete' || item.passed === false),
      { timeout: 90_000 }
    )
    .toBe(true);
  expect(
    reports.find(item => item.step === 'complete' || item.passed === false),
    JSON.stringify(reports)
  ).toMatchObject({ step: 'complete', passed: true });
  expect(
    reports.find(item => item.step === 'immediate-microphone').latencyMs
  ).toBeLessThan(250);
  expect(reports.find(item => item.step === 'compact-incoming')).toMatchObject({
    passed: true,
    size: { width: 700, height: 606 }
  });
  expect(reports.find(item => item.step === 'lifecycle')).toMatchObject({
    endCount: 1,
    sourceTrack: 'live'
  });
  const delivered = await page.evaluate(
    () => (window as any).deliveredCallActivities
  );
  const activities = delivered.filter(
    (toast: any) => JSON.parse(toast.payload).type === 'call_activity'
  );
  const messages = delivered.filter(
    (toast: any) => JSON.parse(toast.payload).type === 'new_message'
  );
  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0].payload).topicId).toBe(
    '4e709627-2338-464f-8cda-ec036b41e815'
  );
  expect(
    reports.find(item => item.step === 'message-visibility-minimized')
  ).toMatchObject({
    activelyVisible: false,
    topicVisible: false,
    native: { minimized: true }
  });
  expect(activities).toHaveLength(6);
  for (const toast of activities) {
    expect(toast.tag.length).toBeLessThanOrEqual(16);
    const payload = JSON.parse(toast.payload);
    expect(payload.roomId).toHaveLength(36);
    expect(payload.participantId).toHaveLength(36);
  }
  const popup = page
    .context()
    .pages()
    .filter(item => item !== page && !item.isClosed())
    .at(-1)!;
  await popup.bringToFront();
  await expect(
    popup
      .getByRole('button', { name: 'Включить микрофон', exact: true })
      .first()
  ).toBeVisible();
  if (process.env.DESKTOP_CALL_SCREENSHOT)
    await popup.screenshot({
      path: test.info().outputPath('call-window.png'),
      timeout: 15_000,
      animations: 'disabled'
    });
  await expect(page.locator('.call-modal')).toHaveCount(0);
  await popup.locator('.call-modal').click({ button: 'right' });
  const menu = popup.getByTestId('DesktopCallContextMenu');
  const mic = menu.getByRole('menuitemcheckbox', {
    name: 'Включить микрофон',
    exact: true
  });
  await expect(mic).toHaveAttribute('aria-checked', 'false');
  await mic.click();
  await expect(
    menu.getByRole('menuitemcheckbox', {
      name: 'Выключить микрофон',
      exact: true
    })
  ).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callControlsSnapshots.at(-1))
    )
    .toMatchObject({ microphone: true, enabled: true });
  await menu
    .getByRole('menuitemcheckbox', { name: 'Выключить микрофон', exact: true })
    .click();
  await popup.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(popup.locator('.call-modal')).toBeVisible();
  await popup
    .getByRole('button', { name: 'Закрыть окно', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callWindowFixture.host === null)
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).callControlsSnapshots.at(-1))
    )
    .toMatchObject({
      enabled: false,
      microphone: false,
      camera: false,
      screen: false
    });
});
