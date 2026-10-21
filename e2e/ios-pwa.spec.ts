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
      expect(input.y + input.height).toBeLessThanOrEqual(top + height + 1);
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
  await page.evaluate(() => (window as any).setIosViewport(500));
  await expect(page.locator('.chat__header-wrapper')).toBeInViewport();
  await expect(search).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('emoji-iphone-pwa.png') });
});

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
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
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
  const message = page.locator('.message').last();
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
    expect(navBox.y + navBox.height).toBeCloseTo(
      844 - 16 - (standalone ? 34 : 0),
      0
    );
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
      await editor.fill(`Черновик ${attempt}`);
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
