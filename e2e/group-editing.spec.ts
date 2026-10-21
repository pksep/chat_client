import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

const group = {
  id: 'fixture-group-id',
  title: 'Проверка поиска',
  avatarUrl: '',
  members: []
};
const topic = {
  id: 'mobile-search-fixture',
  type: 'GROUP',
  name: group.title,
  group,
  isAdmin: true,
  members: [],
  info: {}
};

test.beforeEach(async ({ page }, testInfo) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  if (testInfo.project.name === 'webkit-iphone-pwa') {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'standalone', { value: true })
    );
  }
  await page.route('**/e2e/ios-api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (/\/messages\/topic\/[^/]+(?:\/pinned)?$/.test(path))
      return route.fulfill({ json: [] });
    if (path.endsWith('/groups/fixture-group-id'))
      return route.fulfill({ json: { group, members: { data: [] } } });
    if (path.endsWith('/topics/mobile-search-fixture'))
      return route.fulfill({ json: topic });
    return route.fulfill({ json: { data: [], items: [], folders: [] } });
  });
  await page.goto('/e2e/fixtures/ios-pwa.html?kind=group&no-pinned&shell');
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible({
    timeout: 60_000
  });
  if (testInfo.project.name === 'chromium-mobile') {
    await page
      .getByRole('button', { name: 'Остаться в браузере', exact: true })
      .click();
  }
  await page.locator('.chat__header-profile').click();
  await expect(
    page.getByRole('textbox', { name: 'Название группы', exact: true })
  ).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

test('название сохраняется в группу, хэдер и список; ошибка допускает повтор', async ({
  page
}) => {
  const patches: any[] = [];
  let fail = true;
  await page.route('**/e2e/ios-api/groups/fixture-group-id', route => {
    if (route.request().method() !== 'PATCH')
      return route.fulfill({ json: { group, members: { data: [] } } });
    patches.push(route.request().postDataJSON());
    return route.fulfill({
      status: fail ? 500 : 200,
      json: fail
        ? { message: 'Не удалось изменить группу' }
        : { ...group, ...patches.at(-1) }
    });
  });
  const name = page.getByRole('textbox', {
    name: 'Название группы',
    exact: true
  });
  await name.fill('Новое название группы');
  await expect(name).toHaveValue('Новое название группы');
  const save = page.locator('.menu__info-save-button:visible');
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => patches.length).toBe(1);
  await expect(save).toBeEnabled();
  expect(
    await page.evaluate(
      () => (window as any).iosPwaFixture.topics.value[0].name
    )
  ).toBe(group.title);
  fail = false;
  await save.click();
  await expect.poll(() => patches.length).toBe(2);
  await expect(
    page.locator('.chat__header-profile .user-profile__title')
  ).toContainText('Новое название группы');
  expect(patches[1]).toEqual({ title: 'Новое название группы' });
  expect(
    await page.evaluate(
      () => (window as any).iosPwaFixture.topics.value[0].group.title
    )
  ).toBe('Новое название группы');
  await expect(page.locator('.menu__info-save-button')).toBeDisabled();
});

test('аватар сохраняется после выбора и обрезки без потери названия', async ({
  page
}, testInfo) => {
  const patches: any[] = [];
  await page.route('**/e2e/ios-api/groups/fixture-group-id', route => {
    if (route.request().method() !== 'PATCH')
      return route.fulfill({ json: { group, members: { data: [] } } });
    patches.push(route.request().postDataJSON());
    return route.fulfill({ json: { ...group, ...patches.at(-1) } });
  });
  await page.evaluate(() => {
    (window as any).iosPwaFixture.sdk.uploadFile = async (file: File) => {
      if (!file.size) throw new Error('Пустое изображение');
      return { objectName: 'group-avatar.png', thumbnailObjectName: null };
    };
  });
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator(
      testInfo.project.name === 'chromium-desktop'
        ? '.menu-info__avatar-button'
        : '.modal-info-mobile__avatar-button'
    )
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'avatar.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="coral"/></svg>'
    )
  });
  const crop = page.locator('.modal-cropped-avatar:visible');
  await expect(crop).toBeVisible();
  await expect(crop.locator('canvas')).toBeVisible();
  await crop.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(() => patches.length).toBe(1);
  await expect(crop).toBeHidden();
  expect(patches[0].avatarUrl).toBe('group-avatar.png');
  const saved = await page.evaluate(
    () => (window as any).iosPwaFixture.topics.value[0]
  );
  expect(saved.name).toBe(group.title);
  expect(saved.avatarUrl).toBe('group-avatar.png');
  expect(saved.group.avatarUrl).toBe('group-avatar.png');
  expect(
    await page.evaluate(
      () => (window as any).iosPwaFixture.currentGroup.value.group.avatarUrl
    )
  ).toBe('group-avatar.png');
});
