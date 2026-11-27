import { expect, test } from '@playwright/test';
import { fixtureSticker, mockStickerCatalog } from './fixtures/sticker-catalog';

test.beforeEach(async ({ page }) => {
  const catalog = await mockStickerCatalog(page);
  catalog.packs.splice(
    catalog.packs.length - 1,
    0,
    ...Array.from({ length: 4 }, (_, index) => ({
      ...catalog.packs[5],
      id: `extra-${index}`,
      label: `Набор ${index}`
    }))
  );
});

test('стикеры и обложки видны статично, пока медленная анимация загружается', async ({
  page
}) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(/\/stickers\/assets\/.*\.tgs$/, async route => {
    await gate;
    await route.fallback();
  });
  try {
    await page.goto('/e2e/fixtures/stickers.html?catalog=1');
    await page.locator('.smile-button:visible').click();
    await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Каталог стикеров' });
    await picker
      .getByRole('button', { name: 'Рыба Прометей', exact: true })
      .click();
    const sticker = picker.locator('[data-sticker-id="fishprometheus-0"]');
    const preview = sticker.locator(
      '.sticker-picker-image > img:not(.sticker-picker-image__animation)'
    );
    const cover = picker
      .getByRole('button', { name: 'Рыба Прометей', exact: true })
      .locator('.sticker-pack-image > img');
    await expect(preview).toBeVisible();
    await expect(cover).toBeVisible();
    for (const image of [preview, cover]) {
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0
          )
        )
        .toBe(true);
    }
    release();
    await expect(
      sticker.locator('.sticker-picker-image__animation')
    ).toHaveClass(/--loaded/);
    await expect(preview).toHaveCount(0);
    await expect(
      picker
        .getByRole('button', { name: 'Рыба Прометей', exact: true })
        .locator('.sticker-pack-image__animation')
    ).toHaveClass(/--loaded/);
    await expect(cover).toHaveCount(0);
  } finally {
    release();
  }
});

test('первый клик по вкладке сохраняется до появления асинхронного body пикера', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  const tab = page.getByRole('button', { name: 'Стикеры', exact: true });
  await expect(tab).toBeVisible();
  await page.evaluate(() => {
    const body = document.querySelector('.emoji-picker--open .v3-body')!;
    const marker = document.createComment('Отложенное содержимое UI-kit');
    body.replaceWith(marker);
    (window as any).restoreStickerBody = () => marker.replaceWith(body);
  });
  await page.waitForTimeout(30);
  try {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await page.evaluate(() => (window as any).restoreStickerBody());
  }
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker).toBeVisible();
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
});

test('стикеры загружаются после временного сбоя и возвращения сети', async ({
  page
}) => {
  let failures = 0;
  let unavailable = true;
  await page.route(/\/stickers\?/, route => {
    failures++;
    return unavailable
      ? route.fulfill({ status: 503, body: '' })
      : route.fallback();
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Коты', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Не удалось загрузить стикеры' })
  ).toBeVisible();
  expect(failures).toBeGreaterThanOrEqual(3);
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Не удалось загрузить стикеры' })
  ).toHaveCount(0);
});

test('каталог стикеров обновляет истёкший токен и повторяет запрос', async ({
  page
}) => {
  let refreshes = 0;
  let staleRequests = 0;
  let freshRequests = 0;
  await page.route(/\/stickers\/packs$/, route => {
    const token = route.request().headers().authorization || '';
    if (token.endsWith('.old')) {
      staleRequests++;
      return route.fulfill({ status: 401, body: '' });
    }
    if (token.endsWith('.new')) freshRequests++;
    return route.fallback();
  });
  let nextToken = '';
  await page.route('**/__sticker-auth/auth/refresh', route => {
    refreshes++;
    return route.fulfill({
      json: {
        token: nextToken,
        user: { id: 'sticker-auth-user', initials: 'Тест' }
      }
    });
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  nextToken = await page.evaluate(async () => {
    const configPath = '/src/services/useConfig.ts';
    const authPath = '/src/composables/useAuth.ts';
    const loginPath = '/src/composables/useLogin.ts';
    (await import(/* @vite-ignore */ configPath)).setConfig({
      CHAT_API_DOMAIN: '/__sticker-auth'
    });
    const { saveChatAuthSession } = await import(/* @vite-ignore */ authPath);
    const { setAuthToken } = await import(/* @vite-ignore */ loginPath);
    const makeToken = (suffix: string) =>
      [
        btoa(JSON.stringify({ alg: 'RS256', kid: 'fixture' })),
        btoa(
          JSON.stringify({
            sub: 'sticker-auth-user',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 900
          })
        ),
        suffix
      ].join('.');
    const oldToken = makeToken('old');
    setAuthToken(oldToken, 900);
    saveChatAuthSession({
      token: oldToken,
      user: { id: 'sticker-auth-user', initials: 'Тест' },
      source: 'chat_credentials'
    });
    return makeToken('new');
  });
  const count = await page.evaluate(async () => {
    const path = '/src/services/sticker-catalog.ts';
    return (await (await import(/* @vite-ignore */ path)).loadStickerPacks())
      .packs.length;
  });
  expect(count).toBeGreaterThan(0);
  expect({ refreshes, staleRequests, freshRequests }).toEqual({
    refreshes: 1,
    staleRequests: 1,
    freshRequests: 1
  });
});

test('Коты: сбой следующей страницы сохраняет список, повтор загружает ту же страницу', async ({
  page
}) => {
  let unavailable = true;
  const cursors: string[] = [];
  await page.route(/\/stickers\?/, route => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    if (cursor) {
      cursors.push(cursor);
      if (unavailable) return route.fulfill({ status: 503, body: '' });
    }
    return route.fallback();
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker.getByRole('button', { name: 'Коты', exact: true }).click();
  const grid = picker.locator('.chat-sticker-picker__grid');
  await expect(grid).toHaveCSS('height', '690px');
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(picker.getByRole('alert')).toBeVisible();
  await expect(grid).toBeVisible();
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
  unavailable = false;
  await picker.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(picker.getByRole('alert')).toHaveCount(0);
  await expect(grid).toHaveCSS('height', '1390px');
  expect(cursors).toEqual(['48', '48', '48', '48']);
});

test('Коты: устаревший курсор обновляет кэш и восстанавливает страницы каталога', async ({
  page
}) => {
  let revision = 'old';
  let firstPages = 0;
  let staleCursors = 0;
  const pack = 'ccccccccccaaaaaaaaaatss';
  const items = Array.from({ length: 100 }, (_, index) =>
    fixtureSticker(`${pack}-${index}`, pack, `Коты ${index + 1}`, index, 'tgs')
  );
  await page.route(/\/stickers\?/, async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pack') !== pack) return route.fallback();
    const cursor = url.searchParams.get('cursor');
    if (cursor && !cursor.startsWith(`${revision}:`)) {
      staleCursors++;
      return route.fulfill({
        status: 400,
        json: { message: 'Страница каталога устарела', statusCode: 400 }
      });
    }
    if (!cursor) firstPages++;
    const offset = cursor ? Number(cursor.split(':')[1]) : 0;
    return route.fulfill({
      json: {
        items: items.slice(offset, offset + 48),
        nextCursor:
          offset + 48 < items.length ? `${revision}:${offset + 48}` : null,
        total: items.length,
        revision
      }
    });
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker.getByRole('button', { name: 'Коты', exact: true }).click();
  const grid = picker.locator('.chat-sticker-picker__grid');
  await expect(grid).toHaveCSS('height', '690px');
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(grid).toHaveCSS('height', '1390px');
  revision = 'new';
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => firstPages).toBe(2);
  await expect(grid).toHaveCSS('height', '690px');
  await expect(picker.getByRole('alert')).toHaveCount(0);
  await picker.evaluate(element => {
    element.scrollTop = 0;
  });
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(grid).toHaveCSS('height', '1390px');
  expect(staleCursors).toBe(1);
});

test('Коты: кэш первой страницы учитывает скрытые наборы в курсоре', async ({
  page
}) => {
  const pack = 'ccccccccccaaaaaaaaaatss';
  const items = Array.from({ length: 100 }, (_, index) =>
    fixtureSticker(`${pack}-${index}`, pack, `Коты ${index + 1}`, index, 'tgs')
  );
  const firstPages: string[][] = [];
  await page.route(/\/stickers\?/, route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pack') !== pack) return route.fallback();
    const excluded = (url.searchParams.get('excludePacks') || '')
      .split(',')
      .filter(Boolean)
      .sort();
    const scope = JSON.stringify(excluded);
    const cursor = url.searchParams.get('cursor');
    if (cursor && !cursor.endsWith(`:${scope}`))
      return route.fulfill({
        status: 400,
        json: { message: 'Страница каталога устарела' }
      });
    if (!cursor) firstPages.push(excluded);
    const offset = cursor ? Number(cursor.split(':')[0]) : 0;
    return route.fulfill({
      json: {
        items: items.slice(offset, offset + 48),
        nextCursor:
          offset + 48 < items.length ? `${offset + 48}:${scope}` : null,
        total: items.length,
        revision: 'test'
      }
    });
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker.getByRole('button', { name: 'Коты', exact: true }).click();
  const grid = picker.locator('.chat-sticker-picker__grid');
  await expect(grid).toHaveCSS('height', '690px');
  await page.evaluate(() =>
    (window as any).stickerFixture.hidePacks(['hamster'])
  );
  await expect.poll(() => firstPages).toEqual([[], ['hamster']]);
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(grid).toHaveCSS('height', '1390px');
  await expect(picker.getByRole('alert')).toHaveCount(0);
  expect(firstPages).toEqual([[], ['hamster']]);
});

test('переключатель из макета меняет режим, работает с клавиатуры и открывается на эмодзи', async ({
  page
}, testInfo) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  const smile = page.locator('.smile-button:visible');
  await smile.click();
  const emoji = page.getByRole('button', { name: 'Эмодзи', exact: true });
  const stickers = page.getByRole('button', { name: 'Стикеры', exact: true });
  const mode = page.getByRole('group', { name: 'Выбор эмодзи или стикеров' });
  await expect(emoji).toHaveAttribute('aria-pressed', 'true');
  expect(await mode.boundingBox()).toMatchObject({ height: 43 });
  expect(await emoji.boundingBox()).toMatchObject({ height: 32 });
  await expect(mode).toHaveCSS('border-top-style', 'solid');
  await expect(page.locator('.emoji-picker--open .v3-footer')).toBeHidden();
  const popup = page.locator('.emoji-picker--open .v3-emoji-picker');
  const emojiPopupBox = (await popup.boundingBox())!;
  const emojiGroups = page.locator(
    '.emoji-picker--open .v3-header > .v3-groups'
  );
  await expect(emojiGroups).toBeVisible();
  const nativeRecentIcon = await emojiGroups
    .locator('.v3-group')
    .first()
    .locator('img')
    .evaluate(element => ({
      src: (element as HTMLImageElement).src,
      content: getComputedStyle(element).content
    }));
  await emoji.press('ArrowRight');
  await expect(stickers).toHaveAttribute('aria-pressed', 'true');
  await expect(emojiGroups).toBeHidden();
  const filters = page.locator('.chat-sticker-picker__packs');
  await expect(filters.getByRole('button').first()).toHaveAttribute(
    'aria-label',
    'Недавние'
  );
  expect(
    await filters
      .locator('.chat-sticker-picker__recent img')
      .evaluate(element => ({
        src: (element as HTMLImageElement).src,
        content: getComputedStyle(element).content
      }))
  ).toEqual(nativeRecentIcon);
  const modeBox = (await mode.boundingBox())!;
  const filterBox = (await filters.boundingBox())!;
  expect(filterBox.y + filterBox.height).toBeLessThan(modeBox.y);
  const search = page.locator('.v3-search input:visible');
  const searchBox = (await search.boundingBox())!;
  expect(searchBox.y - (filterBox.y + filterBox.height)).toBeCloseTo(15, 1);
  expect((await popup.boundingBox())!.width).toBeLessThanOrEqual(359);
  expect(await popup.boundingBox()).toEqual(emojiPopupBox);
  for (const theme of ['light', 'dark']) {
    await smile.click();
    await page
      .getByRole('button', {
        name: theme === 'light' ? 'Светлая тема' : 'Тёмная тема',
        exact: true
      })
      .click();
    await smile.click();
    await expect(emoji).toHaveAttribute('aria-pressed', 'true');
    const reopenedEmojiBox = (await popup.boundingBox())!;
    await stickers.click();
    await expect(page.locator('.chat-sticker-picker__item')).toHaveCount(15);
    expect(await mode.boundingBox()).toMatchObject({ height: 43 });
    expect(await popup.boundingBox()).toEqual(reopenedEmojiBox);
    await popup.screenshot({
      path: testInfo.outputPath(`sticker-mode-${theme}.png`)
    });
  }
  await stickers.press('ArrowLeft');
  await expect(emoji).toHaveAttribute('aria-pressed', 'true');
  await expect(emojiGroups).toBeVisible();
  await stickers.click();
  await expect(stickers).toHaveAttribute('aria-pressed', 'true');
  await smile.click();
  await smile.click();
  await expect(emoji).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chat-sticker-picker')).toBeHidden();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
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
  await expect(selectedPack()).toHaveAttribute('aria-label', 'SEP');
  await page.mouse.wheel(0, -1000);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBe(0);
  const dragBounds = (await filters
    .getByRole('button', { name: 'Коты', exact: true })
    .locator('.chat-sticker-picker__pack-preview')
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
  await expect(selectedPack()).toHaveAttribute('aria-label', 'SEP');
  await expect(picker).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 0');
  await filters
    .getByRole('button', { name: 'Коты', exact: true })
    .locator('.chat-sticker-picker__pack-preview')
    .click();
  await expect(selectedPack()).toHaveAttribute('aria-label', 'Коты');
  await expect(
    picker.locator('.chat-sticker-picker__item').first()
  ).toBeVisible();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 16);
  await page.mouse.wheel(-1000, 0);
  await expect
    .poll(() => filters.evaluate(element => element.scrollLeft))
    .toBe(0);
  await sep.press('Space');
  await expect(selectedPack()).toHaveAttribute('aria-label', 'SEP');
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
});

test('набор до 15 стикеров помещается целиком, а большой набор прокручивается и подгружается', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(15);
  await expect(picker.getByRole('status')).toHaveCount(0);
  await expect
    .poll(() =>
      picker.evaluate(element => element.scrollHeight - element.clientHeight)
    )
    .toBe(0);
  expect(
    await picker.locator('.chat-sticker-picker__item').evaluateAll(items => {
      const bounds = items[0]
        .closest('.chat-sticker-picker')!
        .getBoundingClientRect();
      return items.every(item => {
        const rect = item.getBoundingClientRect();
        return (
          rect.top >= bounds.top &&
          rect.bottom <= bounds.bottom &&
          rect.width > 40 &&
          rect.height > 40
        );
      });
    })
  ).toBe(true);
  await picker.getByRole('button', { name: 'Цветы', exact: true }).click();
  await expect(picker.locator('.chat-sticker-picker__item')).toHaveCount(1);
  await expect
    .poll(() =>
      picker.evaluate(element => element.scrollHeight - element.clientHeight)
    )
    .toBe(0);
  await picker.getByRole('button', { name: 'Коты', exact: true }).click();
  await expect
    .poll(() =>
      picker.evaluate(element => element.scrollHeight - element.clientHeight)
    )
    .toBeGreaterThan(0);
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
    expect(appearance.height).toBe(30);
    expect(appearance.radius).toBe('5px');
    expect(
      await sep.evaluate(element => getComputedStyle(element, '::after').height)
    ).toBe('2px');
    await expect
      .poll(() =>
        picker
          .locator('img')
          .evaluateAll(images =>
            images.every(image => (image as HTMLImageElement).naturalWidth > 0)
          )
      )
      .toBe(true);
    const previews = filters.locator('.chat-sticker-picker__pack-preview');
    await expect(previews).toHaveCount(
      (await filters.getByRole('button').count()) - 1
    );
    expect(
      await previews.evaluateAll(images =>
        images.every(image => {
          const bounds = image.getBoundingClientRect();
          const button = image.closest('button')!.getBoundingClientRect();
          return (
            bounds.width === 30 &&
            bounds.height === 30 &&
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
  expect(await animated.count()).toBeLessThan(55);
  expect(requests.filter(url => url.endsWith('.tgs')).length).toBeLessThan(55);
  expect(
    page
      .workers()
      .filter(worker => worker.url().includes('sticker-preview.worker')).length
  ).toBeLessThanOrEqual(2);
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
  const item = picker.locator('[data-sticker-id="fishprometheus-0"]');
  const animation = item.locator('.sticker-picker-image__animation');
  await expect(animation).toHaveClass(/--loaded/, { timeout: 15000 });
  await expect(item.locator('img')).toHaveCount(0);
  const canvas = animation.locator('canvas').or(item.locator('canvas'));
  const resolution = await item.locator('canvas').evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    const pixels = canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    return {
      width: canvas.width,
      height: canvas.height,
      expectedWidth: Math.round(bounds.width * devicePixelRatio),
      expectedHeight: Math.round(bounds.height * devicePixelRatio),
      transparent: pixels[3] === 0,
      painted: pixels.some((value, index) => index % 4 === 3 && value > 0)
    };
  });
  expect(resolution.width).toBe(resolution.expectedWidth);
  expect(resolution.height).toBe(resolution.expectedHeight);
  expect(resolution.transparent && resolution.painted).toBe(true);
  await expect(canvas.first()).toBeVisible();
  const firstFrame = await animation.screenshot();
  await expect
    .poll(async () => firstFrame.equals(await animation.screenshot()), {
      timeout: 6000
    })
    .toBe(false);
  await picker.evaluate(element => {
    element.scrollTop = 90;
  });
  await expect(animation).toHaveClass(/--loaded/);
  await expect(item.locator('img')).toHaveCount(0);
  await picker.evaluate(element => {
    element.scrollTop = 0;
  });
  await expect(animation).toHaveClass(/--loaded/);
  await picker.evaluate(element => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(item).toHaveCount(0);
});

test('пикер сохраняет анимацию при недоступном Worker и освобождает проигрыватели после закрытия', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('Worker недоступен');
      }
    } as typeof Worker;
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  const item = picker.locator('[data-sticker-id="fishprometheus-0"]');
  await expect(item.locator('.sticker-picker-image__animation')).toHaveClass(
    /--loaded/,
    { timeout: 15000 }
  );
  await expect(item.locator('svg')).toBeVisible();
  await expect(item.locator('img')).toHaveCount(0);
  const frame = await item.screenshot();
  await expect
    .poll(async () => frame.equals(await item.screenshot()))
    .toBe(false);
  await page.locator('.smile-button:visible').click();
  await expect(picker).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('закрытие во время загрузки и повторное открытие не накапливают Worker', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/*.tgs', async route => {
    await ready;
    await route.fallback();
  });
  await page.goto('/e2e/fixtures/stickers.html?catalog=1');
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  await expect(picker.locator('canvas').first()).toBeVisible();
  await page.locator('.smile-button:visible').click();
  release();
  for (let index = 0; index < 3; index++) {
    await page.locator('.smile-button:visible').click();
    await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
    await picker
      .getByRole('button', { name: 'Рыба Прометей', exact: true })
      .click();
    await expect(
      picker.locator('.sticker-picker-image__animation').first()
    ).toHaveClass(/--loaded/, { timeout: 15000 });
    expect(
      page
        .workers()
        .filter(worker => worker.url().includes('sticker-preview.worker'))
        .length
    ).toBeLessThanOrEqual(2);
    await page.locator('.smile-button:visible').click();
  }
  await page.evaluate(() => (window as any).stickerFixture.unmount());
  await expect
    .poll(
      () =>
        page
          .workers()
          .filter(worker => worker.url().includes('sticker-preview.worker'))
          .length,
      { timeout: 8000 }
    )
    .toBe(0);
  expect(errors).toEqual([]);
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
