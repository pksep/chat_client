import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

test.setTimeout(90_000);

const fileBody = Buffer.from('Содержимое вложения');
const fixtureHtml = readFileSync(
  new URL('./fixtures/call-download.html', import.meta.url)
);
const fileHeaders = {
  'Content-Type': 'application/octet-stream',
  'Content-Disposition': 'attachment; filename="call-attachment.dump"',
  'Content-Length': String(fileBody.length)
};

async function openCall(
  page: Page,
  fixtureUrl = '/e2e/fixtures/call-download.html'
) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    return route.fallback();
  });
  const moduleOrigin = new URL(test.info().project.use.baseURL!).origin;
  await page.goto(fixtureUrl);
  await page.evaluate(async moduleOrigin => {
    await import(`${moduleOrigin}/src/services/useLiveKit.ts`);
    const calls = await import(`${moduleOrigin}/src/services/useCallState.ts`);
    const { initBrowserMediaDownloads } = await import(
      `${moduleOrigin}/src/utils/browser-media-downloads.ts`
    );
    const { triggerBrowserDownload } = await import(
      `${moduleOrigin}/src/utils/media-download.ts`
    );
    calls.roomId.value = 'download-regression-call';
    calls.open.value = true;
    (window as any).callDownloadFixture = {
      calls,
      triggerBrowserDownload,
      dispose: initBrowserMediaDownloads()
    };
    (window as any).callDownloadUnloads = 0;
    window.addEventListener('beforeunload', () => {
      (window as any).callDownloadUnloads++;
    });
  }, moduleOrigin);
  return errors;
}

for (const mode of ['same-origin', 'cross-origin', 'programmatic'] as const) {
  test(`скачивание ${mode} во время звонка не вызывает закрытие вкладки`, async ({
    page,
    context
  }) => {
    const server = createServer((request, response) => {
      if (request.url === '/fixture') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(fixtureHtml);
        return;
      }
      response.writeHead(200, fileHeaders);
      response.end(fileBody);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      const errors = await openCall(
        page,
        mode === 'same-origin' ? `http://127.0.0.1:${port}/fixture` : undefined
      );
      const dialogs: string[] = [];
      page.on('dialog', dialog => {
        dialogs.push(dialog.type());
        void dialog.dismiss();
      });
      await page.evaluate(
        ({ mode, port }) => {
          const base =
            mode === 'same-origin'
              ? location.origin
              : `http://127.0.0.1:${port}`;
          const path = mode === 'same-origin' ? 'local.dump' : 'remote.dump';
          const url = `${base}/api/media/object/${path}?downloadName=call-attachment.dump`;
          if (mode === 'programmatic') {
            document
              .querySelector('#download')!
              .addEventListener('click', () =>
                (window as any).callDownloadFixture.triggerBrowserDownload(
                  url,
                  'call-attachment.dump'
                )
              );
          } else {
            const link = document.createElement('a');
            link.id = 'download';
            link.href = url;
            link.download = 'call-attachment.dump';
            if (mode === 'same-origin') link.target = '_blank';
            link.textContent = 'Скачать файл';
            document.querySelector('#download')!.replaceWith(link);
          }
        },
        { mode, port }
      );
      const initialUrl = page.url();
      const downloadPromise = page.waitForEvent('download');
      void downloadPromise.catch(() => {});
      await page.locator('#download').click();
      expect(dialogs).toEqual([]);
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('call-attachment.dump');
      expect(await download.failure()).toBeNull();
      expect(page.url()).toBe(initialUrl);
      expect(context.pages()).toHaveLength(1);
      expect(
        await page.evaluate(() => ({
          unloads: (window as any).callDownloadUnloads,
          open: (window as any).callDownloadFixture.calls.open.value,
          roomId: (window as any).callDownloadFixture.calls.roomId.value
        }))
      ).toEqual({
        unloads: 0,
        open: true,
        roomId: 'download-regression-call'
      });
      expect(errors).toEqual([]);
      await page.evaluate(() => (window as any).callDownloadFixture.dispose());
      await expect(
        page.locator('iframe[title="Скачивание вложения"]')
      ).toHaveCount(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}

test('закрытие вкладки во время скачивания сохраняет предупреждение о звонке', async ({
  page,
  browserName,
  isMobile
}) => {
  test.skip(
    browserName !== 'chromium' || isMobile,
    'Нативный диалог закрытия проверяется в настольном Chrome'
  );
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      ...fileHeaders,
      'Content-Length': '1000000'
    });
    response.write(fileBody);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    await openCall(page);
    const dialogs: string[] = [];
    page.on('dialog', dialog => {
      dialogs.push(dialog.type());
      void dialog.dismiss();
    });
    await page.evaluate(port => {
      document
        .querySelector('#download')!
        .addEventListener('click', () =>
          (window as any).callDownloadFixture.triggerBrowserDownload(
            `http://127.0.0.1:${port}/api/media/object/stream.dump`,
            'call-attachment.dump'
          )
        );
    }, port);
    const started = page.waitForEvent('download');
    void started.catch(() => {});
    await page.locator('#download').click();
    expect(dialogs).toEqual([]);
    await started;
    await Promise.all([
      page.waitForEvent('dialog'),
      page.close({ runBeforeUnload: true })
    ]);
    expect(dialogs).toEqual(['beforeunload']);
    expect(page.isClosed()).toBe(false);
    expect(
      await page.evaluate(
        () => (window as any).callDownloadFixture.calls.open.value
      )
    ).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
