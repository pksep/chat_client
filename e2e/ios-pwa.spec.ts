import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'chromium-desktop');
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

for (const kind of ['group', 'ai']) {
  test(`${kind}: заголовок, история и редактор остаются в видимой области iPhone`, async ({
    page
  }, testInfo) => {
    await page.goto(`/e2e/fixtures/ios-pwa.html?kind=${kind}&no-pinned`);
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
        .toBeCloseTo(top + 47, 0);
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
    await page.getByRole('button', { name: 'Чаты', exact: true }).tap();
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
