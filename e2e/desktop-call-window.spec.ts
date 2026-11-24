import { expect, test } from '@playwright/test';
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('Tauri: отдельная поверхность, управление окном, быстрый микрофон и завершение', async ({ page }) => {
  test.setTimeout(120_000);
  const reports: any[] = [];
  await page.route('http://127.0.0.1:5213/report', async route => {
    const report = JSON.parse(route.request().postData()!);
    reports.push(report);
    if (process.env.DESKTOP_CALL_SCREENSHOT && ['compact-incoming', 'context-menu', 'screen-permission'].includes(report.step)) {
      const popup = page.context().pages().filter(item => item !== page && !item.isClosed()).at(-1)!;
      await popup.bringToFront();
      const name = report.step === 'compact-incoming' ? 'incoming-call' : report.step;
      await popup.screenshot({ path: test.info().outputPath(`${name}.png`), timeout: 15_000, animations: 'disabled' });
    }
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.addInitScript(() => {
    const win = window as any;
    win.isTauri = true;
    let id = 0;
    const callbacks = new Map();
    const listeners: any[] = [];
    const windows: Record<string, any> = {
      main: { visible: true, minimized: false, maximized: false, fullscreen: false, focused: true },
      call: { visible: false, minimized: false, maximized: false, fullscreen: false, focused: false }
    };
    const emit = (label: string, event: string) => listeners.filter(item => item.target.label === label && item.event === event).forEach(item => callbacks.get(item.handler)?.({ event, payload: { width: 960, height: 720 } }));
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    win.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback: (callback: any) => { callbacks.set(++id, callback); return id; },
      invoke: async (command: string, args: any = {}) => {
        if (command === 'desktop_call_window_available') return true;
        if (command === 'desktop_close_call_window') {
          win.open('', 'sep-chat-call')?.close();
          return;
        }
        if (command === 'plugin:event|listen') { listeners.push(args); return args.handler; }
        if (command === 'plugin:event|unlisten') return;
        const state = windows[args.label || 'main'];
        switch (command) {
          case 'plugin:window|is_decorated': return false;
          case 'plugin:window|is_fullscreen': return state.fullscreen;
          case 'plugin:window|is_maximized': return state.maximized;
          case 'plugin:window|is_minimized': return state.minimized;
          case 'plugin:window|is_visible': return state.visible;
          case 'plugin:window|is_focused': return state.focused;
          case 'plugin:window|set_focus':
            Object.values(windows).forEach(item => { item.focused = false; });
            state.focused = true;
            return;
          case 'plugin:window|inner_size': return state.size || { width: 960, height: 720 };
          case 'plugin:window|scale_factor': return 1;
          case 'plugin:window|set_size':
            state.size = args.value.size || args.value.Logical;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|minimize': state.minimized = true; state.focused = false; return;
          case 'plugin:window|unminimize': state.minimized = false; return;
          case 'plugin:window|toggle_maximize': state.maximized = !state.maximized; emit(args.label, 'tauri://resize'); return;
          case 'plugin:window|set_fullscreen': state.fullscreen = args.value; emit(args.label, 'tauri://resize'); return;
          case 'plugin:window|hide': state.visible = false; state.focused = false; return;
          case 'plugin:window|show': state.visible = true; return;
          case 'plugin:window|close':
            if (args.label === 'main') state.visible = false;
            else emit(args.label, 'tauri://close-requested');
            return;
          default: return null;
        }
      }
    };
  });
  await page.goto('/e2e/fixtures/desktop-call-window.html');
  await expect.poll(() => reports.some(item => item.step === 'complete' || item.passed === false), { timeout: 90_000 }).toBe(true);
  expect(reports.find(item => item.step === 'complete' || item.passed === false), JSON.stringify(reports)).toMatchObject({ step: 'complete', passed: true });
  expect(reports.find(item => item.step === 'immediate-microphone').latencyMs).toBeLessThan(250);
  expect(reports.find(item => item.step === 'compact-incoming')).toMatchObject({ passed: true, size: { width: 700, height: 606 } });
  expect(reports.find(item => item.step === 'lifecycle')).toMatchObject({ endCount: 1, sourceTrack: 'live' });
  const popup = page.context().pages().filter(item => item !== page && !item.isClosed()).at(-1)!;
  await popup.bringToFront();
  await expect(popup.getByRole('button', { name: 'Включить микрофон', exact: true }).first()).toBeVisible();
  if (process.env.DESKTOP_CALL_SCREENSHOT)
    await popup.screenshot({ path: test.info().outputPath('call-window.png'), timeout: 15_000, animations: 'disabled' });
  await expect(page.locator('.call-modal')).toHaveCount(0);
});
