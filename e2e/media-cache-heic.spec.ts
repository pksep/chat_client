import { expect, test } from '@playwright/test';

test('старый HEIC в кеше заменяется WebP, который отображается с первого раза', async ({
  page
}) => {
  await page.route('**/__heic-cache', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>'
    })
  );
  let previewRequests = 0;
  const webp = Buffer.from(
    'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
    'base64'
  );
  await page.route('**/media/object/legacy.heic*', route => {
    expect(new URL(route.request().url()).searchParams.get('preview')).toBe(
      'webp'
    );
    previewRequests++;
    return route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/__heic-cache');
  const result = await page.evaluate(async () => {
    const path = `${location.origin}/api/media/object/legacy.heic`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chat-media-blob-cache-db', 2);
      request.onupgradeneeded = () => {
        request.result
          .createObjectStore('mediaBlobs', { keyPath: 'key' })
          .createIndex('accessedAt', 'accessedAt');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('mediaBlobs', 'readwrite');
        tx.objectStore('mediaBlobs').put({
          key: path,
          path,
          blob: new Blob(['old-heic'], { type: 'image/heic' }),
          size: 8,
          accessedAt: new Date().toISOString()
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const cache = await import('/src/services/useMediaBlobCache.ts');
    const legacy = await cache.loadCachedMediaObjectUrl(path);
    const url = await cache.ensureMediaObjectUrl(path);
    const image = new Image();
    image.src = url!;
    await image.decode();
    document.body.append(image);
    return {
      legacy,
      width: image.naturalWidth,
      cached: (await cache.ensureMediaObjectUrl(path)) === url
    };
  });
  expect(result).toEqual({ legacy: null, width: 1, cached: true });
  expect(previewRequests).toBe(1);
});
