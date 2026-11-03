import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop');
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  await page.addLocatorHandler(
    page.locator('dialog.ios-push-modal[open]'),
    async dialog => {
      await dialog
        .getByRole('button', { name: 'Настроить позже', exact: true })
        .click();
    }
  );
  await page.route('**/e2e/ios-api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (/\/messages\/topic\/[^/]+(?:\/pinned)?$/.test(path))
      return route.fulfill({ json: [] });
    if (path.endsWith('/groups/fixture-group-id'))
      return route.fulfill({
        json: {
          group: { id: 'fixture-group-id', title: 'Проверка поиска' },
          members: { data: [] }
        }
      });
    if (path.endsWith('/topics/mobile-search-fixture'))
      return route.fulfill({
        json: {
          id: 'mobile-search-fixture',
          type: 'GROUP',
          name: 'Проверка поиска',
          group: { id: 'fixture-group-id', title: 'Проверка поиска' },
          isAdmin: true,
          members: [],
          info: {}
        }
      });
    if (path.endsWith('avatar.svg'))
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="coral"/></svg>'
      });
    if (path.endsWith('/packs'))
      return route.fulfill({
        json: { packs: [{ id: 'sep', label: 'SEP', previewPath: '' }] }
      });
    return route.fulfill({
      json: { data: [], items: [], folders: [], nextCursor: null }
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      configurable: true
    });
    const viewport = window.visualViewport!;
    let height = 844;
    let top = 0;
    let scale = 1;
    Object.defineProperties(viewport, {
      height: { get: () => height },
      offsetTop: { get: () => top },
      scale: { get: () => scale }
    });
    (window as any).setIosViewport = (
      nextHeight: number,
      nextTop = 0,
      nextScale = 1
    ) => {
      height = nextHeight;
      top = nextTop;
      scale = nextScale;
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    };
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) || []).toEqual([]);
});

for (const metadata of ['', '&missing-call-meta']) {
  test(`замечания 29 октября: меню звонилки открывается касанием ${metadata}`, async ({
    page
  }, testInfo) => {
    const rooms: (string | null)[] = [];
    await page.route(/\/calls\/summaries\/latest\?/, route => {
      rooms.push(new URL(route.request().url()).searchParams.get('roomId'));
      return route.fulfill({
        json: {
          id: 'fixture-summary',
          roomId: 'fixture-room',
          topicId: 'source-topic',
          recorderUserId: 'mobile-search-user',
          status: 'READY',
          hasTranscript: true
        }
      });
    });
    await page.goto(
      `/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&call-topic&message-count=40${metadata}`
    );
    const toggle = page.locator('.chat__input-prompt-toggle');
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const action = page.getByRole('button', {
      name: 'Сделать краткое содержание'
    });
    await expect(action).toBeInViewport();
    await expect(action).toBeEnabled();
    expect(rooms).toContain('fixture-room');
    await page.screenshot({ path: testInfo.outputPath('call-actions.png') });
    await toggle.tap();
    await expect(action).toHaveCount(0);
  });
}

test('замечания 29 октября: обои ИИ остаются видимыми на iPhone', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=ai&no-pinned&wallpaper');
  await expect(page.locator('.ai-assistant')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.chat-container')).toHaveClass(
    /chat-container--wallpaper/
  );
  await expect(page.locator('.chat-container')).not.toHaveCSS(
    'background-image',
    'none'
  );
  await expect(page.locator('.ai-assistant')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)'
  );
  await page.screenshot({ path: testInfo.outputPath('ai-wallpaper.png') });
});

test('предпросмотр обоев: сообщения помещаются, под кнопками нет лишнего отступа', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=profile');
  await page.getByText('Обои для чатов', { exact: true }).tap();
  await page.locator('.menu-profile__wallpaper-tile').nth(1).tap();
  const surface = page.locator(
    '.menu-profile__wallpaper-preview-mobile .menu-profile__wallpaper-preview-surface'
  );
  await expect(surface).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
  });
  for (const height of [844, 667]) {
    await page.setViewportSize({ width: 390, height });
    await page.evaluate(
      height => (window as any).setIosViewport(height, 0),
      height
    );
    const apply = page.locator('.menu-profile__wallpaper-preview-apply');
    await expect
      .poll(async () => {
        const button = (await apply.boundingBox())!;
        return Math.round(height - button.y - button.height);
      })
      .toBe(34 + 12);
    const bounds = (await surface.boundingBox())!;
    const message = surface.locator('.message').last();
    const bubble = (await message.boundingBox())!;
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(
      bounds.y + bounds.height - 10
    );
    await expect(message).toContainText('Спасибо');
  }
  await page.screenshot({ path: testInfo.outputPath('wallpaper-preview.png') });
});

test('PWA: информация группы и кнопка назад остаются ниже системной строки', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell&beta');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
  });
  await editor.fill('Черновик');
  await page.evaluate(() => (window as any).setIosViewport(500, 180));
  await expect
    .poll(
      async () => (await page.locator('.chat__header-wrapper').boundingBox())!.y
    )
    .toBe(180 + 47 + 18);
  await page.locator('.chat__header-profile').tap();
  const dialog = page.getByRole('dialog');
  const back = dialog.getByRole('button', { name: 'Назад', exact: true });
  await expect(back).toBeVisible();
  await expect(
    dialog.getByRole('textbox', { name: 'Название группы', exact: true })
  ).toBeVisible();
  for (const [height, top] of [
    [500, 180],
    [844, 0]
  ]) {
    await page.evaluate(
      ([height, top]) => (window as any).setIosViewport(height, top),
      [height, top]
    );
    await expect
      .poll(async () => Math.round((await back.boundingBox())!.y))
      .toBeGreaterThanOrEqual(top + 47);
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return Math.round(box.y + box.height);
      })
      .toBe(top + height);
  }
  await page.screenshot({
    path: testInfo.outputPath('group-info-safe-area.png')
  });
  await back.tap();
  await expect(dialog).toBeHidden();
  await expect(editor).toHaveText('Черновик');
});

test('PWA: счётчик поиска, стрелки и закрытие занимают отдельные области', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&theme=dark');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.getByTestId('Fixture-Header-PopoverIcon').tap();
  await page.getByRole('button', { name: 'Поиск в чате', exact: true }).tap();
  const search = page
    .getByTestId('Fixture-Header-MobileSearchInput')
    .locator('input');
  await search.fill('Сообщение');
  const count = page.getByTestId('Fixture-Header-MobileSearchCount');
  await expect(count).toHaveText('1 из 40');
  for (const height of [500, 844]) {
    await page.evaluate(
      height => (window as any).setIosViewport(height),
      height
    );
    const controls = page.locator(
      '.chat__header-mobile-search-controls-content'
    );
    await expect
      .poll(async () => Math.round((await controls.boundingBox())!.width))
      .toBe(370);
    const counterBox = (await count.boundingBox())!;
    const navBox = (await page
      .locator('.chat__header-mobile-search-controls__nav')
      .boundingBox())!;
    const closeBox = (await page
      .getByTestId('Fixture-Header-MobileSearchBottomClose')
      .boundingBox())!;
    expect(counterBox.x + counterBox.width).toBeLessThanOrEqual(navBox.x);
    expect(navBox.x + navBox.width).toBeLessThanOrEqual(closeBox.x);
    expect(
      (await controls.boundingBox())!.y + (await controls.boundingBox())!.height
    ).toBeLessThanOrEqual(height);
  }
  await page.getByTestId('Fixture-Header-MobileSearchPrev').tap();
  await expect(count).toHaveText('2 из 40');
  await page.screenshot({ path: testInfo.outputPath('search-safe-area.png') });
});

test('PWA: уведомление появляется ниже системной строки и сдвига visualViewport', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&theme=dark');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    (window as any).setIosViewport(500, 180);
    const path = '/src/composables/useNotifications.ts';
    const { showErrorNotification } = await import(/* @vite-ignore */ path);
    showErrorNotification('Обновите историю звонков и попробуйте снова.');
  });
  const notification = page.getByRole('alert');
  await expect(notification).toBeVisible();
  await expect
    .poll(async () => Math.round((await notification.boundingBox())!.y))
    .toBe(180 + 47 + 16);
  await page.screenshot({
    path: testInfo.outputPath('notification-safe-area.png')
  });
});

test('PWA: верхние кнопки звонка остаются ниже системной строки', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.evaluate(async () => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
    const path = '/src/services/useCallState.ts';
    const call = await import(/* @vite-ignore */ path);
    call.user.value = { id: 'fixture-call-peer', initials: 'Проверка звонка' };
    call.open.value = true;
    call.isModalVisible.value = true;
  });
  const minimize = page.getByRole('button', {
    name: 'Свернуть звонок',
    exact: true
  });
  await expect(minimize).toBeVisible();
  await expect
    .poll(async () => Math.round((await minimize.boundingBox())!.y))
    .toBeGreaterThanOrEqual(47);
  const controls = page.locator(
    '.call-modal__control-button-wrapper--call-controls'
  );
  await expect(controls).toBeVisible();
  const box = (await controls.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844 - 34);
  await page.screenshot({ path: testInfo.outputPath('call-safe-area.png') });
});

for (const kind of ['group', 'ai']) {
  test(`${kind}: заголовок, история и редактор остаются в видимой области iPhone`, async ({
    page
  }, testInfo) => {
    await page.goto(`/e2e/fixtures/ios-pwa.html?kind=${kind}&no-pinned&beta`);
    const header = page.locator('.chat__header-wrapper');
    const composer = page.locator('.chat__input');
    const editor = composer.locator('.ProseMirror');
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ios-safe-top', '47px');
      document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
    });
    const checkGeometry = async (height: number, top: number) => {
      await expect
        .poll(async () => (await header.boundingBox())!.y)
        .toBeCloseTo(top + 47 + 18, 0);
      const head = (await header.boundingBox())!;
      const input = (await composer.boundingBox())!;
      const history = (await page
        .locator(
          kind === 'ai' ? '.ai-assistant__scroll' : '.chat__message-wrapper'
        )
        .boundingBox())!;
      expect(input.y + input.height).toBeCloseTo(top + height, 0);
      expect(history.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
      expect(history.height).toBeGreaterThan(100);
      expect(history.y + history.height).toBeLessThanOrEqual(input.y + 1);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    };
    await checkGeometry(844, 0);
    await expect(editor).toHaveCSS('font-size', '16px');
    await editor.fill('Черновик на iPhone');
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.evaluate(() => (window as any).setIosViewport(500, 180));
      await checkGeometry(500, 180);
      await page.evaluate(() => (window as any).setIosViewport(844));
      await checkGeometry(844, 0);
    }
    await expect(editor).toHaveText('Черновик на iPhone');
    await page.evaluate(() => window.scrollTo(0, 250));
    await checkGeometry(844, 0);
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-iphone-pwa.png`)
    });
  });
}

test('вложения: подключённый input открывает фото, видео и файлы из пользовательского клика', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=ai&no-pinned');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await editor.fill('Черновик с вложением');
  await page.evaluate(() => (window as any).setIosViewport(500, 180));
  for (const label of ['Фото или видео', 'Файл']) {
    const clip = page.locator('.chat__input .attach-file-button:visible');
    await clip.tap();
    const menu = page.locator(
      '.attach-file-popover .popover-yui-kit__content:visible'
    );
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('position', 'absolute');
    const menuBox = (await menu.boundingBox())!;
    const clipBox = (await clip.boundingBox())!;
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(clipBox.y);
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    const selection = page.waitForEvent('filechooser');
    await menu.getByText(label, { exact: true }).tap();
    const chooser = await selection;
    expect(
      await chooser.element().evaluate(element => element.isConnected)
    ).toBe(true);
    expect(await chooser.element().getAttribute('accept')).toBe(
      label === 'Фото или видео' ? 'image/*,video/*' : null
    );
    expect(chooser.isMultiple()).toBe(true);
    await chooser.setFiles([]);
    await expect(menu).toHaveCount(0);
  }
  await expect(editor).toHaveText('Черновик с вложением');
  await page.evaluate(() => (window as any).setIosViewport(844));
  await page.locator('.chat__input .attach-file-button:visible').tap();
  const selection = page.waitForEvent('filechooser');
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Фото или видео', { exact: true })
    .tap();
  await (
    await selection
  ).setFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
      'base64'
    )
  });
  await expect(
    page
      .getByRole('dialog')
      .getByRole('img', { name: 'photo.png', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('dialog').locator('.ProseMirror')).toHaveText(
    'Черновик с вложением'
  );
});

test('PWA без клавиатуры заполняет экран, даже если visualViewport исключает системный низ', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&beta');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    (window as any).setIosViewport(810);
  });
  await expect
    .poll(async () => {
      const box = (await page.locator('.chat__input').boundingBox())!;
      return Math.round(box.y + box.height);
    })
    .toBe(844);
  await expect(page.locator('html')).not.toHaveClass(/chat-ios-keyboard-open/);
});

for (const theme of ['light', 'dark']) {
  test(`редактор ${theme}: кнопки вложения и эмодзи используют нейтральный цвет`, async ({
    page
  }) => {
    await page.goto(
      `/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&theme=${theme}`
    );
    const editor = page.locator('.chat__input .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 60_000 });
    for (const selector of ['.attach-file-button', '.smile-button']) {
      const button = page.locator(`.chat__input ${selector}:visible`);
      await expect
        .poll(() =>
          button.evaluate(el => ({
            actual: getComputedStyle(el).color,
            expected: getComputedStyle(el)
              .getPropertyValue('--text-secondary')
              .trim()
          }))
        )
        .toEqual(
          theme === 'dark'
            ? { actual: 'rgb(142, 152, 183)', expected: '#8e98b7' }
            : { actual: 'rgb(117, 125, 138)', expected: '#757d8a' }
        );
    }
  });
}

for (const [name, mimeType, mediaType, buffer] of [
  [
    'IMG_1234.png',
    'image/png',
    'IMAGE',
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
      'base64'
    )
  ],
  [
    'IMG_1234.MOV',
    'video/quicktime',
    'VIDEO',
    // Отправка исходника работает и без декодируемой локальной обложки.
    Buffer.from([0, 0, 0, 20, 102, 116, 121, 112, 113, 116, 32, 32, 0, 0, 0, 0])
  ]
] as const) {
  for (const completion of [
    'events',
    'resume',
    'delayed-resume',
    'empty-return',
    'unreadable-return',
    'zero-size-return'
  ]) {
    test(`камера PWA: ${name}, ${completion}, копируется до загрузки и отправляется один раз`, async ({
      page
    }) => {
      test.setTimeout(60_000);
      let uploads = 0;
      await page.route('**/e2e/ios-api/media/upload-target', route =>
        route.fulfill({
          json: {
            objectName: name,
            uploadUrl: 'http://localhost:5173/e2e/ios-api/camera-storage'
          }
        })
      );
      await page.route('**/e2e/ios-api/camera-storage', route => {
        uploads++;
        return route.fulfill({ status: 200, body: '' });
      });
      await page.route('**/e2e/ios-api/media/upload', route =>
        route.fulfill({ json: { objectName: name, thumbnailObjectName: null } })
      );
      await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
      await expect(page.locator('.chat__input--booting')).toHaveCount(0);
      await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
        timeout: 60_000
      });
      await page.evaluate(async completion => {
        const path = '/e2e/fixtures/network-harness.ts';
        (await import(/* @vite-ignore */ path)).controlConnection();
        const state = {
          copiedBytes: 0,
          sent: [] as any[],
          input: null as any,
          readyAt: 0,
          uploadReads: [] as Promise<number[]>[]
        };
        (window as any).cameraRegression = state;
        (window as any).iosPwaFixture.sdk.sendWebSocketEvent = (
          _type: string,
          payload: any
        ) => {
          if (payload.medias) state.sent.push(payload);
          return true;
        };
        const send = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (body) {
          if (body instanceof Blob) {
            state.uploadReads.push(
              body.arrayBuffer().then(bytes => [...new Uint8Array(bytes)])
            );
          }
          return send.call(this, body);
        };
        const slice = File.prototype.slice;
        File.prototype.slice = function (...args) {
          const part = slice.apply(this, args);
          const read = part.arrayBuffer.bind(part);
          part.arrayBuffer = async () => {
            if (
              completion === 'unreadable-return' &&
              Date.now() < state.readyAt
            )
              throw new DOMException(
                'Камера сохраняет снимок',
                'NotReadableError'
              );
            const bytes = await read();
            if (state.input?.isConnected) state.copiedBytes += bytes.byteLength;
            return bytes;
          };
          return part;
        };
        const captureSelection = (event: Event) => {
          const input = event.target as HTMLInputElement;
          if (input.type !== 'file') return;
          if (
            ![
              'events',
              'empty-return',
              'unreadable-return',
              'zero-size-return'
            ].includes(completion)
          )
            event.stopImmediatePropagation();
          if (state.input === input) return;
          state.input = input;
          state.readyAt = Date.now() + 500;
          const selected = input.files;
          if (completion === 'zero-size-return') {
            for (const file of Array.from(selected || [])) {
              const size = file.size;
              Object.defineProperty(file, 'size', {
                get: () => (Date.now() < state.readyAt ? 0 : size)
              });
            }
          }
          if (
            completion === 'delayed-resume' ||
            completion === 'empty-return'
          ) {
            Object.defineProperty(input, 'files', {
              configurable: true,
              get: () => null
            });
            if (completion === 'empty-return')
              input.dispatchEvent(new Event('cancel'));
            setTimeout(() => {
              Object.defineProperty(input, 'files', {
                configurable: true,
                get: () => selected
              });
            }, 500);
          }
        };
        document.addEventListener('input', captureSelection, true);
        document.addEventListener('change', captureSelection, true);
      }, completion);
      await page.locator('.chat__input .attach-file-button:visible').tap();
      const selection = page.waitForEvent('filechooser');
      await page
        .locator('.attach-file-popover .popover-yui-kit__content:visible')
        .getByText('Фото или видео', { exact: true })
        .tap();
      await (await selection).setFiles({ name, mimeType, buffer });
      if (completion !== 'events') {
        await page.evaluate(() => {
          window.dispatchEvent(new Event('focus'));
          document.dispatchEvent(new Event('visibilitychange'));
        });
      }
      await expect
        .poll(
          () =>
            page.evaluate(() => (window as any).cameraRegression.sent.length),
          { timeout: 25_000 }
        )
        .toBe(1);
      expect(uploads).toBe(1);
      expect(
        await page.evaluate(async () => {
          const state = (window as any).cameraRegression;
          return {
            copiedBytes: state.copiedBytes,
            inputConnected: state.input.isConnected,
            uploadedBytes: await Promise.all(state.uploadReads),
            media: state.sent[0].medias.map((media: any) => ({
              path: media.path,
              type: media.type
            }))
          };
        })
      ).toEqual({
        copiedBytes: buffer.length,
        inputConnected: false,
        uploadedBytes: [[...buffer]],
        media: [{ path: name, type: mediaType }]
      });
    });
  }
}

test('выбор файлов PWA сохраняет проверку лимита вложений ИИ', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=ai&no-pinned');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await editor.fill('Черновик с вложениями');
  await page.locator('.chat__input .attach-file-button:visible').tap();
  const selection = page.waitForEvent('filechooser');
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Файл', { exact: true })
    .tap();
  await (
    await selection
  ).setFiles(
    Array.from({ length: 11 }, (_, index) => ({
      name: `file-${index}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('test')
    }))
  );
  await expect(page.getByRole('alert')).toContainText('не более 10 файлов');
  await expect(page.locator('.attach-modal')).toHaveCount(0);
  await expect(editor).toHaveText('Черновик с вложениями');
});

test('список чатов PWA: удержание открывает меню и не открывает чат при отпускании', async ({
  page,
  browserName
}) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=menu');
  const row = page.locator(
    '[data-topic-id="iphone-chat-0"] .contact-list__item'
  );
  await expect(row).toBeVisible({ timeout: 60_000 });
  const url = page.url();
  const box = (await row.boundingBox())!;
  const point = {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: box.x + 150,
    clientY: box.y + 20
  };
  const touch =
    browserName === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.clientX, y: point.clientY }]
    });
  } else await row.dispatchEvent('pointerdown', point);
  const menu = page.locator('.topic-folder-context-menu:visible');
  await expect(menu).toBeVisible();
  if (touch) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await touch.detach();
  } else {
    await row.dispatchEvent('pointerup', point);
    await row.dispatchEvent('click', { ...point, detail: 1 });
  }
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Закрепить', { exact: true })).toBeVisible();
  await expect(
    menu.getByText('Отметить прочитанным', { exact: true })
  ).toBeVisible();
  await expect(row.locator('.contact-list__title').first()).toHaveCSS(
    '-webkit-user-select',
    'none'
  );
  await expect(page).toHaveURL(url);
  await page.touchscreen.tap(10, 10);
  await expect(menu).toHaveCount(0);
  for (const cancel of ['pointermove', 'pointercancel', 'scroll']) {
    await row.dispatchEvent('pointerdown', point);
    if (cancel === 'scroll') {
      await row.evaluate(element =>
        element.closest('ul')!.dispatchEvent(new Event('scroll'))
      );
    } else {
      await row.dispatchEvent(cancel, {
        ...point,
        clientY: point.clientY + 30
      });
    }
    await row.dispatchEvent('pointerup', point);
    await page.waitForTimeout(500);
    await expect(menu).toHaveCount(0);
  }
  await row.tap();
  await expect(page).toHaveURL(/\/group\/iphone-chat-0/);
});

test('настройки фона не исчезают после раскрытия и смены раздела', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=profile');
  const profile = page.locator('.mobile-list-container__section--profile');
  const background = profile.locator('[data-testid$="CallBackgroundTrigger"]');
  await expect(background).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.mobile-list-container__section-track')).toHaveCSS(
    'transform-style',
    'flat'
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await background.tap();
    await expect(profile.getByText('Размытие', { exact: true })).toBeVisible();
    await background.tap();
    await expect(profile.getByText('Размытие', { exact: true })).toBeHidden();
    await page.locator('[data-testid$="MenuBottomNav-Chats"]').tap();
    await page.locator('[data-testid$="MenuBottomNav-Profile"]').tap();
    await expect(
      profile.getByText('Тёмная тема', { exact: true })
    ).toBeVisible();
    await expect(
      profile.getByText('Отображение стикеров', { exact: true })
    ).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath('profile-iphone-pwa.png'),
    animations: 'disabled',
    timeout: 10_000
  });
});

test('эмодзи помещаются на узком iPhone, поиск не увеличивает страницу', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.locator('.chat__input .smile-button:visible').tap();
  const picker = page.locator(
    '.chat__input .emoji-picker--open .v3-emoji-picker'
  );
  await expect(picker).toBeVisible();
  const box = (await picker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  const search = picker.locator('.v3-search input');
  await expect(search).toHaveCSS('font-size', '16px');
  await search.tap();
  await search.fill('smile');
  for (const [height, top] of [
    [500, 0],
    [500, 180],
    [844, 0]
  ]) {
    await page.evaluate(
      ([nextHeight, nextTop]) =>
        (window as any).setIosViewport(nextHeight, nextTop),
      [height, top]
    );
    await expect(page.locator('.chat__header-wrapper')).toBeInViewport();
    await expect(search).toBeFocused();
    await expect
      .poll(async () => {
        const pickerBox = (await picker.boundingBox())!;
        const inputBox = (await page.locator('.chat__input').boundingBox())!;
        return {
          gap: Math.round(inputBox.y - pickerBox.y - pickerBox.height),
          visibleTop: pickerBox.y >= top + 8
        };
      })
      .toEqual({ gap: 5, visibleTop: true });
    await expect(picker.locator('.v3-body')).toBeInViewport();
    await expect(
      picker.getByRole('button', { name: 'Стикеры', exact: true })
    ).toBeInViewport();
  }
  await page.screenshot({ path: testInfo.outputPath('emoji-iphone-pwa.png') });
  const emoji = picker.locator('.v3-emojis button:visible').first();
  await expect(emoji.locator('span')).toHaveCSS(
    'font-family',
    /Apple Color Emoji/
  );
  const selectedEmoji = (await emoji.innerText()).trim();
  await emoji.tap();
  await expect(page.locator('.chat__input .ProseMirror')).toContainText(
    selectedEmoji
  );
});

for (const standalone of [true, false]) {
  test(`${standalone ? 'PWA' : 'Safari'}: эмодзи в черновике используют системный шрифт и сохраняются при отправке`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.addLocatorHandler(
      page.getByRole('button', { name: 'Остаться в браузере', exact: true }),
      button => button.tap()
    );
    const fontRequests: string[] = [];
    await page.route('**/emoji/noto/fonts/**', route => {
      fontRequests.push(route.request().url());
      return route.abort();
    });
    await page.addInitScript(standalone => {
      Object.defineProperty(navigator, 'standalone', {
        value: standalone,
        configurable: true
      });
    }, standalone);
    await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
    const editor = page.locator('.chat__input .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await page.evaluate(async () => {
      const fontPath = '/src/composables/useEmojiStyle.ts';
      (await import(/* @vite-ignore */ fontPath)).installNotoEmojiFontFaces();
      const connectionPath = '/e2e/fixtures/network-harness.ts';
      (await import(/* @vite-ignore */ connectionPath)).controlConnection();
      const fixture = (window as any).iosPwaFixture;
      fixture.sent = [];
      fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
        if (type === 'sendMessage') fixture.sent.push(payload);
        return true;
      };
    });
    const typed = 'Привет 😁 😂 💫 👩🏽‍💻 👨‍👩‍👧‍👦 🇦🇲 ❤️';
    await editor.tap();
    await page.keyboard.insertText(typed);
    await expect(editor).toHaveText(typed);
    const font = await editor
      .locator('p')
      .evaluate(el => getComputedStyle(el).fontFamily);
    expect(font).toMatch(/Inter Variable.*Apple Color Emoji/);
    expect(font).not.toMatch(/Noto.*Web/);
    await page.locator('.chat__input .smile-button:visible').tap();
    const picker = page.locator(
      '.chat__input .emoji-picker--open .v3-emoji-picker'
    );
    const emoji = picker.locator('.v3-emojis button:visible').first();
    await expect(emoji).toBeVisible();
    await expect(emoji.locator('span')).toHaveCSS(
      'font-family',
      /Apple Color Emoji/
    );
    const selected = (await emoji.innerText()).trim();
    await emoji.tap();
    await expect(editor).toHaveText(typed + selected);
    await expect(editor).toBeFocused();
    await page.keyboard.insertText('!');
    await expect(editor).toHaveText(typed + selected + '!');
    await page.evaluate(() => document.fonts.ready);
    expect(fontRequests).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('emoji-draft-iphone.png')
    });
    await page.locator('.chat__input .toolbar-button.right:visible').tap();
    await expect
      .poll(() => page.evaluate(() => (window as any).iosPwaFixture.sent))
      .toEqual([
        expect.objectContaining({ text: `<p>${typed}${selected}!</p>` })
      ]);
    await expect(editor).toHaveText('');
  });
}

test('обычная вкладка Safari не получает фиксацию экрана PWA', async ({
  page
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'standalone', {
      value: false,
      configurable: true
    })
  );
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=ai');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await expect(page.locator('html')).not.toHaveClass(/chat-ios-pwa/);
});

test('PWA: сдвиг документа с клавиатурой сохраняет доступ к редактору', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    (window as any).setIosViewport(500, 180);
    document.documentElement.style.overflow = 'auto';
    document.body.style.height = '1500px';
    window.scrollTo(0, 80);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(80);
  await expect
    .poll(
      async () => (await page.locator('.chat__header-wrapper').boundingBox())!.y
    )
    .toBe(180);
  await editor.tap();
  await expect(editor).toBeFocused();
  await editor.pressSequentially('После сдвига');
  await expect(editor).toHaveText('После сдвига');
  await page.evaluate(() => (window as any).setIosViewport(844));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(
      async () => (await page.locator('.chat__header-wrapper').boundingBox())!.y
    )
    .toBe(0);
});

test('PWA: инпут, вложения, стикеры и хэдер работают после переходов и закрытия профиля', async ({
  page
}) => {
  // Два полных цикла touch-навигации в WebKit с трассировкой дольше 30 секунд.
  test.setTimeout(90_000);
  await page.addInitScript(() => (window as any).setIosViewport(844, 100));
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell&beta');
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible({ timeout: 60_000 });
  await expect(editor).not.toHaveAttribute('inputmode', 'none');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ios-safe-top', '47px');
    document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    // Кнопки должны работать сразу, до первого фокуса/ввода в редактор.
    await page.locator('.chat__input .attach-file-button:visible').tap();
    await expect(
      page.locator('.attach-file-popover .popover-yui-kit__content:visible')
    ).toBeVisible();
    await page.locator('.chat__input .attach-file-button:visible').tap();
    await page.locator('.chat__input .smile-button:visible').tap();
    await expect(
      page.locator('.chat__input .emoji-picker--open:visible')
    ).toBeVisible();
    await expect(
      page.locator('.chat__input .emoji-picker--open:visible .v3-emoji-picker')
    ).toBeVisible();
    await page
      .getByTestId('StickerPickerMode')
      .getByRole('button', { name: 'Стикеры', exact: true })
      .tap();
    await expect(
      page.getByRole('region', { name: 'Каталог стикеров' })
    ).toBeVisible();
    await page.locator('.chat__input .smile-button:visible').tap();
    await editor.tap();
    await expect(editor).toBeFocused();
    await editor.pressSequentially(`Текст ${attempt}`);
    await expect(editor).toContainText(`Текст ${attempt}`);
    await page.evaluate(() => (window as any).setIosViewport(500, 180));
    await page.locator('.chat__input .smile-button:visible').tap();
    await expect(
      page.locator('.chat__input .emoji-picker--open:visible')
    ).toBeVisible();
    await page.locator('.chat__input .smile-button:visible').tap();
    await page.locator('.chat__input .attach-file-button:visible').tap();
    const option = page
      .locator('.attach-file-popover .popover-yui-kit__content:visible')
      .getByText('Файл', { exact: true });
    const selection = page.waitForEvent('filechooser');
    await option.tap();
    await (await selection).setFiles([]);
    await page.evaluate(() => (window as any).setIosViewport(844, 100));
    await page.locator('.chat__header-profile').tap();
    const profile = page.getByRole('dialog');
    await expect(
      profile.getByText('Информация о группе', { exact: true })
    ).toBeVisible();
    await profile.getByRole('button', { name: 'Назад', exact: true }).tap();
    await expect(profile).toBeHidden();
    await page.locator('.chat__header-back').tap();
    const row = page.locator(
      '[data-topic-id="mobile-search-fixture"] .contact-list__item'
    );
    await expect(row).toBeVisible();
    await row.tap();
    await expect(editor).toBeVisible();
  }
});

test('PWA: реакция из долгого нажатия дожидается восстановления соединения', async ({
  page
}) => {
  // Полная оболочка обновляет историю через API после загрузки локальных данных.
  await page.route(
    '**/e2e/ios-api/messages/topic/mobile-search-fixture*',
    route =>
      route.fulfill({
        json: [
          {
            id: 'reaction-message',
            topicId: 'mobile-search-fixture',
            senderUserId: 'mobile-search-user',
            senderUser: { id: 'mobile-search-user', initials: 'Тест' },
            text: 'Проверка реакции после восстановления связи',
            createdAt: new Date(2026, 9, 5, 10).toISOString(),
            media: [],
            isReadByMe: true
          }
        ]
      })
  );
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await expect(
    page.locator('.message[data-message-id="reaction-message"]')
  ).toBeVisible();
  await page.evaluate(() => {
    const fixture = (window as any).iosPwaFixture;
    fixture.sent = [];
    fixture.connected = false;
    fixture.connections = 0;
    fixture.sdk.connect = async () => {
      fixture.connections++;
      fixture.connected = true;
    };
    fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
      if (!fixture.connected) return false;
      fixture.sent.push({ type, payload });
      return true;
    };
  });
  const message = page.locator('.message:visible').last();
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeInViewport();
  const point = await message.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: bounds.x + 40,
      clientY: bounds.y + 12
    };
  });
  const text = message.locator('.message-content--text');
  await text.dispatchEvent('pointerdown', point);
  const menu = page.locator('.message-context-menu:visible');
  await expect(menu).toBeVisible();
  await text.dispatchEvent('pointerup', point);
  await text.dispatchEvent('click', { ...point, detail: 1 });
  await menu.locator('.select-reactions-item').first().tap();
  await expect(menu).toHaveCount(0);
  const result = await page.evaluate(() => {
    const { sent, connections } = (window as any).iosPwaFixture;
    return { sent, connections };
  });
  expect(result.connections).toBe(1);
  expect(result.sent).toHaveLength(1);
  expect(result.sent[0].payload.messageId).toBe(
    await message.getAttribute('data-message-id')
  );
  expect(result.sent[0].payload.emoji).toBeTruthy();
});

for (const standalone of [true, false]) {
  const mode = standalone ? 'PWA' : 'Safari';
  test(`${mode}: точные нажатия в длинном списке, стабильное меню и настройки профиля`, async ({
    page
  }, testInfo) => {
    await page.addInitScript(standalone => {
      Object.defineProperty(navigator, 'standalone', {
        value: standalone,
        configurable: true
      });
      // Safari может загрузить файл, но отказать в записи кеша или зависнуть на decode.
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('Нет места', 'QuotaExceededError');
      };
      HTMLImageElement.prototype.decode = () => new Promise(() => {});
    }, standalone);
    await page.goto('/e2e/fixtures/ios-pwa.html?kind=menu');
    const nav = page.locator('.mobile-list-container > .menu-bottom-nav');
    await expect(nav).toBeVisible({ timeout: 60_000 });
    await expect(nav).toHaveCSS('backdrop-filter', 'none');
    await expect(nav).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (standalone)
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--ios-safe-top', '47px');
        document.documentElement.style.setProperty('--ios-safe-bottom', '34px');
      });
    const navBox = (await nav.boundingBox())!;
    expect(navBox.y + navBox.height).toBeCloseTo(844 - 20, 0);
    const avatar = nav.locator('.cached-avatar');
    await expect(avatar).toHaveClass(/cached-avatar--image-ready/);
    expect(
      await avatar
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    ).toBe(32);
    const badge = nav.locator('.menu-bottom-nav__unread-count');
    await expect(badge).toBeVisible();
    const badgeBox = (await badge.boundingBox())!;
    expect(badgeBox.height).toBe(18);
    expect(badgeBox.width).toBe(18);
    const chats = page.locator('.mobile-list-container__section--chats');
    for (const index of [3, 17, 30]) {
      const row = chats.locator(
        `[data-topic-id="iphone-chat-${index}"] .contact-list__item`
      );
      await row.scrollIntoViewIfNeeded();
      await expect(row.locator('.cached-avatar')).toHaveClass(
        /cached-avatar--image-ready/
      );
      await row.tap();
      await expect(page).toHaveURL(
        new RegExp(`/group/iphone-chat-${index}(?:\\?|$)`)
      );
      await page.locator('[data-testid$="MenuBottomNav-Profile"]').tap();
      const profile = page.locator('.mobile-list-container__section--profile');
      await expect(profile).toHaveAttribute('aria-hidden', 'false');
      const stickers = profile.getByRole('button', {
        name: 'Отображение стикеров',
        exact: true
      });
      expect(await stickers.evaluate(el => getComputedStyle(el).color)).toBe(
        await profile.evaluate(el => getComputedStyle(el).color)
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        await stickers.tap();
        await expect(
          profile.getByRole('checkbox', { name: 'SEP', exact: true })
        ).toBeVisible();
        await stickers.tap();
        await expect(
          profile.getByText('Тёмная тема', { exact: true })
        ).toBeVisible();
      }
      expect((await nav.boundingBox())!.y).toBeCloseTo(navBox.y, 0);
      await page.locator('[data-testid$="MenuBottomNav-Chats"]').tap();
      await expect(profile).toBeHidden();
      await expect(
        profile.getByRole('button', { name: 'Выйти', exact: true })
      ).toBeHidden();
    }
    await page.screenshot({ path: testInfo.outputPath(`menu-${mode}.png`) });
  });

  test(`${mode}: долгое нажатие открывает действия сообщения, прокрутка отменяет зажатие`, async ({
    page,
    browserName
  }) => {
    await page.addInitScript(
      standalone =>
        Object.defineProperty(navigator, 'standalone', {
          value: standalone,
          configurable: true
        }),
      standalone
    );
    await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned');
    await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
      timeout: 60_000
    });
    const message = page.locator('.message').last();
    await expect(message).toBeVisible({ timeout: 60_000 });
    await message.scrollIntoViewIfNeeded();
    const bounds = (await message.boundingBox())!;
    const point = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: bounds.x + 40,
      clientY: bounds.y + 12
    };
    const text = message.locator('.message-content--text');
    const touch =
      browserName === 'chromium'
        ? await page.context().newCDPSession(page)
        : null;
    if (touch)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: point.clientX, y: point.clientY }]
      });
    else await text.dispatchEvent('pointerdown', point);
    const menu = page.locator('.message-context-menu:visible');
    await expect(menu).toBeVisible();
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
      await touch.detach();
    } else {
      await text.dispatchEvent('pointerup', point);
      await expect(menu).toBeVisible();
      await text.dispatchEvent('click', { ...point, detail: 1 });
    }
    await expect(menu.getByText('Ответить', { exact: true })).toBeVisible();
    await expect(menu.getByText('Переслать', { exact: true })).toBeVisible();
    await menu.getByText('Ответить', { exact: true }).tap();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.chat__input__action')).toBeVisible();
    await expect(message).toHaveCSS('-webkit-user-select', 'none');
    await text.dispatchEvent('pointerdown', point);
    await text.dispatchEvent('pointermove', {
      ...point,
      clientY: point.clientY - 30
    });
    await text.dispatchEvent('pointerup', point);
    // Проверяем после порога long press, чтобы увидеть ошибочно оставшийся таймер.
    await page.waitForTimeout(500);
    await expect(menu).toHaveCount(0);
  });

  test(`${mode}: скрепка и редактор работают после повторного открытия клавиатуры`, async ({
    page
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'platform', { value: 'iPhone' })
    );
    await page.addInitScript(
      standalone =>
        Object.defineProperty(navigator, 'standalone', {
          value: standalone,
          configurable: true
        }),
      standalone
    );
    await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned');
    const editor = page.locator('.chat__input .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 60_000 });
    for (let attempt = 0; attempt < 3; attempt++) {
      await editor.tap();
      await expect(editor).not.toHaveAttribute('inputmode', 'none');
      await editor.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      // iOS использует Meta+A; Control+A перемещает курсор в начало строки.
      await editor.press('Meta+A');
      await editor.press('Backspace');
      await expect(editor).toHaveText('');
      await editor.pressSequentially(`Черновик ${attempt}`);
      await page.evaluate(() => (window as any).setIosViewport(500, 180));
      await page.locator('.chat__input .attach-file-button:visible').tap();
      const option = page
        .locator('.attach-file-popover .popover-yui-kit__content:visible')
        .getByText('Файл', { exact: true });
      await expect(option).toBeVisible();
      const selection = page.waitForEvent('filechooser');
      await option.tap();
      await (await selection).setFiles([]);
      await page.evaluate(() => (window as any).setIosViewport(844, 100));
      if (standalone)
        await expect
          .poll(
            async () =>
              (await page.locator('.chat__header-wrapper').boundingBox())!.y
          )
          .toBe(0);
      await expect(editor).toHaveText(`Черновик ${attempt}`);
    }
  });
}

test('обложка видео сохраняется после отправки и обновления истории при отказе повторного декодирования', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000);
  let uploadedCover: Buffer | null = null;
  let completed: any;
  let resolveCover!: (cover: Buffer) => void;
  const coverReady = new Promise<Buffer>(resolve => {
    resolveCover = resolve;
  });
  await page.route('**/stored-cover.jpg*', async route =>
    route.fulfill({ contentType: 'image/jpeg', body: await coverReady })
  );
  await page.route('**/e2e/ios-api/media/upload-target', route => {
    const isCover = route.request().postDataJSON().contentType === 'image/jpeg';
    const objectName = isCover ? 'source-cover.jpg' : 'source-video.mp4';
    return route.fulfill({
      json: {
        objectName,
        uploadUrl: `http://localhost:5173/e2e/ios-api/storage/${objectName}`
      }
    });
  });
  await page.route('**/e2e/ios-api/storage/*', route => {
    if (route.request().url().endsWith('source-cover.jpg'))
      uploadedCover = route.request().postDataBuffer();
    return route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/e2e/ios-api/media/upload', route => {
    completed = route.request().postDataJSON();
    return route.fulfill({
      json: {
        objectName: 'source-video.mp4',
        thumbnailObjectName: completed.thumbnailObjectName
          ? 'stored-cover.jpg'
          : null,
        ex: { width: 640, height: 360 }
      }
    });
  });

  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  await page.evaluate(async syntheticDecoder => {
    const { controlConnection } = await import(
      '/e2e/fixtures/network-harness.ts'
    );
    const { mountMessageSender } = await import(
      '/e2e/fixtures/message-send-harness.ts'
    );
    const { setConfig } = await import('/src/services/useConfig.ts');
    controlConnection();
    setConfig({
      CHAT_PATH_TO_FILE_CDN: `${location.origin}/e2e/ios-api/media/object/`
    });
    const state = {
      cover: '',
      repeatedDecodes: 0,
      coverUpload: [] as number[],
      coverUploadReady: Promise.resolve(),
      sent: null as any,
      done: false
    };
    (window as any).videoCoverRegression = state;
    // В Windows WebKit не декодирует этот MP4: воспроизводим события готового кадра.
    if (syntheticDecoder) {
      const decodedVideos = new WeakSet<HTMLVideoElement>();
      const createElement = document.createElement.bind(document);
      document.createElement = ((
        tag: string,
        options?: ElementCreationOptions
      ) => {
        const element = createElement(tag, options);
        if (tag !== 'video') return element;
        const video = element as HTMLVideoElement;
        decodedVideos.add(video);
        let source = '';
        let time = 0;
        Object.defineProperties(video, {
          videoWidth: { value: 160 },
          videoHeight: { value: 90 },
          duration: { value: 1 },
          readyState: { value: 2 },
          requestVideoFrameCallback: { value: undefined },
          src: {
            get: () => source,
            set: value => {
              source = value;
              const failed = Boolean(state.cover);
              if (failed) state.repeatedDecodes++;
              queueMicrotask(() =>
                video.dispatchEvent(
                  new Event(failed ? 'error' : 'loadedmetadata')
                )
              );
            }
          },
          currentTime: {
            get: () => time,
            set: value => {
              time = value;
              queueMicrotask(() => video.dispatchEvent(new Event('seeked')));
            }
          }
        });
        video.load = () => {};
        return video;
      }) as typeof document.createElement;
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
        if (decodedVideos.has(args[0])) {
          this.fillStyle = '#e7b53b';
          this.fillRect(0, 0, 160, 90);
          return;
        }
        (drawImage as any).apply(this, args);
      };
    }
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      if (body instanceof Blob && body.type === 'image/jpeg') {
        state.coverUploadReady = body.arrayBuffer().then(bytes => {
          state.coverUpload = [...new Uint8Array(bytes)];
        });
      }
      send.call(this, body);
    };
    const toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const result = toDataURL.apply(this, args);
      if (args[0] === 'image/jpeg') state.cover = result;
      return result;
    };
    const load = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.load = function () {
      if (state.cover && this.hasAttribute('src')) {
        state.repeatedDecodes++;
        queueMicrotask(() => this.dispatchEvent(new Event('error')));
        return;
      }
      load.call(this);
    };
    (window as any).iosPwaFixture.sdk.sendWebSocketEvent = (
      _type: string,
      payload: any
    ) => {
      if (payload.medias) state.sent = payload;
      return true;
    };
    const response = await fetch('/e2e/fixtures/video-cover.mp4');
    const file = new File([await response.blob()], 'source-video.mp4', {
      type: 'video/mp4'
    });
    const sender = mountMessageSender('mobile-search-fixture');
    void sender.handleAttachSharedFiles([file]).then(() => {
      state.done = true;
    });
  }, testInfo.project.name === 'webkit-iphone-pwa');
  await expect
    .poll(
      () => page.evaluate(() => (window as any).videoCoverRegression.done),
      { timeout: 45_000 }
    )
    .toBe(true);
  const state = await page.evaluate(async () => {
    const state = (window as any).videoCoverRegression;
    await state.coverUploadReady;
    return {
      cover: state.cover,
      sent: state.sent,
      coverUpload: state.coverUpload
    };
  });
  expect(state.cover).toMatch(/^data:image\/jpeg;base64,/);
  expect(completed.thumbnailObjectName).toBe('source-cover.jpg');
  expect(Buffer.from(state.coverUpload)).toEqual(
    Buffer.from(state.cover.split(',')[1], 'base64')
  );
  if (testInfo.project.name === 'chromium-mobile')
    expect(uploadedCover).toEqual(Buffer.from(state.coverUpload));

  expect(state.sent.medias[0].thumbnailPath).toBe('stored-cover.jpg');
  const coverBytes = Buffer.from(state.cover.split(',')[1], 'base64');
  resolveCover(coverBytes);
  const confirmed = await page.evaluate(async () => {
    const messages = await import('/src/services/useMessages.ts');
    const sent = (window as any).videoCoverRegression.sent;
    const confirmed = {
      id: 'confirmed-video-cover',
      topicId: 'mobile-search-fixture',
      senderUserId: 'mobile-search-user',
      senderUser: { id: 'mobile-search-user', initials: 'Тест' },
      text: sent.text || null,
      createdAt: new Date().toISOString(),
      ex: sent.ex,
      status: 'DELIVERED',
      media: sent.medias.map((media: any) => ({
        ...media,
        id: 'server-video',
        localPath: undefined,
        localThumbnailPath: undefined
      }))
    };
    messages.addMessageToLocal('mobile-search-fixture', confirmed);
    return confirmed;
  });
  const historyPage = await page.context().newPage();
  historyPage.on('pageerror', error =>
    pageErrors.get(page)!.push(error.message)
  );
  await historyPage.route('**/stored-cover.jpg*', route =>
    route.fulfill({ contentType: 'image/jpeg', body: coverBytes })
  );
  await historyPage.route('**/__video-cover-history', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div>'
    })
  );
  await historyPage.goto('/__video-cover-history');
  await historyPage.evaluate(async confirmed => {
    const { mountVideoHistoryMessage } = await import(
      '/e2e/fixtures/video-cover-history.ts'
    );
    mountVideoHistoryMessage(confirmed);
  }, confirmed);
  const cover = historyPage.locator(
    '[data-message-id="confirmed-video-cover"] .message-content__media img'
  );
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(1);
  await expect(cover).not.toHaveAttribute('src', /^data:/);
  await historyPage.screenshot({
    path: testInfo.outputPath('video-cover-after-history.png')
  });
});
