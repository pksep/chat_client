import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function openFiles(page: Page, query = '') {
  await page.addInitScript(() => {
    const win = window as any;
    win.isTauri = true;
    const callbacks = new Map<number, (value: unknown) => void>();
    const handlers = new Map<string, number[]>();
    let nextId = 0;
    win.fileAttempts = [];
    win.fileCancels = [];
    win.deferNativeStart = false;
    win.emitFileProgress = (requestId: string, percent: number) => {
      for (const handler of handlers.get('sep-chat://file-download-progress') ||
        []) {
        callbacks.get(handler)?.({
          event: 'sep-chat://file-download-progress',
          payload: { requestId, percent }
        });
      }
    };
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main', windowLabel: 'main' }
      },
      transformCallback: (callback: (value: unknown) => void) => {
        callbacks.set(++nextId, callback);
        return nextId;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: any) => {
        if (command === 'plugin:event|listen') {
          handlers.set(args.event, [
            ...(handlers.get(args.event) || []),
            args.handler
          ]);
          return args.handler;
        }
        if (command === 'desktop_file_status')
          return {
            downloaded: false,
            path: '',
            fileName: args.options.fileName
          };
        if (command === 'desktop_file_download') {
          return new Promise((resolve, reject) => {
            win.fileAttempts.push({
              options: args.options,
              resolve,
              reject,
              registered: !win.deferNativeStart
            });
          });
        }
        if (command === 'desktop_file_cancel_download') {
          win.fileCancels.push(args.requestId);
          const attempt = win.fileAttempts.find(
            (item: any) => item.options.requestId === args.requestId
          );
          if (!attempt?.registered) return false;
          attempt.reject({
            code: 'FILE_DOWNLOAD_CANCELLED',
            message: 'Скачивание отменено'
          });
          return true;
        }
        return null;
      }
    };
  });
  await page.goto('/e2e/fixtures/file-download-cancel.html' + query);
  await expect(
    page.getByTestId(
      query.includes('attachments')
        ? 'CancelFile-FileItem1'
        : 'CancelFile-Content'
    )
  ).toHaveCount(query.includes('attachments') ? 1 : 2);
}

const startDownload = (page: Page, name = 'Документ.docx') =>
  page
    .getByRole('button', { name: `Скачать файл ${name}`, exact: true })
    .click();
const cancelButton = (page: Page, name = 'Документ.docx') =>
  page.getByRole('button', {
    name: `Отменить скачивание файла ${name}`,
    exact: true
  });

test('проценты скачивания видны и в списке вложений', async ({ page }) => {
  await openFiles(page, '?attachments&theme=dark');
  const row = page.getByTestId('CancelFile-FileItem1');
  await row.click();
  const progress = row.getByRole('progressbar', { name: 'Скачивание файла' });
  await expect(progress).toHaveText('Скачиваем…');
  await page.evaluate(() => {
    const win = window as any;
    win.emitFileProgress(win.fileAttempts[0].options.requestId, 54);
  });
  await expect(progress).toHaveText('54%');
  await expect(row).toContainText('1.0 MB');
  await page.evaluate(() => {
    (window as any).fileAttempts[0].resolve({
      path: 'C:/Downloads/test.docx',
      fileName: 'Документ.docx',
      mimeType: 'application/octet-stream'
    });
  });
  await expect(progress).toHaveCount(0);
});

test('крестик внутри прогресса запрашивает подтверждение, отказ и Escape сохраняют загрузку', async ({
  page
}, testInfo) => {
  await openFiles(page, '?theme=dark');
  await startDownload(page);
  const button = cancelButton(page);
  await expect(button).toBeVisible();
  const progress = page.getByRole('progressbar', { name: 'Скачивание файла' });
  await expect(progress).toHaveText('Скачиваем…');
  await expect(progress).not.toHaveAttribute('aria-valuenow');
  await page.evaluate(() => {
    const win = window as any;
    win.emitFileProgress(win.fileAttempts[0].options.requestId, 37);
  });
  await expect(progress).toHaveText('37%');
  await expect(progress).toHaveAttribute('aria-valuenow', '37');
  await expect(page.getByTestId('CancelFile-Content').first()).toContainText(
    '1.0 MB'
  );
  const geometry = await button.evaluate(element => {
    const outer = element.getBoundingClientRect();
    const cross = element
      .querySelector('.file-download-progress__cross')!
      .getBoundingClientRect();
    return {
      x: cross.x + cross.width / 2 - (outer.x + outer.width / 2),
      y: cross.y + cross.height / 2 - (outer.y + outer.height / 2)
    };
  });
  expect(Math.abs(geometry.x)).toBeLessThan(1);
  expect(Math.abs(geometry.y)).toBeLessThan(1);
  await page.screenshot({
    path: testInfo.outputPath('download-progress-cross.png')
  });
  await button.click();
  const confirmation = page
    .getByRole('dialog')
    .filter({ hasText: 'Отменить скачивание?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Нет', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await button.focus();
  await button.press('Enter');
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await button.press('Space');
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Нет', exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fileCancels.length)).toBe(0);
  await page.evaluate(() => {
    const win = window as any;
    win.emitFileProgress(win.fileAttempts[0].options.requestId, 82);
  });
  await expect(progress).toHaveText('82%');
  await button.click();
  await confirmation.getByRole('button', { name: 'Да', exact: true }).click();
  await expect(button).toHaveCount(0);
  await expect(progress).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as any).fileDownloadFixture.state(0).phase
    )
  ).toBe('not-downloaded');
  expect(await page.evaluate(() => (window as any).fileCancels.length)).toBe(1);
});

test('отмена не затрагивает другой файл и поздний прогресс старой попытки не портит повтор', async ({
  page
}) => {
  await openFiles(page);
  await startDownload(page);
  await startDownload(page, 'Второй.txt');
  await cancelButton(page).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Да', exact: true })
    .click();
  await expect(cancelButton(page)).toHaveCount(0);
  await expect(cancelButton(page, 'Второй.txt')).toBeVisible();
  await startDownload(page);
  await expect(cancelButton(page)).toBeVisible();
  const result = await page.evaluate(() => {
    const win = window as any;
    win.emitFileProgress(win.fileAttempts[2].options.requestId, 12);
    win.emitFileProgress(win.fileAttempts[0].options.requestId, 99);
    return {
      state: win.fileDownloadFixture.state(0),
      oldId: win.fileAttempts[0].options.requestId,
      newId: win.fileAttempts[2].options.requestId
    };
  });
  expect(result.oldId).not.toBe(result.newId);
  expect(result.state.percent).toBe(12);
});

test('завершившийся файл убирает подтверждение и не отменяется', async ({
  page
}) => {
  await openFiles(page, '?incoming=1');
  await startDownload(page);
  await cancelButton(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => {
    (window as any).fileAttempts[0].resolve({
      path: 'C:/Downloads/test.docx',
      fileName: 'Документ.docx',
      mimeType: 'application/octet-stream'
    });
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cancelButton(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).fileCancels.length)).toBe(0);
});

test('немедленная отмена до регистрации нативного запроса повторяется при его старте', async ({
  page
}) => {
  await openFiles(page);
  await page.evaluate(() => {
    (window as any).deferNativeStart = true;
  });
  await startDownload(page);
  await cancelButton(page).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Да', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).fileCancels.length))
    .toBe(1);
  await page.evaluate(() => {
    const win = window as any;
    win.fileAttempts[0].registered = true;
    win.emitFileProgress(win.fileAttempts[0].options.requestId, 0);
  });
  await expect(cancelButton(page)).toHaveCount(0);
});
