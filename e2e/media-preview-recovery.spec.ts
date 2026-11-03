import { expect, test } from '@playwright/test';

for (const corruptCache of [false, true]) {
  test(`старое фото восстанавливается после ${corruptCache ? 'повреждения кеша' : 'ошибки миниатюры'}`, async ({
    page,
    browserName
  }) => {
    test.setTimeout(60_000);
    const seedMemoryCache = corruptCache && browserName === 'webkit';
    let originalRequests = 0;
    await page.route('**/__photo-recovery', route =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><div id="app"></div>'
      })
    );
    await page.route('**/media/object/old-photo.png*', route => {
      originalRequests++;
      return route.fulfill({
        contentType: 'image/png',
        body:
          seedMemoryCache && originalRequests === 1
            ? Buffer.from('broken')
            : Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
                'base64'
              )
      });
    });
    await page.route('**/media/object/old-thumb.png*', route =>
      route.fulfill({ status: 404 })
    );
    await page.goto('/__photo-recovery');
    await page.evaluate(
      async ({ corruptCache, seedMemoryCache }) => {
        const { createApp, h, MessageBubbleMedia } = await import(
          '/e2e/fixtures/media-preview-recovery.ts'
        );
        const { setConfig } = await import('/src/services/useConfig.ts');
        const cache = await import('/src/services/useMediaBlobCache.ts');
        setConfig({
          CHAT_PATH_TO_FILE_CDN: `${location.origin}/api/media/object`
        });
        const path = 'old-photo.png';
        if (seedMemoryCache) {
          // Windows WebKit не сохраняет Blob в IDB: проверяем тот же сбой
          // через кеш в памяти; настоящий IDB проверяется в Chromium.
          const cached = await cache.ensureMediaObjectUrl(path);
          if (!cached?.startsWith('blob:')) {
            throw new Error('Не удалось подготовить повреждённый Blob');
          }
        } else if (corruptCache) {
          await cache.loadCachedMediaObjectUrl('__ready__');
          const { MEDIA_CACHE_VERSION } = await import(
            '/src/utils/media-url.ts'
          );
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chat-media-blob-cache-db', 3);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('mediaBlobs', 'readwrite');
            const write = tx.objectStore('mediaBlobs').put({
              key: `${MEDIA_CACHE_VERSION}:${path}`,
              path,
              blob: new Blob(['broken'], { type: 'image/png' }),
              size: 6,
              accessedAt: new Date().toISOString()
            });
            write.onerror = () =>
              reject(
                new Error(
                  `Запись тестового кеша: ${write.error?.name}: ${write.error?.message}`
                )
              );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          });
          await cache.loadCachedMediaObjectUrl(path);
        }
        createApp({
          render: () =>
            h(MessageBubbleMedia, {
              message: '',
              isMeSender: true,
              dataTestid: 'OldPhoto',
              media: [
                {
                  id: 'old-photo',
                  path,
                  thumbnailPath: corruptCache ? path : 'old-thumb.png',
                  type: 'IMAGE',
                  originName: 'Снимок.png',
                  size: 100,
                  ex: { width: 200, height: 200 }
                }
              ]
            })
        }).mount('#app');
      },
      { corruptCache, seedMemoryCache }
    );
    const photo = page.getByRole('img', { name: 'Изображение', exact: true });
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth)
      )
      .toBe(1);
    await expect(photo).toHaveAttribute('src', /old-photo\.png/);
    expect(originalRequests).toBe(seedMemoryCache ? 2 : 1);
  });
}
