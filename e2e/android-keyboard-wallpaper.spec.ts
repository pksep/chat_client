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

const backgroundStrip = (page: Page, y = 200, x = 1, height = 80) =>
  page.screenshot({ clip: { x, y, width: 2, height } });

const lastMessageBottom = (page: Page, count = 40) =>
  page
    .locator(`[data-message-id="message-${count - 1}"]`)
    .first()
    .evaluate(element => element.getBoundingClientRect().bottom);

async function setAndroidKeyboard(page: Page, bottom: number) {
  await page.evaluate(async bottom => {
    const path = performance
      .getEntriesByType('resource')
      .find(entry =>
        entry.name.includes('/src/utils/android-keyboard-viewport.ts')
      )!.name;
    const { createAndroidKeyboardViewport } = await import(
      /* @vite-ignore */ path
    );
    window.__sepAndroidKeyboard ||= createAndroidKeyboardViewport();
    window.__sepAndroidKeyboard(bottom * devicePixelRatio, 'end');
  }, bottom);
}

async function mockNativeKeyboard(page: Page) {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as any).nativeKeyboardCalls = calls;
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'KeyboardViewport',
          methods: ['start', 'stop', 'setOverlayOpen'].map(name => ({
            name,
            rtype: 'promise'
          }))
        }
      ],
      nativePromise: (plugin: string, method: string) => {
        if (plugin === 'KeyboardViewport') {
          calls.push(method);
          if (method === 'stop') window.__sepAndroidKeyboard?.(0, 'end');
        }
        return Promise.resolve();
      }
    };
  });
}

test('Android IME: меню и поиск реакций сохраняют фокус и обработку клавиатуры', async ({
  page
}) => {
  await mockNativeKeyboard(page);
  await openChat(page);
  const input = page.locator('.chat__input .ProseMirror');
  await input.focus();
  await setAndroidKeyboard(page, 326);
  await page
    .locator('.message[data-message-id="message-39"]')
    .dispatchEvent('contextmenu', { clientX: 240, clientY: 410 });
  const menu = page.locator('.message-context-menu');
  await expect(menu).toBeVisible();
  await menu.locator('.select-reactions-list-button').tap();
  await expect(
    menu.locator('.message-context-menu__emoji-picker--ready')
  ).toBeVisible();
  await expect(input).toBeFocused();
  await menu.locator('.v3-search input').tap();
  await expect(menu.locator('.v3-search input')).toBeFocused();
  expect(
    await page.evaluate(() => (window as any).nativeKeyboardCalls)
  ).toEqual(['start']);
  expect(
    await page
      .locator('.chat__input')
      .evaluate(el => el.getBoundingClientRect().bottom)
  ).toBe(506);
});

test('Android IME: касание сообщения после закрытия клавиатуры не удерживает фокус ввода', async ({
  page
}) => {
  await mockNativeKeyboard(page);
  await openChat(page);
  const input = page.locator('.chat__input .ProseMirror');
  await input.focus();
  await setAndroidKeyboard(page, 0);
  await page
    .locator(
      '.message[data-message-id="message-39"] .message__content__articles'
    )
    .tap();
  await expect(input).not.toBeFocused();
  expect(
    await page.evaluate(() => (window as any).nativeKeyboardCalls)
  ).toEqual(['start']);
});

test('Android: меню сообщения и реакции помещаются над открытой клавиатурой', async ({
  page
}, testInfo) => {
  await openChat(page);
  await setAndroidKeyboard(page, 326);
  await page.evaluate(() => {
    document
      .querySelector('.message[data-message-id="message-39"]')!
      .dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 240,
          clientY: 410
        })
      );
  });
  const menu = page.locator('.message-context-menu');
  await expect(menu).toBeVisible();
  await expect
    .poll(() => menu.evaluate(el => el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(498);
  await expect(page.locator('.select-reactions--ready')).toBeVisible();
  expect(
    await page
      .locator('.select-reactions')
      .evaluate(el => el.getBoundingClientRect().top)
  ).toBeGreaterThanOrEqual(8);
  await expect(
    menu.getByRole('button', { name: 'Удалить', exact: true })
  ).toBeInViewport();
  await setAndroidKeyboard(page, 400);
  await expect
    .poll(() => menu.evaluate(el => el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(424);
  await page.screenshot({
    path: testInfo.outputPath('message-menu-above-keyboard.png')
  });
  await menu.locator('.select-reactions-list-button').click();
  const picker = menu.locator('.message-context-menu__emoji-picker--ready');
  await expect(picker).toBeVisible();
  await expect
    .poll(() => picker.evaluate(el => el.getBoundingClientRect().bottom))
    .toBeLessThanOrEqual(424);
});

for (const bottom of [0, 326]) {
  test(`Android: эффект удаления остаётся на месте сообщения при клавиатуре ${bottom}`, async ({
    page
  }) => {
    await openChat(page);
    await setAndroidKeyboard(page, bottom);
    const geometry = await page.evaluate(async () => {
      const element = document.querySelector<HTMLElement>(
        '.message[data-message-id="message-39"] .message__content__articles'
      )!;
      const before = element.getBoundingClientRect();
      const path = performance
        .getEntriesByType('resource')
        .find(entry =>
          entry.name.includes('/src/services/useMessages.ts')
        )!.name;
      const messages = await import(/* @vite-ignore */ path);
      void messages.deleteMessageFromLocal(
        'mobile-search-fixture',
        'message-39'
      );
      const vuePath = performance
        .getEntriesByType('resource')
        .find(entry => /\/vue\.js\?/.test(entry.name))!.name;
      const { nextTick } = await import(/* @vite-ignore */ vuePath);
      await nextTick();
      const ghost = document.querySelector<HTMLElement>(
        '.message-deletion-ghost'
      )!;
      const after = ghost?.getBoundingClientRect();
      return {
        before: { top: before.top, left: before.left },
        after: after && { top: after.top, left: after.left }
      };
    });
    expect(geometry.after).toBeDefined();
    expect(Math.abs(geometry.after!.top - geometry.before.top)).toBeLessThan(
      24
    );
    expect(Math.abs(geometry.after!.left - geometry.before.left)).toBeLessThan(
      24
    );
    await expect(page.locator('.message-deletion-layer')).toHaveCount(0);
  });
}

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
  // Сообщения при изменении высоты двигаются поверх проверяемого фона.
  await page.addStyleTag({
    content:
      '.chat-container > :not(.chat-container__wallpaper) { visibility: hidden !important; }'
  });
  await page.setViewportSize({ width: 832, height: 392 });
  await expect
    .poll(() =>
      page
        .locator('.chat-container__wallpaper-image')
        .evaluate(el => el.clientHeight)
    )
    .toBe(392);
  const background = await backgroundStrip(page, 80, 440, 40);
  expect(background.equals(await backgroundStrip(page, 180, 440, 40))).toBe(
    false
  );
  await page.setViewportSize({ width: 832, height: 260 });
  await expect
    .poll(() =>
      page
        .locator('.chat-container__wallpaper-image')
        .evaluate(el => el.clientHeight)
    )
    .toBe(392);
  expect((await backgroundStrip(page, 80, 440, 40)).equals(background)).toBe(
    true
  );
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
