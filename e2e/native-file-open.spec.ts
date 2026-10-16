import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const win = window as any;
    win.androidBridge = {};
    win.fileCalls = [];
    win.Capacitor = {
      PluginHeaders: [
        {
          name: 'NativeFile',
          methods: [
            { name: 'getFileStatus', rtype: 'promise' },
            { name: 'openDownloadedFile', rtype: 'promise' }
          ]
        }
      ],
      nativePromise: (_plugin: string, method: string, options: unknown) => {
        win.fileCalls.push({ method, options });
        if (method === 'getFileStatus')
          return Promise.resolve({
            downloaded: true,
            path: 'content://downloads/42',
            fileName: 'Документ.pdf',
            mimeType: 'application/pdf'
          });
        return new Promise(resolve => {
          win.finishFileOpen = () =>
            resolve({
              path: 'content://downloads/42',
              mimeType: 'application/pdf'
            });
        });
      }
    };
  });
});

test('downloaded PDF opens once and file double taps do not reach message reactions', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/native-file-open.html');
  const card = page.getByTestId('NativePdf-FileContainer');
  await expect(card).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as any).fileCalls.length))
    .toBe(1);
  await card.getByText('Документ.pdf').dblclick();
  await expect(card.getByRole('status')).toHaveText('Открываем…');
  await expect(card).toHaveAttribute('aria-busy', 'true');
  await card.locator('.message-content__file-icon').dblclick();
  const state = await page.evaluate(() => ({
    calls: (window as any).fileCalls,
    doubleClicks: (window as any).fileDoubleClicks
  }));
  expect(state.doubleClicks).toBe(0);
  expect(state.calls.map((call: any) => call.method)).toEqual([
    'getFileStatus',
    'openDownloadedFile'
  ]);
  expect(state.calls[1].options.localUri).toBe('content://downloads/42');
  await page.evaluate(() => (window as any).finishFileOpen());
  await expect(card).toHaveAttribute('aria-busy', 'false');
  await expect(card.getByRole('status')).toHaveCount(0);
});

test('every area of a single file card opens that file', async ({ page }) => {
  await page.goto('/e2e/fixtures/native-file-open.html');
  const article = page.getByTestId('NativePdf-Article');
  const card = page.getByTestId('NativePdf-FileContainer');
  await expect(card).toBeVisible();
  const articleBounds = await article.boundingBox();
  const targets = [
    () => article.click({ position: { x: 5, y: articleBounds!.height / 2 } }),
    () => page.getByTestId('NativePdf-TimeText').click(),
    () => card.getByText('Документ.pdf').click(),
    async () => {
      const bounds = await card
        .locator('.message-content__file__size')
        .boundingBox();
      // Время может перекрывать размер: нажимаем именно видимую область карточки.
      await page.mouse.click(
        bounds!.x + bounds!.width / 2,
        bounds!.y + bounds!.height / 2
      );
    },
    () => card.locator('.message-content__file-icon').click(),
    () => page.getByTestId('NativePdf-Content').press('Enter')
  ];
  for (const [index, click] of targets.entries()) {
    await click();
    await expect
      .poll(() => page.evaluate(() => (window as any).fileTargets.length))
      .toBe(index + 1);
    await expect(card).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => (window as any).finishFileOpen());
    await expect(card).toHaveAttribute('aria-busy', 'false');
  }
  expect(await page.evaluate(() => (window as any).fileTargets)).toEqual(
    targets.map(() => 'already-downloaded.pdf')
  );
});

test('each file row opens its own file while caption and reply keep their actions', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/native-file-open.html?multiple&caption');
  const rows = page.getByTestId('NativePdf-Content');
  await expect(rows).toHaveCount(2);
  for (const index of [0, 1]) {
    const row = rows.nth(index);
    const bounds = await row.boundingBox();
    await row.click({
      position: { x: bounds!.width - 2, y: bounds!.height / 2 }
    });
    await expect
      .poll(() => page.evaluate(() => (window as any).fileTargets.length))
      .toBe(index + 1);
    await page.evaluate(() => (window as any).finishFileOpen());
    await expect(row.getByTestId('NativePdf-FileContainer')).toHaveAttribute(
      'aria-busy',
      'false'
    );
  }
  await page.getByText('Подпись').click();
  await page.getByRole('link', { name: 'ссылка' }).click();
  await page.getByRole('button', { name: /Исходное сообщение/ }).click();
  expect(await page.evaluate(() => (window as any).fileTargets)).toEqual([
    'already-downloaded.pdf',
    'second.pdf'
  ]);
  expect(await page.evaluate(() => (window as any).fileReplyClicks)).toBe(1);
  await page.goto('/e2e/fixtures/native-file-open.html?caption');
  await page.getByText('Подпись').click();
  await page.getByRole('link', { name: 'ссылка' }).click();
  await page.getByRole('button', { name: /Исходное сообщение/ }).click();
  expect(await page.evaluate(() => (window as any).fileTargets)).toEqual([]);
  expect(await page.evaluate(() => (window as any).fileReplyClicks)).toBe(1);
});
