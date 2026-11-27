import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';

for (const mode of ['link', 'programmatic'] as const) {
  test(`скачивание ${mode} с другого домена передаётся браузеру без потери вкладки чата`, async ({
    page,
    context
  }) => {
    const body = Buffer.from('Содержимое скачанного файла');
    let requests = 0;
    const server = createServer((_request, response) => {
      requests++;
      response.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="document.txt"',
        'Content-Length': String(body.length)
      });
      response.end(body);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      await page.goto('/e2e/fixtures/call-download.html');
      const ios = await page.evaluate(() =>
        /iPhone|iPad|iPod/.test(navigator.userAgent)
      );
      await page.evaluate(
        async ({ port, mode }) => {
          const { initBrowserMediaDownloads } = await import(
            '/src/utils/browser-media-downloads.ts'
          );
          const { triggerBrowserDownload } = await import(
            '/src/utils/media-download.ts'
          );
          initBrowserMediaDownloads();
          (window as any).downloadClick = null;
          (window as any).downloadUnloads = 0;
          window.addEventListener('beforeunload', () => {
            (window as any).downloadUnloads++;
          });
          document.addEventListener('click', event => {
            const link = (event.target as Element).closest('a[download]');
            if (link) {
              (window as any).downloadClick = {
                prevented: event.defaultPrevented,
                target: link.getAttribute('target'),
                rel: link.getAttribute('rel')
              };
            }
          });
          const url = `http://127.0.0.1:${port}/api/media/object/document.txt`;
          if (mode === 'programmatic') {
            document
              .querySelector('#download')!
              .addEventListener('click', () => {
                triggerBrowserDownload(url, 'document.txt');
              });
          } else {
            const link = document.createElement('a');
            link.id = 'download';
            link.href = `${url}?downloadName=document.txt`;
            link.download = 'document.txt';
            link.textContent = 'Скачать файл';
            document.querySelector('#download')!.replaceWith(link);
          }
        },
        { port, mode }
      );
      const url = page.url();
      // На iOS загрузка может принадлежать новой вкладке до её автозакрытия.
      const downloaded = new Promise<import('@playwright/test').Download>(
        resolve => {
          page.once('download', resolve);
          context.once('page', popup => popup.once('download', resolve));
        }
      );
      await page.locator('#download').click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe('document.txt');
      expect(await download.failure()).toBeNull();
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(body);
      expect(requests).toBe(1);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => (window as any).downloadUnloads)).toBe(
        0
      );
      expect(
        await page.evaluate(() => (window as any).downloadClick)
      ).toMatchObject(
        ios
          ? { prevented: false, target: '_blank', rel: 'noopener' }
          : { prevented: true }
      );
      await expect(
        page.locator('iframe[title="Скачивание вложения"]')
      ).toHaveCount(ios ? 0 : 1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
