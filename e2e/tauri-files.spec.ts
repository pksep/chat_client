import { expect, test } from '@playwright/test';

test('Tauri: скачивание, локальный значок, папка и удалённый файл', async ({
  page
}) => {
  await page.addInitScript(() => {
    const win = window as any;
    win.isTauri = true;
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      },
      transformCallback: () => 1,
      invoke: async (command: string, args: any) => {
        win.fileCalls ||= [];
        win.fileCalls.push({ command, args });
        const saved = {
          downloaded: true,
          path: 'C:\\Downloads\\SEP Chat\\Документ.pdf',
          fileName: 'Документ.pdf',
          mimeType: 'application/pdf'
        };
        if (command === 'plugin:event|listen') return 1;
        if (command === 'desktop_file_status') {
          if (win.holdStatus)
            await new Promise(resolve => {
              win.finishStatus = resolve;
            });
          return { ...saved, downloaded: !!win.fileExists };
        }
        if (command === 'desktop_file_download') {
          await new Promise(resolve => {
            win.finishDownload = resolve;
          });
          win.fileExists = true;
          return saved;
        }
        if (command === 'desktop_file_open') {
          if (!win.fileExists)
            throw { code: 'FILE_NOT_FOUND', message: 'Файл удалён' };
          return saved;
        }
        throw new Error(`Неожиданный IPC: ${command}`);
      }
    };
  });
  await page.route('**/*', route => {
    const { hostname } = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(hostname)
      ? route.continue()
      : route.abort();
  });
  await page.goto('/e2e/fixtures/native-file-open.html?string-size');
  const row = page.getByTestId('NativePdf-Content');
  await expect(row).toHaveAttribute('aria-label', 'Скачать файл Документ.pdf');
  await row.dblclick();
  await expect(page.getByTestId('NativePdf-FileContainer')).toHaveAttribute(
    'aria-busy',
    'true'
  );
  await page.evaluate(() => (window as any).finishDownload());
  await expect(row).toHaveAttribute('aria-label', 'Открыть файл Документ.pdf');
  await row.click();
  const canReveal = await page.evaluate(async () => {
    const files = (window as any).nativeFiles;
    const media = {
      id: 'pdf',
      path: 'already-downloaded.pdf',
      originName: 'Документ.pdf',
      size: 43951
    } as any;
    const canReveal = files.canShowNativeFileInFolder(media);
    await files.showNativeFileInFolder(media);
    return canReveal;
  });
  expect(canReveal).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as any).fileCalls.filter(
          (call: any) => call.command === 'desktop_file_download'
        ).length
    )
  ).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as any).fileCalls.some(
        (call: any) => call.command === 'desktop_file_open' && call.args.reveal
      )
    )
  ).toBe(true);
  const sizes = await page.evaluate(() =>
    (window as any).fileCalls
      .filter((call: any) => call.command.startsWith('desktop_file_'))
      .map((call: any) => call.args.options.size)
  );
  expect(sizes.length).toBeGreaterThan(3);
  expect(sizes.every(size => size === 43951)).toBe(true);
  await page.evaluate(() => {
    (window as any).holdStatus = true;
    window.dispatchEvent(new Event('focus'));
  });
  await expect
    .poll(() => page.evaluate(() => !!(window as any).finishStatus))
    .toBe(true);
  await expect(row).toHaveAttribute('aria-label', 'Открыть файл Документ.pdf');
  await expect(page.getByTestId('NativePdf-FileContainer')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await page.evaluate(() => {
    (window as any).fileExists = false;
    (window as any).holdStatus = false;
    (window as any).finishStatus();
  });
  await expect(row).toHaveAttribute('aria-label', 'Скачать файл Документ.pdf');
  await row.click();
  await expect(page.getByTestId('NativePdf-FileContainer')).toHaveAttribute(
    'aria-busy',
    'true'
  );
  await page.evaluate(() => (window as any).finishDownload());
  await expect(row).toHaveAttribute('aria-label', 'Открыть файл Документ.pdf');
});
