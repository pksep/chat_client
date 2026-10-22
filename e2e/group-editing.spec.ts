import { expect, test, type Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();

const group = {
  id: 'fixture-group-id',
  title: 'Проверка поиска',
  avatarUrl: '',
  members: []
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
      return route.fulfill({
        status: 404,
        json: { message: 'Топик недоступен по этому адресу' }
      });
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
  ).toBeVisible({ timeout: 15_000 });
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
  // Размер редактора должен быть точным и во время анимации открытия.
  await page.addStyleTag({
    content:
      '.modal-cropped-avatar.fade-and-scale-enter-active { transition-duration: 2s; }'
  });
  await page.route('**/e2e/ios-api/groups/fixture-group-id', route => {
    if (route.request().method() !== 'PATCH')
      return route.fulfill({ json: { group, members: { data: [] } } });
    patches.push(route.request().postDataJSON());
    return route.fulfill({ json: { ...group, ...patches.at(-1) } });
  });
  const uploads: any[] = [];
  await page.route('**/e2e/ios-api/media/upload-target', route => {
    uploads.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        objectName: 'group-avatar.png',
        uploadUrl: 'http://localhost:5173/e2e/avatar-storage'
      }
    });
  });
  await page.evaluate(() => {
    const fixture = (window as any).iosPwaFixture;
    const uploadFile = fixture.sdk.uploadFile.bind(fixture.sdk);
    fixture.sdk.uploadFile = (file: File, ...args: any[]) => {
      fixture.lastUploadedAvatar = file;
      return uploadFile(file, ...args);
    };
  });
  await page.route('**/e2e/avatar-storage', route =>
    route.fulfill({ status: 200 })
  );
  await page.route('**/e2e/ios-api/media/upload', route =>
    route.fulfill({
      json: { objectName: 'group-avatar.png', thumbnailObjectName: null }
    })
  );
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
  await expect
    .poll(() =>
      crop.locator('canvas').evaluate(canvas => {
        const element = canvas as HTMLCanvasElement;
        return element
          .getContext('2d')!
          .getImageData(element.width / 2, element.height / 2, 1, 1).data[3];
      })
    )
    .toBe(255);
  await crop.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(uploads).toHaveLength(1);
  expect(uploads[0].size).toBeGreaterThan(0);
  expect(uploads[0].contentType).toBe('image/png');
  const edges = await page.evaluate(async () => {
    const image = await createImageBitmap(
      (window as any).iosPwaFixture.lastUploadedAvatar
    );
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const alphaAt = (x: number, y: number) =>
      context.getImageData(x, y, 1, 1).data[3];
    return [
      alphaAt(0, image.height / 2),
      alphaAt(image.width - 1, image.height / 2),
      alphaAt(image.width / 2, 0),
      alphaAt(image.width / 2, image.height - 1)
    ];
  });
  expect(edges).toEqual([255, 255, 255, 255]);
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

test('ошибка загрузки фото видна и повторный выбор того же файла работает', async ({
  page
}, testInfo) => {
  let uploads = 0;
  await page.route('**/e2e/ios-api/media/upload-target', route => {
    uploads++;
    return route.fulfill({
      status: 500,
      json: { message: 'Не удалось загрузить фото' }
    });
  });
  const avatar = page.locator(
    testInfo.project.name === 'chromium-desktop'
      ? '.menu-info__avatar-button'
      : '.modal-info-mobile__avatar-button'
  );
  const file = {
    name: 'avatar.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="coral"/></svg>'
    )
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const chooser = page.waitForEvent('filechooser');
    await avatar.click();
    await (await chooser).setFiles(file);
    const crop = page.locator('.modal-cropped-avatar:visible');
    await expect(crop).toBeVisible();
    await crop.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect.poll(() => uploads).toBe(attempt + 1);
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Не удалось загрузить фото' })
        .last()
    ).toBeVisible();
  }
});
