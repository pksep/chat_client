import { expect, test } from '@playwright/test';
import { mockStickerCatalog } from './fixtures/sticker-catalog';

test.beforeEach(async ({ page }) => {
  await mockStickerCatalog(page);
});

test('фильтры прокручиваются мышью и колёсиком без случайного выбора набора', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  const filters = picker.locator('.chat-sticker-picker__packs');
  const sep = filters.getByRole('button', { name: 'SEP', exact: true });
  const selectedPack = () => filters.locator('button[aria-pressed="true"]');
  const bounds = (await filters.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 16);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(await picker.evaluate(element => element.scrollTop)).toBe(0);
  await expect(selectedPack()).toHaveText('SEP');
  await page.mouse.wheel(0, -1000);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBe(0);
  const dragBounds = (await filters
    .getByRole('button', { name: 'Коты', exact: true })
    .locator('img')
    .boundingBox())!;
  const startX = dragBounds.x + dragBounds.width / 2;
  const startY = dragBounds.y + dragBounds.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 160, startY, { steps: 12 });
  await expect(filters).toHaveClass(/--dragging/);
  await page.mouse.up();
  await expect(filters).not.toHaveClass(/--dragging/);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(selectedPack()).toHaveText('SEP');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await filters
    .getByRole('button', { name: 'Коты', exact: true })
    .locator('img')
    .click();
  await expect(selectedPack()).toHaveText('Коты');
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 16);
  await page.mouse.wheel(-1000, 0);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBe(0);
  await sep.press('Space');
  await expect(selectedPack()).toHaveText('SEP');
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
});

test('пробелы в поиске и выбор набора клавиатурой не закрывают пикер', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  const search = page.locator('.v3-search input:visible');
  await search.click();
  await search.pressSequentially('Хомяк');
  await expect(search).toBeFocused();
  await page.keyboard.press('Space');
  await expect(picker).toBeVisible();
  await expect(search).toHaveValue('Хомяк ');
  await page.keyboard.type('120');
  await expect(
    picker.getByRole('button', {
      name: 'Отправить стикер: Хомяк 120',
      exact: true
    })
  ).toBeVisible();
  await picker.getByRole('button', { name: 'SEP', exact: true }).press('Space');
  await expect(picker).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  await search.click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(search).toHaveValue('  ');
  await page.keyboard.press('Enter');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await picker.getByRole('button', { name: 'SEP', exact: true }).press('Enter');
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await picker.locator('.chat-sticker-picker__item').first().press('Space');
  await expect(picker).toHaveCount(0);
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
});

test('фильтры наборов: оформление, прокрутка и переключение в обеих темах', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  const filters = picker.locator('.chat-sticker-picker__packs');
  const sep = filters.getByRole('button', { name: 'SEP', exact: true });
  const last = filters.getByRole('button', {
    name: 'Радужный единорог',
    exact: true
  });
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('button', {
        name: theme === 'light' ? 'Светлая тема' : 'Тёмная тема',
        exact: true
      })
      .click();
    await page.locator('.smile-button:visible').click();
    await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
    await sep.click();
    await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
    const appearance = await sep.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        borderColor: style.borderColor,
        color: style.color
      };
    });
    expect(appearance.height).toBe(32);
    expect(appearance.radius).toBe('20px');
    expect(appearance.fontSize).toBe('14px');
    expect(appearance.borderColor).toBe(appearance.color);
    await expect
      .poll(() =>
        picker
          .locator('img')
          .evaluateAll(images =>
            images.every(image => (image as HTMLImageElement).naturalWidth > 0)
          )
      )
      .toBe(true);
    const previews = filters.locator('img');
    await expect(previews).toHaveCount(
      (await filters.getByRole('button').count()) - 1
    );
    expect(
      await previews.evaluateAll(images =>
        images.every(image => {
          const bounds = image.getBoundingClientRect();
          const button = image.closest('button')!.getBoundingClientRect();
          return (
            bounds.width === 16 &&
            bounds.height === 16 &&
            Math.abs(
              bounds.y + bounds.height / 2 - (button.y + button.height / 2)
            ) < 1 &&
            !(image as HTMLImageElement).draggable
          );
        })
      )
    ).toBe(true);
    await page.mouse.move(0, 0);
    await page.locator('.emoji-picker--open:visible').screenshot({
      path: testInfo.outputPath(`sticker-filters-${theme}.png`)
    });
    await last.click();
    await expect(last).toHaveAttribute('aria-pressed', 'true');
    expect(
      await filters.evaluate(element => element.scrollLeft)
    ).toBeGreaterThan(0);
    await expect(
      picker.locator('.chat-sticker-picker__item').first()
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.locator('.smile-button:visible').click();
  }
});

test('новый серверный набор появляется при повторном открытии пикера без обновления страницы', async ({
  page
}) => {
  let added = false;
  await page.route('**/stickers/packs', async route => {
    const data = {
      packs: [
        {
          id: 'sep-robots',
          label: 'SEP',
          count: 15,
          previewPath: `objects/${'a'.repeat(64)}.png`
        }
      ]
    };
    if (added)
      data.packs.push({
        id: 'production-test',
        label: 'Новый набор',
        count: 1,
        previewPath: data.packs[0].previewPath
      });
    await route.fulfill({ json: data });
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  await expect(
    picker.getByRole('button', { name: 'Новый набор', exact: true })
  ).toHaveCount(0);
  await page.locator('.smile-button:visible').click();
  await expect(picker).toHaveCount(0);
  added = true;
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Новый набор', exact: true })
  ).toBeVisible();
});

test('серверные наборы: страницы, поиск, отправка, недавние и сохранение черновика', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker).toBeVisible();
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  await picker.getByRole('button', { name: 'Коты', exact: true }).click();
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
  await expect
    .poll(() => picker.locator('.chat-sticker-picker__item').count())
    .toBeLessThan(70);
  const animated = picker.locator('.sticker-picker-image__animation');
  await expect(animated.first()).toBeVisible();
  expect(await animated.count()).toBeLessThan(35);
  expect(requests.filter(url => url.endsWith('.tgs')).length).toBeLessThan(35);
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      picker
        .locator('.chat-sticker-picker__grid')
        .evaluate(element => element.clientHeight)
    )
    .toBeGreaterThan(700);
  await expect
    .poll(() => picker.locator('.chat-sticker-picker__item').count())
    .toBeLessThan(70);
  const search = page.locator('.v3-search input:visible');
  await search.fill('Хомяк 120');
  const item = picker.getByRole('button', {
    name: 'Отправить стикер: Хомяк 120',
    exact: true
  });
  await expect(item).toBeVisible();
  const pickerVideo = item.locator('video');
  await expect(pickerVideo).toHaveAttribute('loop', '');
  await expect
    .poll(() =>
      pickerVideo.evaluate(element => (element as HTMLVideoElement).readyState)
    )
    .toBeGreaterThanOrEqual(2);
  await item.click();
  const video = page.locator('.message-sticker__image video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('loop', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect
    .poll(() =>
      video.evaluate(element => (element as HTMLVideoElement).readyState)
    )
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator('.emoji-picker--open')).toHaveCount(0);
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await picker.getByRole('button', { name: 'Недавние', exact: true }).click();
  await expect(
    picker.getByRole('button', {
      name: 'Отправить стикер: Хомяк 120',
      exact: true
    })
  ).toBeVisible();
});

test('видимая анимация в пикере движется без статичной картинки позади', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  const item = picker.locator('.chat-sticker-picker__item').first();
  const animation = item.locator('.sticker-picker-image__animation');
  await expect(animation).toHaveClass(/--loaded/, { timeout: 15000 });
  await expect(item.locator('img')).toHaveCount(0);
  const firstFrame = await animation.screenshot();
  await expect
    .poll(async () => firstFrame.equals(await animation.screenshot()), {
      timeout: 6000
    })
    .toBe(false);
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(item.locator('.sticker-picker-image__animation')).toHaveCount(0);
});

test('рыба: оригинальная анимация появляется без изменения размера', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  const search = page.locator('.v3-search input:visible');
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  const sticker = {
    label: 'Рыба Прометей 1',
    path: `objects/${(3001).toString(16).padStart(64, '0')}.tgs`
  };
  await page.route(`**/assets/${sticker.path}`, async route => {
    await ready;
    await route.fallback();
  });
  try {
    await search.fill('FISH');
    await expect(
      picker.getByRole('button', {
        name: `Отправить стикер: ${sticker.label}`,
        exact: true
      })
    ).toBeVisible();
    await picker
      .getByRole('button', {
        name: `Отправить стикер: ${sticker.label}`,
        exact: true
      })
      .click();
    const image = page.locator('.message-sticker__image');
    await expect
      .poll(() =>
        image
          .locator('img')
          .first()
          .evaluate(element => (element as HTMLImageElement).naturalWidth)
      )
      .toBeGreaterThan(0);
    const before = await image.boundingBox();
    release();
    await expect(image.locator('.message-sticker__animation')).toHaveClass(
      /--loaded/,
      { timeout: 15000 }
    );
    expect(await image.boundingBox()).toEqual(before);
    await expect(page.locator('.message__article__media')).toHaveCount(0);
    await expect(page.locator('.emoji-picker--open')).toHaveCount(0);
  } finally {
    release();
  }
});
