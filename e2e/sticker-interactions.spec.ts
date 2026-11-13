import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lazyUiKitEmojiRuntime } from '../scripts/lazy-ui-kit-emoji-runtime';
import { mockStickerCatalog } from './fixtures/sticker-catalog';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const openPicker = async (page: Page) => {
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  return page.getByRole('region', { name: 'Каталог стикеров' });
};

const delayEmojiRuntime = async (page: Page) => {
  const path = fileURLToPath(
    new URL('../node_modules/@pksep/yui/dist/sep-yui.mjs', import.meta.url)
  );
  const plugin = lazyUiKitEmojiRuntime();
  const transform = plugin.transform;
  const load = plugin.load;
  if (typeof transform !== 'function' || typeof load !== 'function')
    throw new Error('Не найден загрузчик панели эмодзи');
  const transformed = await transform.call(
    {
      error: (message: string) => {
        throw new Error(message);
      }
    } as never,
    readFileSync(path, 'utf8'),
    path
  );
  const runtime = await load.call({} as never, '\0chat-ui-emoji-runtime');
  if (
    !transformed ||
    typeof transformed === 'string' ||
    typeof runtime !== 'string'
  )
    throw new Error('Не удалось подготовить панель эмодзи');
  const runtimeUrl = '/e2e/fixtures/__lazy-emoji-runtime.js';
  let finishLoading!: () => void;
  const ready = new Promise<void>(resolve => {
    finishLoading = resolve;
  });
  let vueUrl = '';
  await page.route(
    '**/node_modules/@pksep/yui/dist/sep-yui.mjs*',
    async route => {
      const response = await route.fetch();
      vueUrl = (await response.text()).match(
        /^import \{[^\n]*defineComponent[^\n]+\} from "([^"]+)";/m
      )![1];
      await route.fulfill({
        contentType: 'application/javascript',
        body: transformed.code
          .replace(/from "vue";/g, `from ${JSON.stringify(vueUrl)};`)
          .replace(
            JSON.stringify('\0chat-ui-emoji-runtime'),
            JSON.stringify(runtimeUrl)
          )
      });
    }
  );
  await page.route(`**${runtimeUrl}`, async route => {
    await ready;
    await route.fulfill({
      contentType: 'application/javascript',
      body: runtime.replace(/from "vue";/g, `from ${JSON.stringify(vueUrl)};`)
    });
  });
  return finishLoading;
};

test('вертикальные, квадратные и горизонтальные стикеры сохраняют пропорции и высоту до 220 px', async ({
  page
}) => {
  const catalog = await mockStickerCatalog(page);
  for (const [index, width, height] of [
    [0, 233, 512],
    [1, 512, 512],
    [2, 512, 128]
  ]) {
    Object.assign(catalog.items[index], { width, height });
  }
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  for (let index = 0; index < 3; index++) {
    const picker = await openPicker(page);
    await picker.locator(`[data-sticker-id="sep-robots-${index}"]`).click();
    const image = page.locator('.message-sticker__image').nth(index);
    await expect(image.locator('.message-sticker__animation')).toHaveClass(
      /--loaded/
    );
    const bounds = (await image.boundingBox())!;
    const sticker = catalog.items[index];
    expect(bounds.height).toBeLessThanOrEqual(220.1);
    expect(bounds.width).toBeLessThanOrEqual(220.1);
    expect(bounds.width / bounds.height).toBeCloseTo(
      sticker.width / sticker.height,
      2
    );
    await expect(image.locator('.message-sticker__animation')).toHaveAttribute(
      'src',
      new RegExp(sticker.path)
    );
  }
});

test('клик на сообщении открывает именно его набор, в том числе скрытый, не меняя выбор в профиле', async ({
  page
}) => {
  await mockStickerCatalog(page);
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = await openPicker(page);
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  await picker.locator('.chat-sticker-picker__item').first().click();
  await expect(picker).toBeHidden();
  await page.evaluate(() =>
    (window as any).stickerFixture.hidePacks(['fishprometheus'])
  );
  await page
    .getByRole('button', { name: 'Открыть набор стикеров', exact: true })
    .click();
  await expect(picker).toBeVisible();
  await expect(
    picker.locator('.chat-sticker-picker__packs button[aria-pressed="true"]')
  ).toHaveAttribute('aria-label', 'Рыба Прометей');
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toHaveAttribute('data-sticker-id', 'fishprometheus-0');
  expect(
    await page.evaluate(() => (window as any).stickerFixture.getHiddenPacks())
  ).toEqual(['fishprometheus']);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await page.locator('.smile-button:visible').click();
  await page.locator('.smile-button:visible').click();
  await expect(picker).toBeHidden();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Рыба Прометей', exact: true })
  ).toHaveCount(0);
});

test('удержание показывает оригинальную анимацию в центре всего экрана без крестика и отправки', async ({
  page,
  isMobile
}, testInfo) => {
  await mockStickerCatalog(page);
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = await openPicker(page);
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  const item = picker.locator('.chat-sticker-picker__item').first();
  const bounds = (await item.boundingBox())!;
  const clientX = bounds.x + bounds.width / 2;
  const clientY = bounds.y + bounds.height / 2;
  const touch = isMobile ? await page.context().newCDPSession(page) : null;
  if (touch)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: clientX, y: clientY }]
    });
  else {
    await page.mouse.move(clientX, clientY);
    await page.mouse.down();
  }
  const preview = page.getByRole('dialog', { name: /Просмотр стикера/ });
  await expect(preview).toBeVisible();
  const viewport = page.viewportSize()!;
  expect(await preview.boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: viewport.width,
    height: viewport.height
  });
  await expect(preview.locator('button')).toHaveCount(0);
  const animation = preview.locator('.sticker-picker-image__animation');
  await expect(animation).toHaveClass(/--loaded/);
  await expect(animation.locator('svg')).toHaveCount(1);
  const imageBounds = (await animation.boundingBox())!;
  expect(imageBounds.x + imageBounds.width / 2).toBeCloseTo(
    viewport.width / 2,
    0
  );
  expect(imageBounds.y + imageBounds.height / 2).toBeCloseTo(
    viewport.height / 2,
    0
  );
  await page.screenshot({
    path: testInfo.outputPath('sticker-hold-preview.png')
  });
  if (touch)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
  else await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await item.click();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
});

test('движение пальца отменяет удержание и не показывает просмотр', async ({
  page
}) => {
  await mockStickerCatalog(page);
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = await openPicker(page);
  const item = picker.locator('.chat-sticker-picker__item').first();
  await item.dispatchEvent('pointerdown', {
    pointerId: 25,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 20,
    clientY: 20
  });
  await item.dispatchEvent('pointermove', {
    pointerId: 25,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 45
  });
  await page.waitForTimeout(500);
  await expect(page.locator('.sticker-preview')).toHaveCount(0);
  await item.dispatchEvent('pointercancel', { pointerId: 25 });
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
});

test('превью получает основное эмодзи Telegram одним запросом вместо поисковых привязок и номера набора', async ({
  page
}) => {
  const catalog = await mockStickerCatalog(page);
  catalog.items[0].keywords.push('🐟', '😎', '😂', '👍🏽', '❤', '❤️', '😢');
  catalog.items[0].emoji = '😎';
  catalog.items[1].keywords.push('👍🏽');
  catalog.items[1].emoji = '👍🏽';
  const resolves: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/stickers/resolve'))
      resolves.push(request.postData() || '');
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.evaluate(
    stickers => (window as any).stickerFixture.mountTopicPreviews(stickers),
    catalog.items.slice(0, 2)
  );
  const previews = page.locator(
    '#sticker-topic-previews .contact-list__description'
  );
  await expect(previews).toHaveText(['😎 Стикер', '👍🏽 Стикер']);
  expect(resolves).toHaveLength(1);
  expect(JSON.parse(resolves[0]).references).toHaveLength(2);
});

test('в группе у стикера остаётся аватар без имени и должности; клик открывает набор в настоящем редакторе', async ({
  page,
  isMobile
}) => {
  const state = await openFixture(page, { shell: true, count: 2 });
  const catalog = await mockStickerCatalog(page);
  const sticker = catalog.items.find(item => item.pack === 'fishprometheus')!;
  const rows = makeMessages('performance-0', 2).map(row => ({
    ...row,
    ex: ''
  }));
  rows[0].ex = JSON.stringify({
    kind: 'sticker',
    sticker: {
      id: sticker.id,
      pack: sticker.pack,
      version: sticker.version,
      asset: sticker
    }
  });
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await openTopic(page, 0);
  await page.evaluate(rows => {
    const fixture = (window as any).topicPerformance;
    fixture.getSelectedTopic('performance-0').type = 'GROUP';
    fixture.seed('performance-0', rows);
  }, rows);
  const message = page.locator('[data-message-id="performance-0-message-0"]');
  await expect(message.locator('.message-sticker__image')).toBeVisible();
  await expect(message.locator('.message__author-meta')).toHaveCount(0);
  await expect(page.locator('.message-group__avatar').first()).toBeVisible();
  await expect(page.locator('.emoji-picker .v3-body')).toHaveCount(0);
  const image = message.locator('.message-sticker__image');
  if (isMobile) await image.tap();
  else await image.click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Стикеры', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    picker.locator('.chat-sticker-picker__packs button[aria-pressed="true"]')
  ).toHaveAttribute('aria-label', 'Рыба Прометей');
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toHaveAttribute('data-sticker-id', sticker.id);
  expect(state.errors).toEqual([]);
});

test('удержание стикера сохраняет фокус редактора и не вызывает его повторно', async ({
  page,
  isMobile
}) => {
  await mockStickerCatalog(page);
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = await openPicker(page);
  const editor = page.locator('.fixture-editor [contenteditable="true"]');
  const item = picker.locator('.chat-sticker-picker__item').first();
  const touch = isMobile ? await page.context().newCDPSession(page) : null;
  const preview = page.getByRole('dialog', { name: /Просмотр стикера/ });
  for (const focused of [false, true]) {
    await editor.evaluate((element, focused) => {
      if (focused) (element as HTMLElement).focus();
      else (element as HTMLElement).blur();
      (window as any).stickerHoldFocusEvents = [];
      if (!(window as any).stickerHoldTracksFocus) {
        (window as any).stickerHoldTracksFocus = true;
        for (const type of ['focus', 'blur'])
          element.addEventListener(type, () => {
            (window as any).stickerHoldFocusEvents.push(type);
          });
      }
    }, focused);
    const bounds = (await item.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    if (touch)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y }]
      });
    else {
      await page.mouse.move(x, y);
      await page.mouse.down();
    }
    await expect(preview).toBeVisible();
    expect(
      await editor.evaluate(element => element === document.activeElement)
    ).toBe(focused);
    if (touch)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });
    else await page.mouse.up();
    await expect(preview).toHaveCount(0);
    expect(
      await page.evaluate(() => (window as any).stickerHoldFocusEvents)
    ).toEqual([]);
    await expect(picker).toBeVisible();
  }
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
});

test('первое нажатие открывает набор без скачков сетки после отложенной загрузки панели', async ({
  page,
  isMobile
}) => {
  await mockStickerCatalog(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const finishLoading = await delayEmojiRuntime(page);
  await page.goto(
    '/e2e/fixtures/stickers.html?catalog=1&composer=1&message-pack=fishprometheus'
  );
  const image = page.getByRole('button', {
    name: 'Открыть набор стикеров',
    exact: true
  });
  await expect(image).toBeVisible();
  await expect(page.locator('.fixture-editor .ProseMirror')).toBeVisible();
  await expect(page.locator('.emoji-picker .v3-body')).toHaveCount(0);
  const editorBounds = await page.locator('.fixture-editor').boundingBox();
  await page.evaluate(() => {
    const state = { running: true, frames: [] as object[] };
    (window as any).stickerOpeningLayout = state;
    const sample = () => {
      const picker = document.querySelector<HTMLElement>(
        '.chat-sticker-picker:not(.chat-sticker-picker--preparing)'
      );
      const body = picker?.closest<HTMLElement>('.v3-body');
      const item = picker?.querySelector<HTMLElement>(
        '.chat-sticker-picker__item'
      );
      if (picker && picker.getClientRects().length) {
        const bounds = picker.getBoundingClientRect();
        const bodyBounds = body?.getBoundingClientRect();
        state.frames.push({
          inBody: !!body,
          width: bounds.width,
          height: bounds.height,
          bodyWidth: bodyBounds?.width,
          bodyHeight: bodyBounds?.height,
          itemWidth: item?.offsetWidth,
          editorHeight: document
            .querySelector('.fixture-editor')!
            .getBoundingClientRect().height
        });
      }
      if (state.running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  if (isMobile) await image.tap();
  else await image.click();
  await expect(page.locator('.emoji-picker .v3-body')).toHaveCount(0);
  await expect(page.locator('.chat-sticker-picker')).toBeHidden();
  expect(await page.locator('.fixture-editor').boundingBox()).toEqual(
    editorBounds
  );
  finishLoading();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Стикеры', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    picker.locator('.chat-sticker-picker__packs button[aria-pressed="true"]')
  ).toHaveAttribute('aria-label', 'Рыба Прометей');
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toHaveAttribute('data-sticker-id', 'fishprometheus-0');
  const frames = await page.evaluate(async () => {
    const state = (window as any).stickerOpeningLayout;
    // Проверяем каждый кадр первой секунды, включая появление сетки.
    await new Promise(resolve => setTimeout(resolve, 1000));
    state.running = false;
    return state.frames as {
      inBody: boolean;
      width: number;
      height: number;
      bodyWidth: number;
      bodyHeight: number;
      itemWidth?: number;
      editorHeight: number;
    }[];
  });
  expect(frames.length).toBeGreaterThan(1);
  expect(frames.some(frame => frame.itemWidth)).toBe(true);
  for (const frame of frames) {
    expect(frame.inBody).toBe(true);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.height).toBeGreaterThan(0);
    expect(frame.width).toBeCloseTo(frame.bodyWidth, 0);
    expect(frame.height).toBeLessThanOrEqual(frame.bodyHeight + 1);
    expect(frame.editorHeight).toBe(editorBounds!.height);
    if (frame.itemWidth) expect(frame.itemWidth).toBe(60);
  }
  const smile = page.locator('.smile-button:visible');
  await smile.click();
  await smile.click();
  await expect(
    page.getByRole('button', { name: 'Эмодзи', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(picker).toHaveCount(0);
  await smile.click();
  if (isMobile) await image.tap();
  else await image.click();
  await expect(picker).toBeVisible();
  await expect(
    picker.locator('.chat-sticker-picker__packs button[aria-pressed="true"]')
  ).toHaveAttribute('aria-label', 'Рыба Прометей');
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  expect(errors).toEqual([]);
});

test('закрытие панели до её загрузки отменяет открытие набора стикеров', async ({
  page,
  isMobile
}) => {
  await mockStickerCatalog(page);
  const finishLoading = await delayEmojiRuntime(page);
  await page.goto(
    '/e2e/fixtures/stickers.html?catalog=1&message-pack=fishprometheus'
  );
  const image = page.getByRole('button', {
    name: 'Открыть набор стикеров',
    exact: true
  });
  await expect(image).toBeVisible();
  if (isMobile) await image.tap();
  else await image.click();
  const smile = page.locator('.smile-button:visible');
  await smile.click();
  await expect(page.locator('.emoji-picker--open:visible')).toHaveCount(0);
  finishLoading();
  await expect(page.locator('.emoji-picker .v3-body')).toHaveCount(1);
  await smile.click();
  await expect(
    page.getByRole('button', { name: 'Эмодзи', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('region', { name: 'Каталог стикеров' })
  ).toHaveCount(0);
});

test('касание стикера не мешает прокрутке мобильного списка', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка прокрутки настоящими touch-событиями');
  await mockStickerCatalog(page);
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = await openPicker(page);
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  const item = picker.locator('.chat-sticker-picker__item').nth(5);
  const bounds = (await item.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }]
  });
  for (const distance of [20, 40, 70, 100]) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - distance }]
    });
    await page.waitForTimeout(20);
  }
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await expect
    .poll(() => picker.evaluate(element => element.scrollTop))
    .toBeGreaterThan(20);
  await expect(page.locator('.sticker-preview')).toHaveCount(0);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
});
