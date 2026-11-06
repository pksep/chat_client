import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, kind = 'group') {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/folder-menu-api/**', route =>
    route.fulfill({ json: [] })
  );
  await page.goto(
    `/e2e/fixtures/header-context-menu.html?kind=${kind}&activity`
  );
  await expect(page.getByTestId('Fixture-Header-Container')).toBeVisible();
  return errors;
}

async function receive(
  page: Page,
  kind: string,
  isUploading = true,
  userId = 'other-user',
  topicId = 'header-topic'
) {
  await page.evaluate(
    payload => (window as any).activity.receive('uploadStatus', payload),
    { topicId, userId, kind, isUploading }
  );
}
async function typing(page: Page, isTyping: boolean, userId = 'other-user') {
  await page.evaluate(
    payload => (window as any).activity.receive('typingStatus', payload),
    { topicId: 'header-topic', userId, isTyping }
  );
}
const headerStatus = (page: Page) =>
  page.getByTestId('Fixture-Header-Container').locator('.typing-indicator');
const listStatus = (page: Page) =>
  page.getByTestId('Fixture-Topics-ContactList-Typing1');

for (const topicType of ['group', 'dm']) {
  test(`${topicType}: фото, видео и файл видны в хедере и списке с приоритетом набора`, async ({
    page
  }) => {
    const errors = await fixture(page, topicType);
    for (const [kind, noun] of [
      ['photo', 'фото'],
      ['video', 'видео'],
      ['file', 'файл']
    ]) {
      await receive(page, kind);
      const expected =
        topicType === 'group'
          ? `Иванов И.И. отправляет ${noun}`
          : `Отправляет ${noun}`;
      await expect(headerStatus(page)).toHaveText(expected);
      await expect(listStatus(page)).toHaveText(expected);
      await expect(
        headerStatus(page).locator('.typing-indicator__dots span')
      ).toHaveCount(3);
      await typing(page, true);
      await expect(headerStatus(page)).toHaveText(
        topicType === 'group' ? 'Иванов И.И. печатает' : 'Печатает'
      );
      await expect(listStatus(page)).toContainText(
        topicType === 'group' ? 'печатает' : 'Печатает'
      );
      await typing(page, false);
      await expect(headerStatus(page)).toHaveText(expected);
      await receive(page, kind, false);
      await expect(headerStatus(page)).toHaveCount(0);
      await expect(listStatus(page)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

test('Набор другого участника приоритетнее отправки; несколько отправителей и типов объединяются', async ({
  page
}) => {
  const errors = await fixture(page);
  await receive(page, 'photo');
  await receive(page, 'photo', true, 'second-user');
  await expect(headerStatus(page)).toHaveText('2 пользователя отправляют фото');
  await typing(page, true, 'second-user');
  await expect(headerStatus(page)).toHaveText('Петров П.П. печатает');
  await typing(page, false, 'second-user');
  await receive(page, 'video', true, 'second-user');
  await expect(headerStatus(page)).toHaveText(
    '2 пользователя отправляют файлы'
  );
  await receive(page, 'photo', false, 'second-user');
  await receive(page, 'video', false, 'second-user');
  await expect(headerStatus(page)).toHaveText('Иванов И.И. отправляет фото');
  expect(errors).toEqual([]);
});

test('Свой статус, неизвестный тип и другой топик не отображаются; старые статусы истекают', async ({
  page
}) => {
  const errors = await fixture(page);
  await receive(page, 'photo', true, 'header-menu-user');
  await receive(page, 'unknown');
  await receive(page, 'file', true, 'other-user', 'other-topic');
  await expect(headerStatus(page)).toHaveCount(0);
  await receive(page, 'photo');
  await expect(headerStatus(page)).toContainText('отправляет фото');
  await page.clock.install();
  await receive(page, 'photo');
  await page.clock.fastForward(4001);
  await expect(headerStatus(page)).toHaveCount(0);
  await expect(listStatus(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Смена пользователя очищает статусы отправки', async ({ page }) => {
  const errors = await fixture(page);
  await receive(page, 'file');
  await expect(headerStatus(page)).toContainText('отправляет файл');
  await page.evaluate(() => (window as any).activity.changeUser());
  await expect(headerStatus(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Отправки одного пользователя с двух устройств не сбрасывают друг друга', async ({
  page
}) => {
  const errors = await fixture(page);
  const update = (socketId: string, isUploading: boolean) =>
    page.evaluate(
      payload => {
        (window as any).activity.receive('uploadStatus', payload);
      },
      {
        topicId: 'header-topic',
        userId: 'other-user',
        kind: 'photo',
        socketId,
        isUploading
      }
    );
  await update('desktop', true);
  await update('pwa', true);
  await expect(headerStatus(page)).toHaveText('Иванов И.И. отправляет фото');
  await update('desktop', false);
  await expect(headerStatus(page)).toHaveText('Иванов И.И. отправляет фото');
  await update('pwa', false);
  await expect(headerStatus(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function startUpload(page: Page, mime: string, filename: string) {
  await page.evaluate(
    ({ mime, filename }) => {
      const state = (window as any).activity;
      const bytes = mime.startsWith('image/')
        ? Uint8Array.from(
            atob(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8l8AAAAASUVORK5CYII='
            ),
            c => c.charCodeAt(0)
          )
        : new Uint8Array([1, 2, 3]);
      state.done = state.sender.handleAttachSharedFiles([
        new File([bytes], filename, { type: mime })
      ]);
    },
    { mime, filename }
  );
}
const statuses = (page: Page) =>
  page.evaluate(() =>
    (window as any).activity.events
      .filter((event: any) => event.type === 'uploadStatus')
      .map((event: any) => event.payload)
  );

for (const [kind, mime, name] of [
  ['photo', 'image/png', 'photo.png'],
  ['video', 'video/mp4', 'video.mp4'],
  ['file', 'application/pdf', 'document.pdf']
]) {
  test(`Реальная отправка ${kind} передаёт начало, продление и завершение статуса`, async ({
    page
  }) => {
    const errors = await fixture(page);
    await startUpload(page, mime, name);
    await expect
      .poll(async () =>
        (await statuses(page)).some(
          (item: any) => item.kind === kind && item.isUploading
        )
      )
      .toBe(true);
    await page.clock.install();
    await page.clock.fastForward(2100);
    await expect
      .poll(
        async () =>
          (await statuses(page)).filter(
            (item: any) => item.kind === kind && item.isUploading
          ).length
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => page.evaluate(() => (window as any).activity.uploads.length))
      .toBe(1);
    await page.evaluate(() => (window as any).activity.uploads[0].resolve());
    await expect
      .poll(async () => (await statuses(page)).at(-1))
      .toEqual({ topicId: 'header-topic', kind, isUploading: false });
    expect(errors).toEqual([]);
  });
}

test('Ошибка и параллельная загрузка файлов не сбрасывают активную отправку раньше времени', async ({
  page
}) => {
  const errors = await fixture(page);
  await startUpload(page, 'application/pdf', 'one.pdf');
  await startUpload(page, 'application/pdf', 'two.pdf');
  await expect
    .poll(() => page.evaluate(() => (window as any).activity.uploads.length))
    .toBe(2);
  await page.evaluate(() => (window as any).activity.uploads[0].reject());
  await expect(page.getByRole('alert')).toContainText(
    'Ошибка тестовой загрузки'
  );
  expect((await statuses(page)).some((item: any) => !item.isUploading)).toBe(
    false
  );
  await page.evaluate(() => (window as any).activity.uploads[1].resolve());
  await expect
    .poll(async () => (await statuses(page)).at(-1))
    .toEqual({ topicId: 'header-topic', kind: 'file', isUploading: false });
  expect(errors).toEqual([]);
});

test('Статусы фото и видео выглядят как индикатор набора', async ({
  page
}, testInfo) => {
  const errors = await fixture(page);
  for (const kind of ['photo', 'video', 'file']) {
    await receive(page, kind);
    await expect(headerStatus(page)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`sending-${kind}.png`),
      scale: 'css'
    });
    await receive(page, kind, false);
  }
  expect(errors).toEqual([]);
});
