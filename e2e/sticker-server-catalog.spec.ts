import { expect, test, type Page } from '@playwright/test';
import {
  fixtureSticker,
  stickerAnimationBytes,
  stickerPreviewBytes
} from './fixtures/sticker-catalog';

const originals = [
  fixtureSticker('fixture-cat', 'fixture', 'Кот'),
  fixtureSticker('fixture-fish', 'fixture', 'Рыба', 1)
];
const stickers = [
  {
    ...originals[0],
    id: 'server-cat',
    pack: 'server-cats',
    label: 'Кот с сервера',
    keywords: ['кот', 'cat']
  },
  {
    ...originals[1],
    id: 'server-fish',
    pack: 'server-fish',
    label: 'Рыба с сервера',
    keywords: ['рыба', 'fish']
  }
];

async function setup(page: Page) {
  const state = {
    status: 200,
    packs: [
      {
        id: 'server-cats',
        label: 'Серверные коты',
        count: 1,
        previewPath: originals[0].previewPath
      },
      {
        id: 'server-fish',
        label: 'Серверная рыба',
        count: 1,
        previewPath: originals[1].previewPath
      },
      {
        id: 'empty-pack',
        label: 'Пустой набор',
        count: 0,
        previewPath: originals[0].previewPath
      }
    ],
    ready: Promise.resolve()
  };
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.route('**/e2e/sticker-api/stickers**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/packs')) {
      await state.ready;
      return route.fulfill({
        status: state.status,
        json: { packs: state.packs }
      });
    }
    if (url.pathname.includes('/assets/')) {
      const path = url.pathname.split('/assets/')[1];
      return route.fulfill({
        body: path.endsWith('.webp')
          ? stickerAnimationBytes
          : stickerPreviewBytes,
        contentType: path.endsWith('.webp') ? 'image/webp' : 'image/png'
      });
    }
    if (url.pathname.endsWith('/resolve')) {
      const references = route.request().postDataJSON().references;
      return route.fulfill({
        json: {
          items: stickers.filter(sticker =>
            references.some((item: { id: string }) => item.id === sticker.id)
          )
        }
      });
    }
    const pack = url.searchParams.get('pack');
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const items = stickers.filter(
      sticker =>
        (!pack || sticker.pack === pack) &&
        (!query || sticker.keywords.some(word => word.startsWith(query)))
    );
    return route.fulfill({
      json: { items, nextCursor: null, total: items.length, revision: 'test' }
    });
  });
  await page.goto(
    '/e2e/fixtures/stickers.html?catalog=1&sticker-api=/e2e/sticker-api'
  );
  return { state, requests };
}

test('вкладка доступна всегда, категории приходят только с подключённого сервера', async ({
  page
}, testInfo) => {
  const { state, requests } = await setup(page);
  let release!: () => void;
  state.ready = new Promise(resolve => {
    release = resolve;
  });
  try {
    await page.locator('.smile-button:visible').click();
    const tab = page.getByRole('button', { name: 'Стикеры', exact: true });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.v3-body-inner:visible')).toBeVisible();
    await tab.press('Space');
    await expect(page.locator('.chat-sticker-picker__packs')).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Каталог стикеров' }).getByRole('status')
    ).toContainText('Загрузка стикеров');
    release();
    const picker = page.getByRole('region', { name: 'Каталог стикеров' });
    await expect(
      picker.locator('.chat-sticker-picker__packs button')
    ).toHaveCount(3);
    expect(
      await picker
        .locator('.chat-sticker-picker__packs button')
        .evaluateAll(buttons =>
          buttons.map(button => button.getAttribute('aria-label'))
        )
    ).toEqual(['Недавние', 'Серверные коты', 'Серверная рыба']);
    await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(1);
    await expect
      .poll(() =>
        picker
          .locator('img')
          .evaluateAll(images =>
            images.every(image => (image as HTMLImageElement).naturalWidth > 0)
          )
      )
      .toBe(true);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => {
        document.documentElement.setAttribute('data-theme', theme);
      }, theme);
      await page.locator('.emoji-picker--open:visible').screenshot({
        path: testInfo.outputPath(`server-sticker-filters-${theme}.png`)
      });
    }
    await picker
      .getByRole('button', { name: 'Серверная рыба', exact: true })
      .click();
    await expect(
      picker.getByRole('button', {
        name: 'Отправить стикер: Рыба с сервера',
        exact: true
      })
    ).toBeVisible();
    const search = page.locator('.v3-search input:visible');
    await search.fill('cat');
    await search.press('Space');
    await expect(search).toHaveValue('cat ');
    await search.press('Enter');
    await expect(picker).toBeVisible();
    await picker
      .getByRole('button', {
        name: 'Отправить стикер: Кот с сервера',
        exact: true
      })
      .press('Space');
    await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
    await expect
      .poll(() =>
        page
          .locator('.message-sticker__image img')
          .first()
          .evaluate(element => (element as HTMLImageElement).naturalWidth)
      )
      .toBeGreaterThan(0);
    expect(requests.some(url => /localhost:5173\/stickers/.test(url))).toBe(
      false
    );
    expect(requests.some(url => url.includes(':5174'))).toBe(false);
  } finally {
    release();
  }
});

for (const status of [200, 404, 500]) {
  test(`пустой каталог или ошибка ${status}: вкладка остаётся, локальные наборы не появляются`, async ({
    page
  }) => {
    const { state } = await setup(page);
    const availablePacks = state.packs;
    state.packs = [];
    state.status = status;
    const response = page.waitForResponse('**/e2e/sticker-api/stickers/packs');
    await page.locator('.smile-button:visible').click();
    await expect(page.locator('.v3-body-inner:visible')).toBeVisible();
    const tab = page.getByRole('button', { name: 'Стикеры', exact: true });
    await tab.click();
    await response;
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.v3-search input:visible')).toBeVisible();
    if (status === 200)
      await expect(
        page.getByText('Пока нет наборов стикеров', { exact: true })
      ).toBeVisible();
    else
      await expect(page.getByRole('alert')).toContainText(
        'Не удалось загрузить стикеры'
      );
    await expect(page.locator('.chat-sticker-picker__packs')).toHaveCount(0);
    await expect(page.locator('.chat-sticker-picker__item')).toHaveCount(0);
    if (status !== 200) {
      state.status = 200;
      state.packs = availablePacks;
      await page
        .getByRole('button', { name: 'Повторить', exact: true })
        .click();
      await expect(page.locator('.chat-sticker-picker__item')).toHaveCount(1);
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
  });
}

test('попап всегда открывается на эмодзи и очищает старые категории при пустом ответе сервера', async ({
  page
}) => {
  const { state } = await setup(page);
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await expect(page.locator('.chat-sticker-picker__item')).toHaveCount(1);
  await page.locator('.smile-button:visible').click();
  state.packs = [];
  const response = page.waitForResponse('**/e2e/sticker-api/stickers/packs');
  await page.locator('.smile-button:visible').click();
  const tab = page.getByRole('button', { name: 'Стикеры', exact: true });
  await expect(tab).toBeVisible();
  await expect(tab).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.v3-body-inner:visible')).toBeVisible();
  await tab.click();
  await response;
  await expect(
    page.getByText('Пока нет наборов стикеров', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.chat-sticker-picker__item')).toHaveCount(0);
  await expect(page.locator('.chat-sticker-picker__packs')).toHaveCount(0);
});
