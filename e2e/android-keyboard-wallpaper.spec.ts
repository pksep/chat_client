import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile');
});

async function openChat(page: Page, platform = 'android', count = 40) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname.endsWith('/groups/fixture-group-id'))
      return route.fulfill({
        json: {
          group: { id: 'fixture-group-id', title: 'Проверка поиска' },
          members: { data: [] }
        }
      });
    if (url.pathname.endsWith('/topics/mobile-search-fixture'))
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
    if (url.pathname.startsWith('/e2e/ios-api/'))
      return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.setViewportSize({ width: 392, height: 832 });
  await page.goto(
    `/e2e/fixtures/mobile-chat-search.html?kind=group&no-pinned&shell&native-platform=${platform}&message-count=${count}`
  );
  await page.getByRole('button', { name: 'Остаться в браузере' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 15000
  });
  await expect(
    page.locator(`[data-message-id="message-${count - 1}"]`).first()
  ).toBeVisible();
  return errors;
}

const backgroundStrip = (page: Page, y = 200, x = 1) =>
  page.screenshot({ clip: { x, y, width: 2, height: 80 } });

const lastMessageBottom = (page: Page, count = 40) =>
  page
    .locator(`[data-message-id="message-${count - 1}"]`)
    .first()
    .evaluate(element => element.getBoundingClientRect().bottom);

for (const [count, wallpaper] of [
  [40, 'none'],
  [2, 'none'],
  [40, 'cover'],
  [40, 'tile']
] as const) {
  test(`Android: клавиатура поднимает ${count} сообщений, сохраняя фон ${wallpaper} неподвижным`, async ({
    page
  }) => {
    const errors = await openChat(page, 'android', count);
    await page.evaluate(async kind => {
      const importModule = (path: string) => import(/* @vite-ignore */ path);
      const { useChatWallpaper } = await importModule(
        '/src/composables/useChatWallpaper.ts'
      );
      const wallpaper = useChatWallpaper();
      if (kind === 'tile') {
        const image = new Image();
        image.src = '/images/chat-wallpapers/wallpaper1-1.svg';
        await image.decode();
        wallpaper.selectWallpaper('wallpaper1');
      } else if (kind === 'cover') {
        const { configureCustomBackgroundSync } = await importModule(
          '/src/services/useCustomBackgroundSync.ts'
        );
        const records = new Map();
        configureCustomBackgroundSync('keyboard-fixture', {
          getCustomBackgrounds: async () => [...records.values()],
          getCustomBackground: async (_kind, id) => records.get(id),
          saveCustomBackground: async (_kind, image) => {
            records.set(image.id, image);
            return image;
          }
        });
        const dataUrl =
          'data:image/svg+xml;base64,' +
          btoa(
            '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path fill="url(#g)" d="M0 0h300v600H0z"/></svg>'
          );
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        await wallpaper.setCustomWallpaper(dataUrl);
      }
    }, wallpaper);
    const originalBackground = await backgroundStrip(page);
    expect(originalBackground.equals(await backgroundStrip(page, 300))).toBe(
      false
    );
    const originalBottom = await lastMessageBottom(page, count);
    await page.locator('.chat__input .ProseMirror').tap();
    for (const height of [650, 506, 650, 832, 506, 832]) {
      await page.setViewportSize({ width: 392, height });
      await expect
        .poll(async () =>
          Math.abs(
            (await lastMessageBottom(page, count)) -
              originalBottom -
              (height - 832)
          )
        )
        .toBeLessThanOrEqual(2);
      expect((await backgroundStrip(page)).equals(originalBackground)).toBe(
        true
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    expect(errors).toEqual([]);
  });
}

for (const platform of ['web', 'ios']) {
  test(`${platform}: Android-слой фона не применяется`, async ({ page }) => {
    const errors = await openChat(page, platform);
    await expect(page.locator('.chat-container__wallpaper')).toHaveCount(0);
    await expect(page.locator('.chat-container')).toHaveCSS(
      'background-image',
      /linear-gradient/
    );
    expect(errors).toEqual([]);
  });
}

test('Android: поворот экрана обновляет размер фона', async ({ page }) => {
  const errors = await openChat(page);
  await page.setViewportSize({ width: 832, height: 392 });
  await expect
    .poll(() =>
      page
        .locator('.chat-container__wallpaper-image')
        .evaluate(el => el.clientHeight)
    )
    .toBe(392);
  const background = await backgroundStrip(page, 90, 440);
  expect(background.equals(await backgroundStrip(page, 180, 440))).toBe(false);
  await page.setViewportSize({ width: 832, height: 260 });
  expect((await backgroundStrip(page, 90, 440)).equals(background)).toBe(true);
  await page.setViewportSize({ width: 392, height: 832 });
  await expect
    .poll(() =>
      page
        .locator('.chat-container__wallpaper-image')
        .evaluate(el => el.clientHeight)
    )
    .toBe(832);
  expect(errors).toEqual([]);
});

for (const count of [2, 40]) {
  test(`Android IME: ${count} сообщений движутся без перевёрстки каждого кадра`, async ({
    page
  }) => {
    await openChat(page, 'android', count);
    await page.evaluate(async () => {
      const load = (path: string) => import(/* @vite-ignore */ path);
      const { createAndroidKeyboardViewport } = await load(
        performance
          .getEntriesByType('resource')
          .find(entry =>
            entry.name.includes('/src/utils/android-keyboard-viewport.ts')
          )!.name
      );
      window.__sepAndroidKeyboard = createAndroidKeyboardViewport();
    });
    const originalBottom = await lastMessageBottom(page, count);
    const background = await backgroundStrip(page);
    const frame = async (
      bottom: number,
      phase: 'prepare' | 'progress' | 'end'
    ) => {
      await page.evaluate(
        ({ bottom, phase }) =>
          window.__sepAndroidKeyboard!(bottom * devicePixelRatio, phase),
        { bottom, phase }
      );
      await page.evaluate(() => new Promise(requestAnimationFrame));
      expect(await page.evaluate(() => innerHeight)).toBe(832);
      expect(
        Math.abs(
          (await lastMessageBottom(page, count)) - originalBottom + bottom
        )
      ).toBeLessThanOrEqual(2);
      const inputBottom = await page
        .locator('.chat__input')
        .evaluate(el => el.getBoundingClientRect().bottom);
      expect(Math.abs(inputBottom - 832 + bottom)).toBeLessThanOrEqual(2);
      expect((await backgroundStrip(page)).equals(background)).toBe(true);
    };
    for (let cycle = 0; cycle < 2; cycle++) {
      await frame(0, 'prepare');
      const height = await page
        .locator('.chat__message-wrapper')
        .evaluate(el => el.clientHeight);
      for (const bottom of [12, 38, 90, 155, 218, 277, 310, 326]) {
        await frame(bottom, 'progress');
        expect(
          await page
            .locator('.chat__message-wrapper')
            .evaluate(el => el.clientHeight)
        ).toBe(height);
      }
      await frame(326, 'end');
      await frame(326, 'prepare');
      for (const bottom of [310, 275, 213, 150, 80, 30, 0])
        await frame(bottom, 'progress');
      await frame(0, 'end');
    }
  });
}

test('Android IME: закрытие у начала истории не сдвигает сообщения скачком', async ({
  page
}) => {
  await openChat(page);
  const jump = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAndroidKeyboardViewport } = await load(
      performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/utils/android-keyboard-viewport.ts')
        )!.name
    );
    const update = createAndroidKeyboardViewport();
    update(0, 'prepare');
    update(326 * devicePixelRatio, 'end');
    const scroller = document.querySelector<HTMLElement>(
      '.chat__message-wrapper'
    )!;
    scroller.scrollTop = 50;
    const message = scroller.querySelector<HTMLElement>('[data-message-id]')!;
    const before = message.getBoundingClientRect().top;
    update(326 * devicePixelRatio, 'prepare');
    return message.getBoundingClientRect().top - before;
  });
  expect(Math.abs(jump)).toBeLessThan(2);
});

test('Android IME: скрепка и эмодзи открываются в пределах экрана после клавиатуры', async ({
  page
}) => {
  await openChat(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAndroidKeyboardViewport } = await load(
      performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/utils/android-keyboard-viewport.ts')
        )!.name
    );
    const update = createAndroidKeyboardViewport();
    update(0, 'prepare');
    update(326 * devicePixelRatio, 'progress');
    update(326 * devicePixelRatio, 'end');
    update(326 * devicePixelRatio, 'prepare');
    update(0, 'progress');
    update(0, 'end');
  });
  const smile = page.locator('.chat__input .smile-button:visible');
  await smile.click();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  await expect(picker).toBeVisible();
  const bounds = await picker.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThan(832);
  await expect(picker.locator('.v3-emojis button').first()).toBeInViewport();
  await smile.click();
  await page.locator('.chat__input .attach-file-button:visible').click();
  const files = page.locator('.chat__input .popover-yui-kit__content:visible');
  await expect(files).toBeVisible();
  await expect(files).toBeInViewport();
});

test('Android IME: открытие эмодзи сохраняет клавиатуру и позицию поля ввода', async ({
  page
}) => {
  await openChat(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAndroidKeyboardViewport } = await load(
      performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/utils/android-keyboard-viewport.ts')
        )!.name
    );
    window.__sepAndroidKeyboard = createAndroidKeyboardViewport();
    window.__sepAndroidKeyboard(0, 'prepare');
    window.__sepAndroidKeyboard(326 * devicePixelRatio, 'end');
  });
  await page.locator('.chat__input .smile-button:visible').click();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  await expect(picker).toBeVisible();
  expect(
    await page
      .locator('.chat__input')
      .evaluate(el => el.getBoundingClientRect().bottom)
  ).toBe(506);
  await expect(picker).toHaveCSS('opacity', '1');
  const gap = () =>
    page.evaluate(() => {
      const input = document
        .querySelector('.chat__input')!
        .getBoundingClientRect();
      const panel = document
        .querySelector('.chat__input .emoji-picker--open')!
        .getBoundingClientRect();
      return input.top - panel.bottom;
    });
  await expect.poll(gap).toBeGreaterThanOrEqual(4);
  await expect.poll(gap).toBeLessThanOrEqual(7);
  await picker.locator('.v3-search input').tap();
  await page.evaluate(() => {
    window.__sepAndroidKeyboard!(0, 'prepare');
    window.__sepAndroidKeyboard!(326 * devicePixelRatio, 'end');
  });
  await expect(picker.locator('.v3-search input')).toBeFocused();
  await expect.poll(gap).toBeGreaterThanOrEqual(4);
  await expect.poll(gap).toBeLessThanOrEqual(7);
  await expect(picker).toBeInViewport();
});

test('Android IME: поиск эмодзи движется вместе с вводом по фактическим кадрам', async ({
  page
}) => {
  await openChat(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAndroidKeyboardViewport } = await load(
      performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/utils/android-keyboard-viewport.ts')
        )!.name
    );
    window.__sepAndroidKeyboard = createAndroidKeyboardViewport();
  });
  await page.locator('.chat__input .smile-button:visible').click();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  await picker.locator('.v3-search input').tap();
  await page.evaluate(() => window.__sepAndroidKeyboard!(0, 'prepare'));
  const background = await backgroundStrip(page, 150, 390);
  for (const bottom of [12, 50, 120, 190, 248, 300, 326]) {
    await page.evaluate(
      bottom =>
        window.__sepAndroidKeyboard!(bottom * devicePixelRatio, 'progress'),
      bottom
    );
    const geometry = await page.evaluate(() => {
      const input = document
        .querySelector('.chat__input')!
        .getBoundingClientRect();
      const popup = document
        .querySelector('.emoji-picker--open')!
        .getBoundingClientRect();
      return { gap: input.top - popup.bottom, bottom: input.bottom };
    });
    expect(Math.abs(geometry.bottom - 832 + bottom)).toBeLessThan(2);
    expect(Math.abs(geometry.gap - 5)).toBeLessThan(2);
    expect((await backgroundStrip(page, 150, 390)).equals(background)).toBe(
      true
    );
  }
  await page.evaluate(() =>
    window.__sepAndroidKeyboard!(326 * devicePixelRatio, 'end')
  );
  await expect(picker).toBeInViewport();
});

test('Android IME: закрытие вложений через native Back сохраняет клавиатуру и фокус', async ({
  page
}) => {
  await openChat(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { createAndroidKeyboardViewport } = await load(
      performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/utils/android-keyboard-viewport.ts')
        )!.name
    );
    window.__sepAndroidKeyboard = createAndroidKeyboardViewport();
  });
  const editor = page.locator('.chat__input .ProseMirror');
  await editor.tap();
  await page.evaluate(() =>
    window.__sepAndroidKeyboard!(326 * devicePixelRatio, 'end')
  );
  await page.locator('.chat__input .attach-file-button:visible').tap();
  const popup = page.locator('.chat__input .popover-yui-kit__content:visible');
  await expect(popup).toBeInViewport();
  await page.evaluate(() => window.__sepAndroidDismissComposerOverlay!());
  await expect(popup).toHaveCount(0);
  await expect(editor).toBeFocused();
  const bottom = await page
    .locator('.chat__input')
    .evaluate(el => el.getBoundingClientRect().bottom);
  expect(Math.abs(bottom - 506)).toBeLessThan(2);
});
