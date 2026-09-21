import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/media-worker-harness', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>'
    })
  );
  await page.addInitScript(() => {
    (window as any).androidBridge = {};
    (window as any).__mainBlobUrls = 0;
    const create = URL.createObjectURL;
    URL.createObjectURL = blob => {
      (window as any).__mainBlobUrls++;
      return create(blob);
    };
  });
  await page.goto('/media-worker-harness');
});

test('Android создаёт ссылки вне главного потока; изображения и данные доступны странице', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const { createMediaObjectUrl } = await import(
      '/src/utils/media-object-url.ts'
    );
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="4"><rect width="6" height="4" fill="red"/></svg>';
    const urls = await Promise.all([
      createMediaObjectUrl(new Blob([svg], { type: 'image/svg+xml' })),
      createMediaObjectUrl(new Blob(['Сохранённые данные']))
    ]);
    const image = new Image();
    image.src = urls[0];
    await image.decode();
    const text = await fetch(urls[1]).then(response => response.text());
    const originalImage = await fetch(urls[0]).then(response =>
      response.text()
    );
    urls.forEach(url => URL.revokeObjectURL(url));
    return {
      text,
      imageMatches: originalImage === svg,
      width: image.naturalWidth,
      height: image.naturalHeight,
      mainThreadCalls: (window as any).__mainBlobUrls
    };
  });
  expect(result).toEqual({
    text: 'Сохранённые данные',
    imageMatches: true,
    width: 6,
    height: 4,
    mainThreadCalls: 0
  });
  expect(page.workers()).toHaveLength(1);
});

test('ошибка загрузки Worker возвращает обычную загрузку медиа', async ({
  page
}) => {
  await page.route('**/media-object-url.worker.ts*', route => route.abort());
  const result = await page.evaluate(async () => {
    const { createMediaObjectUrl } = await import(
      '/src/utils/media-object-url.ts'
    );
    const url = await createMediaObjectUrl(new Blob(['Резервный путь']));
    const text = await fetch(url).then(response => response.text());
    URL.revokeObjectURL(url);
    return { text, mainThreadCalls: (window as any).__mainBlobUrls };
  });
  expect(result).toEqual({ text: 'Резервный путь', mainThreadCalls: 1 });
});
