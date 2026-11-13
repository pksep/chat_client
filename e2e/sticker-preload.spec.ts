import { expect, test, type Page } from '@playwright/test';
import { mockStickerCatalog } from './fixtures/sticker-catalog';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const prepareTopic = async (page: Page) => {
  const state = await openFixture(page, { shell: true, count: 2 });
  const catalog = await mockStickerCatalog(page);
  const sticker = catalog.items.find(item => item.pack === 'fishprometheus')!;
  const rows = makeMessages('performance-0', 2).map(row => ({
    ...row,
    ex: ''
  }));
  rows[1].ex = JSON.stringify({
    kind: 'sticker',
    sticker: { ...sticker, asset: sticker }
  });
  await page.route('**/messages/topic/performance-0?*', route =>
    route.fulfill({ json: rows })
  );
  await page.evaluate(lastMessage => {
    (window as any).topicPerformance.getSelectedTopic(
      'performance-0'
    ).lastMessage = lastMessage;
  }, rows[1]);
  await openTopic(page, 0);
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible();
  return { ...state, catalog, sticker };
};

test('первый рендер редактора готовит набор последнего сообщения; повторное открытие сохраняет обложки и кадры', async ({
  page,
  isMobile
}) => {
  const { errors, sticker } = await prepareTopic(page);
  const staged = page.locator('.chat-sticker-picker--preparing');
  const animation = staged.locator(
    `[data-sticker-id="${sticker.id}"] .sticker-picker-image__animation`
  );
  await expect(animation).toHaveClass(/--loaded/, { timeout: 15000 });
  await expect(staged).toBeHidden();
  const cover = staged.locator(
    'button[aria-label="Рыба Прометей"] .sticker-pack-image__animation'
  );
  await expect(cover).toHaveClass(/--loaded/, { timeout: 15000 });
  await page.evaluate(() => {
    const canvas = document.querySelector(
      `[data-sticker-id="fishprometheus-0"] canvas`
    )!;
    const cover = document.querySelector(
      'button[aria-label="Рыба Прометей"] canvas'
    )!;
    (window as any).preparedStickerElements = {
      canvas,
      cover,
      frames: [],
      running: true
    };
    const sample = () => {
      const state = (window as any).preparedStickerElements;
      const panel = [...document.querySelectorAll('.emoji-picker--open')].find(
        element => element.getClientRects().length > 0
      );
      const mode = panel?.querySelector('.chat-sticker-picker__mode');
      if (mode && mode.getBoundingClientRect().width > 0) {
        const selected = [...mode.querySelectorAll('button')].find(
          button => button.textContent?.trim() === 'Стикеры'
        );
        state.frames.push({
          selected: selected?.getAttribute('aria-pressed') === 'true',
          item:
            canvas.isConnected &&
            canvas.classList.contains(
              'sticker-picker-image__animation--loaded'
            ),
          cover:
            cover.isConnected &&
            cover.classList.contains('sticker-pack-image__animation--loaded')
        });
      }
      if (state.running) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/stickers/packs', async route => {
    await ready;
    await route.fallback();
  });
  const image = page.locator(
    '[data-message-id="performance-0-message-1"] .message-sticker__image'
  );
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (isMobile) await image.tap();
      else await image.click();
      await expect(picker).toBeVisible();
      await expect(
        picker.locator(`[data-sticker-id="${sticker.id}"] canvas`)
      ).toHaveClass(/--loaded/);
      expect(
        await page.evaluate(() => {
          const state = (window as any).preparedStickerElements;
          return (
            state.canvas ===
              document.querySelector(
                '[data-sticker-id="fishprometheus-0"] canvas'
              ) &&
            state.cover ===
              document.querySelector(
                'button[aria-label="Рыба Прометей"] canvas'
              )
          );
        })
      ).toBe(true);
      await page.locator('.chat__input .smile-button:visible').click();
      await expect(picker).toHaveCount(0);
    }
  } finally {
    release();
  }
  const frames = await page.evaluate(() => {
    const state = (window as any).preparedStickerElements;
    state.running = false;
    return state.frames as {
      selected: boolean;
      item: boolean;
      cover: boolean;
    }[];
  });
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.every(frame => frame.selected && frame.item && frame.cover)
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('обложка категории берётся из thumbnail Telegram, движется и сохраняет полное разрешение экрана', async ({
  page
}) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const { errors, catalog } = await prepareTopic(page);
  const pack = catalog.packs.find(pack => pack.id === 'fishprometheus')!;
  const cover = page.locator(
    'button[aria-label="Рыба Прометей"] .sticker-pack-image__animation'
  );
  await expect(cover).toHaveClass(/--loaded/, { timeout: 15000 });
  await page.locator('.chat__input .smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const button = page
    .getByRole('region', { name: 'Каталог стикеров' })
    .getByRole('button', { name: 'Рыба Прометей', exact: true });
  await expect(button.locator('img')).toHaveCount(0);
  const resolution = await cover.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    return {
      width: canvas.width,
      expected: Math.round(bounds.width * devicePixelRatio),
      cssWidth: bounds.width,
      cssHeight: bounds.height
    };
  });
  expect(resolution.width).toBe(resolution.expected);
  expect(resolution.cssWidth).toBe(30);
  expect(resolution.cssHeight).toBe(30);
  const first = await cover.screenshot();
  await expect
    .poll(async () => first.equals(await cover.screenshot()))
    .toBe(false);
  expect(requests.some(url => url.includes(pack.thumbnail.path))).toBe(true);
  expect(errors).toEqual([]);
});
