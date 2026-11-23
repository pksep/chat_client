import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function openShell(
  page: Page,
  options: {
    tauri: boolean;
    decorated: boolean;
    theme: string;
    screenPermission?: boolean;
    fullApp?: boolean;
    call?: boolean;
  } = { tauri: true, decorated: false, theme: 'light' }
) {
  await page.addInitScript(
    ({ tauri, decorated, screenPermission, fullApp }) => {
      const win = window as any;
      win.shellCalls = [];
      win.shellCaptureCalls = [];
      win.shellScreenPermission = screenPermission !== false;
      win.shellSources = [
        { id: 'screen:1', name: 'Экран 1', kind: 'screen' },
        { id: 'screen:2', name: 'Экран 2', kind: 'screen' },
        { id: 'window:3', name: 'Редактор', kind: 'window' },
        { id: 'window:4', name: 'Таблица', kind: 'window' }
      ];
      win.shellState = { maximized: false, fullscreen: false, decorated };
      if (fullApp) {
        const url = 'http://127.0.0.1:65530';
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([
            {
              url,
              config: {
                CHAT_API_DOMAIN: url,
                CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
                CHAT_MASTRA_URL: 'http://127.0.0.1:4111'
              }
            }
          ])
        );
        localStorage.setItem('chat_runtime_last_organization', url);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({
            token: 'desktop-layout-test',
            user: { id: 'desktop-layout-test-user' }
          })
        );
        sessionStorage.setItem('menu-collapse', 'false');
      }
      const callbacks = new Map<number, (event: unknown) => void>();
      const handlers = new Map<string, number[]>();
      win.emitShellEvent = (event: string, payload: unknown) =>
        handlers
          .get(event)
          ?.forEach(id => callbacks.get(id)?.({ event, payload }));
      if (tauri) {
        win.isTauri = true;
        win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
        win.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { label: 'main' }
          },
          transformCallback: (callback: (event: unknown) => void) => {
            const id = callbacks.size + 1;
            callbacks.set(id, callback);
            return id;
          },
          invoke: async (command: string, args: any) => {
            win.shellCalls.push({ command, args });
            if (command === 'plugin:event|listen') {
              handlers.set(args.event, [
                ...(handlers.get(args.event) || []),
                args.handler
              ]);
              return args.handler;
            }
            if (command === 'plugin:window|is_decorated')
              return win.shellState.decorated;
            if (command === 'plugin:window|is_fullscreen')
              return win.shellState.fullscreen;
            if (command === 'plugin:window|is_maximized')
              return win.shellState.maximized;
            if (command === 'plugin:window|is_focused') return true;
            if (command === 'plugin:window|toggle_maximize')
              win.shellState.maximized = !win.shellState.maximized;
            if (command === 'desktop_media_permissions_available') return true;
            if (command === 'desktop_load_permission_preferences') {
              const saved = sessionStorage.getItem('shell-native-permissions');
              if (saved) return JSON.parse(saved);
              sessionStorage.setItem(
                'shell-native-permissions',
                JSON.stringify(args.legacy)
              );
              return args.legacy;
            }
            if (command === 'desktop_save_permission_choice') {
              const saved = JSON.parse(
                sessionStorage.getItem('shell-native-permissions') || '{}'
              );
              saved[args.permission] = args.choice;
              sessionStorage.setItem(
                'shell-native-permissions',
                JSON.stringify(saved)
              );
            }
            if (command === 'desktop_reset_permission_preferences') {
              sessionStorage.setItem('shell-native-permissions', '{}');
            }
            if (command === 'desktop_screen_capture_available')
              return {
                supported: true,
                permissionGranted: win.shellScreenPermission
              };
            if (command === 'desktop_screen_capture_sources')
              return win.shellSources;
            if (command === 'desktop_screen_capture_permission') return true;
            if (command === 'desktop_screen_capture_start') {
              win.shellCaptureActive = true;
              const buffer = new ArrayBuffer(24);
              new DataView(buffer).setUint32(0, 2, true);
              new DataView(buffer).setUint32(4, 2, true);
              new Uint8Array(buffer, 8).fill(255);
              setTimeout(() => args.onFrame.onmessage(buffer), 30);
              return 'capture-test';
            }
            if (command === 'desktop_screen_capture_stop')
              win.shellCaptureActive = false;
            return null;
          }
        };
      }
      if (!navigator.mediaDevices)
        Object.defineProperty(navigator, 'mediaDevices', {
          value: {},
          configurable: true
        });
      navigator.mediaDevices.getUserMedia = async constraints => {
        win.shellCaptureCalls.push(constraints);
        const audio =
          win.shellUseTrack && constraints?.audio
            ? [
                {
                  readyState: 'live',
                  stop() {
                    this.readyState = 'ended';
                  },
                  addEventListener() {}
                }
              ]
            : [];
        return {
          getTracks: () => audio,
          getAudioTracks: () => audio,
          getVideoTracks: () => []
        } as unknown as MediaStream;
      };
    },
    options
  );
  if (options.fullApp) {
    await page.route('**/manager/access', route =>
      route.fulfill({ json: { allowed: false } })
    );
    await page.route('**/users/me/access', route =>
      route.fulfill({
        json: {
          userId: 'desktop-layout-test-user',
          effective: { client: false, ai: false },
          access: { client: false, ai: false }
        }
      })
    );
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.menu')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('DesktopTitleBar')).toBeVisible();
    return;
  }
  await page.goto(
    `/e2e/fixtures/desktop-shell.html?theme=${options.theme}${options.call ? '&call' : ''}`,
    {
      waitUntil: 'domcontentloaded'
    }
  );
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).desktopShellFixture?.ready)
    )
    .toBe(true);
}

test('Полноэкранное видео звонка и панели помещаются под шапкой Tauri', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openShell(page, {
    tauri: true,
    decorated: false,
    theme: 'dark',
    call: true
  });
  const stage = page.locator('.call-modal__participant-stage');
  await page.locator('.call-modal__remote-tile').first().click();
  await expect(stage).toBeVisible();
  await stage
    .getByRole('button', { name: 'Видео fullscreen', exact: true })
    .click();
  const overlay = page.locator('.call-modal__video-overlay');
  await expect(overlay).toBeVisible();
  for (const [width, height] of [
    [1280, 800],
    [960, 640]
  ]) {
    await page.setViewportSize({ width, height });
    await page.mouse.move(400, 90);
    const top = overlay.locator('.call-modal__video-overlay-bar--top');
    await expect(top).toBeVisible();
    const titlebar = (await page.getByTestId('DesktopTitleBar').boundingBox())!;
    for (const selector of [
      '.call-modal__video-overlay',
      '.call-modal__video-overlay-video',
      '.call-modal__video-overlay-bar--top'
    ]) {
      await expect
        .poll(async () => (await page.locator(selector).boundingBox())!.y)
        .toBeGreaterThanOrEqual(titlebar.y + titlebar.height);
      await expect
        .poll(async () => {
          const box = (await page.locator(selector).boundingBox())!;
          return box.y + box.height;
        })
        .toBeLessThanOrEqual(height + 1);
    }
    await page.mouse.move(400, height - 50);
    const bottom = overlay.locator('.call-modal__video-overlay-bar--bottom');
    await expect(bottom).toBeVisible();
    await expect
      .poll(async () => {
        const controls = (await bottom.boundingBox())!;
        return controls.y + controls.height;
      })
      .toBeLessThanOrEqual(height + 1);
  }
  await page.mouse.move(400, 90);
  await expect(
    overlay.locator('.call-modal__video-overlay-bar--top')
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('call-below-titlebar.png'),
    animations: 'disabled'
  });
  await page.evaluate(() =>
    document.documentElement.classList.remove('chat-desktop-custom-chrome')
  );
  expect((await overlay.boundingBox())!.y).toBe(0);
  expect((await overlay.boundingBox())!.height).toBe(640);
});

test('Tauri: окно целиком помещается под шапкой, сворачивание списка доступно', async ({
  page
}) => {
  // Этот сценарий проверяет desktop layout даже при мобильном browser project.
  await page.setViewportSize({ width: 960, height: 640 });
  await openShell(page, {
    tauri: true,
    decorated: false,
    theme: 'light',
    fullApp: true
  });
  const collapse = page.locator('.chats-toolbar__collapse');
  const checkLayout = async (titlebarHeight: number) => {
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const { top, bottom, height } = document
          .querySelector(selector)!
          .getBoundingClientRect();
        return { top, bottom, height };
      };
      return {
        viewport: innerHeight,
        scrollHeight: document.scrollingElement!.scrollHeight,
        body: box('body'),
        root: box('#app'),
        content: box('.chat-container'),
        collapse: box('.chats-toolbar__collapse')
      };
    });
    expect(geometry.scrollHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(
      geometry.viewport
    );
    expect(geometry.content.bottom).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.content.top).toBe(titlebarHeight);
    expect(geometry.collapse.top).toBe(titlebarHeight + 20);
  };
  for (const viewport of [
    { width: 960, height: 640 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await checkLayout(36);
    await collapse.click();
    await expect(page.locator('.menu')).toHaveClass(/menu--collapse/);
    await checkLayout(36);
    await collapse.click();
    await expect(page.locator('.menu')).not.toHaveClass(/menu--collapse/);
  }
  for (const fullscreen of [true, false]) {
    await page.evaluate(fullscreen => {
      (window as any).shellState.fullscreen = fullscreen;
      (window as any).emitShellEvent('tauri://resize', {
        width: innerWidth,
        height: innerHeight
      });
    }, fullscreen);
    await expect(page.getByTestId('DesktopTitleBar')).toHaveCount(
      fullscreen ? 0 : 1
    );
    await checkLayout(fullscreen ? 0 : 36);
  }
});

test('Шапка Tauri: управление окном и отступы без полосы прокрутки', async ({
  page
}) => {
  await openShell(page);
  const bar = page.getByTestId('DesktopTitleBar');
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())?.height).toBe(36);
  expect((await page.getByTestId('DesktopShellContent').boundingBox())?.y).toBe(
    36
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight
    )
  ).toBe(true);
  await bar.getByRole('button', { name: 'Свернуть', exact: true }).click();
  await bar.getByRole('button', { name: 'Развернуть', exact: true }).click();
  await expect(
    bar.getByRole('button', { name: 'Восстановить размер' })
  ).toBeVisible();
  await bar.locator('.desktop-titlebar__space').dblclick();
  await expect(
    bar.getByRole('button', { name: 'Развернуть', exact: true })
  ).toBeVisible();
  await bar.getByRole('button', { name: 'Закрыть окно' }).click();
  const commands = await page.evaluate(() =>
    (window as any).shellCalls.map((call: any) => call.command)
  );
  expect(commands).toContain('plugin:window|minimize');
  expect(commands).toContain('plugin:window|close');
  expect(
    commands.filter(
      (command: string) => command === 'plugin:window|toggle_maximize'
    )
  ).toHaveLength(2);
  await page.evaluate(() => {
    (window as any).shellState.fullscreen = true;
    (window as any).emitShellEvent('tauri://resize', {
      width: 1200,
      height: 800
    });
  });
  await expect(bar).toHaveCount(0);
  expect((await page.getByTestId('DesktopShellContent').boundingBox())?.y).toBe(
    0
  );
});

async function openScreenPicker(page: Page) {
  await page.evaluate(() => {
    const win = window as any;
    win.shellDisplayCapture = win.desktopShellFixture
      .prepareDesktopScreenCapture()
      ?.then(
        (track: MediaStreamTrack) => {
          win.shellDisplayTrack = track;
        },
        (error: Error) => {
          win.shellDisplayError = error.name;
        }
      );
  });
  return page.getByTestId('DesktopScreenSharePicker');
}

test('Свой выбор экрана: конкретный источник, начало только по кнопке, освобождение захвата', async ({
  page
}, testInfo) => {
  await openShell(page);
  test.skip(
    !(await page.evaluate(
      () => typeof document.createElement('canvas').captureStream === 'function'
    )),
    'Эта сборка WebKit для Windows не содержит WebRTC/canvas capture; нативный захват проверяется отдельно в Tauri.'
  );
  const picker = await openScreenPicker(page);
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole('button', { name: 'Поделиться', exact: true })
  ).toBeDisabled();
  await expect(
    picker.getByRole('button', { name: 'Экран 1', exact: true })
  ).toBeVisible();
  await picker.getByRole('tab', { name: 'Окно приложения' }).click();
  await picker.getByRole('button', { name: 'Таблица', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Поделиться', exact: true })
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).shellCalls.some(
        (call: any) => call.command === 'desktop_screen_capture_start'
      )
    )
  ).toBe(false);
  await picker.screenshot({
    path: testInfo.outputPath('desktop-screen-picker-light.png')
  });
  await picker.getByRole('button', { name: 'Поделиться', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).shellDisplayTrack?.readyState)
    )
    .toBe('live');
  const started = await page.evaluate(
    () =>
      (window as any).shellCalls.find(
        (call: any) => call.command === 'desktop_screen_capture_start'
      ).args.sourceId
  );
  expect(started).toBe('window:4');
  await page.evaluate(() => (window as any).shellDisplayTrack.stop());
  await expect
    .poll(() => page.evaluate(() => (window as any).shellCaptureActive))
    .toBe(false);
});

test('Отмена выбора экрана не запускает нативный захват', async ({ page }) => {
  await openShell(page);
  const picker = await openScreenPicker(page);
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate(() => (window as any).shellDisplayError))
    .toBe('NotAllowedError');
  expect(
    await page.evaluate(() =>
      (window as any).shellCalls.some(
        (call: any) => call.command === 'desktop_screen_capture_start'
      )
    )
  ).toBe(false);
});

test('Запись экрана: запрос ОС и обновление списка источников', async ({
  page
}, testInfo) => {
  await openShell(page, {
    tauri: true,
    decorated: false,
    theme: 'dark',
    screenPermission: false
  });
  const picker = await openScreenPicker(page);
  await expect(picker).toContainText('Разрешите запись экрана');
  await expect(
    picker.getByRole('button', { name: 'Поделиться', exact: true })
  ).toBeDisabled();
  await picker
    .getByRole('button', { name: 'Разрешить доступ', exact: true })
    .click();
  await expect(
    picker.getByRole('button', { name: 'Экран 1', exact: true })
  ).toBeVisible();
  await picker.getByRole('button', { name: 'Экран 1', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Поделиться', exact: true })
  ).toBeEnabled();
  await picker.screenshot({
    path: testInfo.outputPath('desktop-screen-picker-dark.png')
  });
  await page.evaluate(() => {
    (window as any).shellSources = [];
  });
  await picker.getByRole('button', { name: 'Обновить список' }).click();
  await expect(picker).toContainText('Нет доступных экранов.');
  await expect(
    picker.getByRole('button', { name: 'Поделиться', exact: true })
  ).toBeDisabled();
});

test('Разрешения устройств показываются списком, запрос и выдача обновляют статус', async ({
  page
}, testInfo) => {
  await openShell(page, { tauri: true, decorated: false, theme: 'dark' });
  await page
    .getByRole('button', { name: 'Разрешения устройств', exact: true })
    .click();
  const list = page.getByRole('list', { name: 'Разрешения СЭП Чата' });
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Микрофон' })
  ).toContainText('Не запрошено');
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Демонстрация экрана' })
  ).toContainText('Не запрошено');
  await list.screenshot({
    path: testInfo.outputPath('device-permissions-list-dark.png')
  });
  await page.getByRole('button', { name: 'Проверить видеозвонок' }).click();
  const dialog = page.getByTestId('DesktopMediaPermissionDialog');
  await expect(
    dialog
      .getByRole('list', { name: 'Запрашиваемые разрешения' })
      .getByRole('listitem')
  ).toHaveCount(2);
  await dialog.screenshot({
    path: testInfo.outputPath('media-permissions-list-dark.png')
  });
  await dialog.getByRole('button', { name: 'Разрешить', exact: true }).click();
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Микрофон' })
  ).toContainText('Разрешено');
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Камера' })
  ).toContainText('Разрешено');
  await list.getByRole('switch', { name: 'Микрофон', exact: true }).click();
  await expect(
    list.getByRole('listitem').filter({ hasText: 'Микрофон' })
  ).toContainText('Не разрешено');
  await expect(
    list.getByRole('switch', { name: 'Камера', exact: true })
  ).toHaveAttribute('aria-checked', 'true');
});

test('Отказ и Escape не включают микрофон, повторное разрешение даёт доступ', async ({
  page
}) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Разрешить доступ к микрофону?');
  await dialog.getByRole('button', { name: 'Не сейчас' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'NotAllowedError'
  );
  expect(
    await page.evaluate(() => (window as any).shellCaptureCalls.length)
  ).toBe(0);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => (window as any).shellCaptureCalls.length)
  ).toBe(0);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await dialog.getByRole('button', { name: 'Разрешить', exact: true }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  expect(
    await page.evaluate(() => (window as any).shellCaptureCalls.length)
  ).toBe(1);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).shellCaptureCalls.length))
    .toBe(2);
});

test('Одновременные запросы не дают доступ к камере до отдельного согласия', async ({
  page
}) => {
  await openShell(page);
  await page.evaluate(() => {
    void (window as any).desktopShellFixture.capture({ audio: true });
    void (window as any).desktopShellFixture.capture({
      audio: true,
      video: true
    });
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Разрешить доступ к микрофону?');
  await dialog.getByRole('button', { name: 'Разрешить', exact: true }).click();
  await expect(dialog).toContainText('Разрешить доступ к камере?');
  expect(
    await page.evaluate(() => (window as any).shellCaptureCalls.length)
  ).toBe(1);
  await dialog.getByRole('button', { name: 'Не сейчас' }).click();
  expect(
    await page.evaluate(() => (window as any).shellCaptureCalls.length)
  ).toBe(1);
});

test('разрешение микрофона переживает перезапуск интерфейса, камера требует отдельного согласия', async ({
  page
}) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Разрешить', exact: true })
    .click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).desktopShellFixture?.ready)
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  await expect(
    page.getByTestId('DesktopMediaPermissionDialog')
  ).not.toBeVisible();
  const restored = await page.evaluate(() =>
    (window as any).shellCalls.filter(
      (call: any) => call.command === 'desktop_grant_permissions'
    )
  );
  expect(restored).toContainEqual({
    command: 'desktop_grant_permissions',
    args: { permissions: ['microphone'] }
  });
  await page.getByRole('button', { name: 'Проверить видеозвонок' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Разрешить доступ к камере?'
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Разрешить', exact: true })
    .click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).desktopShellFixture?.ready)
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Проверить видеозвонок' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  await expect(
    page.getByTestId('DesktopMediaPermissionDialog')
  ).not.toBeVisible();
});

test('каждое разрешение переключается отдельно и сохраняется после перезапуска', async ({
  page
}, testInfo) => {
  await openShell(page);
  await page.evaluate(async () => {
    const { saveDesktopPermissionChoice } = await import(
      '/src/services/desktop-permission-preferences.ts'
    );
    await saveDesktopPermissionChoice('microphone', 'granted');
    await saveDesktopPermissionChoice('geolocation', 'denied');
  });
  await page
    .getByRole('button', { name: 'Разрешения устройств', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Запросить разрешения заново' })
  ).toHaveCount(0);
  await page.getByRole('switch', { name: 'Микрофон', exact: true }).click();
  await page.getByRole('switch', { name: 'Камера', exact: true }).click();
  await page
    .getByTestId('DesktopPermissions-Container')
    .screenshot({ path: testInfo.outputPath('permission-preferences.png') });
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('chat.desktop.permissions.v1')!)
    )
  ).toMatchObject({
    microphone: 'denied',
    camera: 'granted',
    geolocation: 'denied'
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).desktopShellFixture?.ready)
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'NotAllowedError'
  );
  await expect(
    page.getByTestId('DesktopMediaPermissionDialog')
  ).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Разрешения устройств', exact: true })
    .click();
  await expect(
    page.getByRole('switch', { name: 'Камера', exact: true })
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('switch', { name: 'Микрофон', exact: true }).click();
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
});

test('отзыв микрофона останавливает текущий трек и не отключает камеру', async ({
  page
}) => {
  await openShell(page);
  await page
    .getByRole('button', { name: 'Разрешения устройств', exact: true })
    .click();
  await page.getByRole('switch', { name: 'Микрофон', exact: true }).click();
  await page.getByRole('switch', { name: 'Камера', exact: true }).click();
  await page.evaluate(async () => {
    const win = window as any;
    win.shellUseTrack = true;
    win.heldMicrophone = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
  });
  await page.getByRole('switch', { name: 'Микрофон', exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as any).heldMicrophone.getAudioTracks()[0].readyState
    )
  ).toBe('ended');
  await expect(
    page.getByRole('switch', { name: 'Камера', exact: true })
  ).toHaveAttribute('aria-checked', 'true');
  await page
    .getByRole('switch', { name: 'Демонстрация экрана', exact: true })
    .click();
  await page
    .getByRole('switch', { name: 'Демонстрация экрана', exact: true })
    .click();
  const denied = await page.evaluate(async () => {
    const { prepareDesktopScreenCapture } = await import(
      '/src/services/desktop-screen-capture.ts'
    );
    try {
      await prepareDesktopScreenCapture();
      return false;
    } catch (error) {
      return (error as Error).name === 'NotAllowedError';
    }
  });
  expect(denied).toBe(true);
});

test('«Не сейчас» не сохраняет разрешение на устройство', async ({ page }) => {
  await openShell(page);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Не сейчас' })
    .click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => !!(window as any).desktopShellFixture?.ready)
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Разрешить доступ к микрофону?'
  );
});

test('Светлая и тёмная темы: собственная шапка и запрос устройств', async ({
  page
}, testInfo) => {
  for (const theme of ['light', 'dark']) {
    await openShell(page, { tauri: true, decorated: false, theme });
    await page.getByRole('button', { name: 'Проверить видеозвонок' }).click();
    await expect(page.getByRole('dialog')).toContainText('камере и микрофону');
    const image = testInfo.outputPath(`desktop-shell-${theme}.png`);
    await page.screenshot({ path: image });
    await testInfo.attach(`desktop-shell-${theme}`, {
      path: image,
      contentType: 'image/png'
    });
    const dialog = page.getByRole('dialog');
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(420);
    const colors = await dialog.evaluate(element => {
      const style = getComputedStyle(element);
      return { text: style.color, background: style.backgroundColor };
    });
    expect(colors.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(colors.text).not.toBe(colors.background);
    await page.unrouteAll();
  }
});

test('Браузер и старая Tauri с рамкой сохраняют прежнее оформление', async ({
  page
}) => {
  await openShell(page, { tauri: false, decorated: true, theme: 'light' });
  await expect(page.getByTestId('DesktopTitleBar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Проверить микрофон' }).click();
  await expect(page.getByTestId('DesktopShellCaptureResult')).toHaveText(
    'Доступ разрешён'
  );
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).shellCalls.length)).toBe(0);
  await openShell(page, { tauri: true, decorated: true, theme: 'light' });
  await expect(page.getByTestId('DesktopTitleBar')).toHaveCount(0);
  expect((await page.getByTestId('DesktopShellContent').boundingBox())?.y).toBe(
    0
  );
});
