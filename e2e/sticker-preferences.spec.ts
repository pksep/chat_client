import { expect, test, type Page } from '@playwright/test';
import { mockStickerCatalog } from './fixtures/sticker-catalog';

async function setup(page: Page, missingLapenkoPreview = false) {
  const catalog = await mockStickerCatalog(page);
  if (missingLapenkoPreview) {
    catalog.packs.find(pack => pack.id === 'all-lapenko')!.previewPath =
      'objects/missing-lapenko-test.webp';
    await page.route('**/assets/objects/missing-lapenko-test.webp', route =>
      route.fulfill({ status: 404, body: '' })
    );
  }
  const user = {
    id: 'c9c83fe9-08e1-4ea2-906c-2d71b3dd656e',
    initials: 'Тестовый пользователь',
    nickname: 'sticker-preferences',
    ex: { theme: 'light', customStatusPresets: [] },
    status: null,
    avatarUrl: null
  };
  const changes: unknown[] = [];
  let failSave = false;
  await page.route('**/e2e/sticker-preferences-api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/stickers')) return route.fallback();
    if (path.endsWith('/users/current')) return route.fulfill({ json: user });
    if (path.endsWith('/users') && route.request().method() === 'PATCH') {
      const patch = route.request().postDataJSON();
      changes.push(patch);
      if (failSave)
        return route.fulfill({
          status: 500,
          json: { message: 'Ошибка сохранения' }
        });
      user.ex = { ...user.ex, ...patch.ex };
      return route.fulfill({ json: user });
    }
    if (path.includes('/backgrounds/')) return route.fulfill({ json: [] });
    return route.fulfill({ json: { data: [], items: [], nextCursor: null } });
  });
  await page.goto('/e2e/fixtures/sticker-preferences.html?catalog=1');
  const trigger = page.getByRole('button', {
    name: 'Отображение стикеров',
    exact: true
  });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(
    page.getByRole('checkbox', { name: 'SEP', exact: true })
  ).toBeChecked();
  return {
    changes,
    fail: (value: boolean) => {
      failSave = value;
    }
  };
}

test('выбор сохраняется в профиле, убирает набор из пикера, поиска и недавних, сохраняя сообщения', async ({
  page
}) => {
  const state = await setup(page);
  const picker = page.getByRole('region', { name: 'Каталог стикеров' });
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await picker
    .getByRole('button', { name: 'Рыба Прометей', exact: true })
    .click();
  await picker.locator('.chat-sticker-picker__item').first().click();
  await expect(page.locator('.message-sticker__image')).toHaveCount(1);

  const fish = page.getByRole('checkbox', {
    name: 'Рыба Прометей',
    exact: true
  });
  await fish.uncheck();
  await expect(fish).toBeEnabled();
  expect(state.changes).toEqual([
    { ex: { hiddenStickerPacks: ['fishprometheus'] } }
  ]);
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Рыба Прометей', exact: true })
  ).toHaveCount(0);
  const search = page.locator('.v3-search input:visible');
  await search.fill('FishPrometheus');
  await expect(
    picker.getByText('Стикеры не найдены', { exact: true })
  ).toBeVisible();
  await picker.getByRole('button', { name: 'Недавние', exact: true }).click();
  await expect(
    picker.getByText('Пока нет недавних стикеров', { exact: true })
  ).toBeVisible();
  await expect(page.locator('.message-sticker__image')).toHaveCount(1);

  await page.reload();
  await page
    .getByRole('button', { name: 'Отображение стикеров', exact: true })
    .click();
  await expect(fish).not.toBeChecked();
  await fish.check();
  await expect(fish).toBeEnabled();
  await page.locator('.smile-button:visible').click();
  await page.getByRole('button', { name: 'Стикеры', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Рыба Прометей', exact: true })
  ).toBeVisible();
});

test('ошибка сохранения восстанавливает чекбокс, а повторы и оба оформления работают', async ({
  page
}) => {
  const state = await setup(page);
  const sep = page.getByRole('checkbox', { name: 'SEP', exact: true });
  state.fail(true);
  await sep.uncheck();
  await expect(page.getByRole('alert')).toHaveText(
    'Не удалось сохранить выбор стикеров. Попробуйте ещё раз'
  );
  await expect(sep).toBeChecked();
  await expect(sep).toBeEnabled();
  state.fail(false);
  await sep.uncheck();
  await expect(sep).toBeEnabled();
  await expect(sep).not.toBeChecked();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const last = page.getByRole('checkbox', {
    name: 'Радужный единорог',
    exact: true
  });
  await last.uncheck();
  await expect(last).toBeEnabled();
  await expect(last).not.toBeChecked();
  await expect
    .poll(() =>
      page
        .locator('.menu-profile__sticker-option img')
        .evaluateAll(images =>
          images.every(image => (image as HTMLImageElement).naturalWidth > 0)
        )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
  const list = page.getByRole('group', {
    name: 'Отображение наборов стикеров'
  });
  const darkColor = await list.evaluate(
    element => getComputedStyle(element).backgroundColor
  );
  await page.getByRole('button', { name: 'Светлая тема', exact: true }).click();
  expect(
    await list.evaluate(element => getComputedStyle(element).backgroundColor)
  ).not.toBe(darkColor);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(
    await page
      .locator('.menu-profile__sticker-option')
      .first()
      .evaluate(element => element.getBoundingClientRect().height)
  ).toBe(44);
  await page
    .getByRole('button', { name: 'Отображение стикеров', exact: true })
    .press('Escape');
  await expect(list).toBeHidden();
});

test('чекбокс UI переключается один раз с строки и клавиатуры, а Лапенко имеет запасное превью', async ({
  page
}, testInfo) => {
  const state = await setup(page, true);
  const checkbox = page.getByRole('checkbox', { name: 'Лапенко', exact: true });
  const row = page
    .locator('.menu-profile__sticker-option')
    .filter({ has: checkbox });
  const image = row.locator('img');
  await expect
    .poll(() =>
      image.evaluate(element => (element as HTMLImageElement).naturalWidth)
    )
    .toBeGreaterThan(0);
  await row.locator('.menu-profile__sticker-label').click();
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).not.toBeChecked();
  expect(state.changes).toHaveLength(1);
  await checkbox.press('Space');
  await expect(checkbox).toBeEnabled();
  await expect(checkbox).toBeChecked();
  expect(state.changes).toHaveLength(2);
  await checkbox.uncheck();
  await expect(checkbox).toBeEnabled();
  expect(state.changes).toHaveLength(3);
  const list = page.getByRole('group', {
    name: 'Отображение наборов стикеров'
  });
  for (const theme of ['light', 'dark']) {
    await page
      .getByRole('button', {
        name: theme === 'light' ? 'Светлая тема' : 'Тёмная тема',
        exact: true
      })
      .click();
    expect(
      await row.locator('.menu-profile__sticker-checkbox').boundingBox()
    ).toMatchObject({
      width: 16,
      height: 16
    });
    expect(await image.boundingBox()).toMatchObject({ width: 24, height: 24 });
    await list.screenshot({
      path: testInfo.outputPath(`sticker-select-${theme}.png`)
    });
  }
});
