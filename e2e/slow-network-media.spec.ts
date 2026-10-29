import { expect, test } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

for (const source of ['IndexedDB', 'память']) {
  test(`сохранённое изображение видно без HTTP медиа и взаимодействия: ${source}`, async ({
    page
  }) => {
    const state = await openFixture(page, { shell: true });
    let networkAttempts = 0;
    await page.route('**/media/object/saved-preview.svg*', route => {
      networkAttempts++;
      return route.abort();
    });
    const path = await page.evaluate(
      async ({ source, rows }) => {
        const path = `${location.origin}/performance-api/media/object/saved-preview.svg`;
        const { MEDIA_CACHE_VERSION } = await import('/src/utils/media-url.ts');
        const blob = new Blob(
          [
            '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40"><rect width="64" height="40" fill="green"/></svg>'
          ],
          { type: 'image/svg+xml' }
        );
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('chat-media-blob-cache-db', 3);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('mediaBlobs', 'readwrite');
            tx.objectStore('mediaBlobs').put({
              key: `${MEDIA_CACHE_VERSION}:${path}`,
              path,
              blob,
              size: blob.size,
              mimeType: blob.type,
              createdAt: new Date().toISOString(),
              accessedAt: new Date().toISOString()
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
        if (source === 'память') {
          const cache = await import('/src/services/useMediaBlobCache.ts');
          if (!(await cache.loadCachedMediaObjectUrl(path)))
            throw new Error('Кеш не подготовлен');
        }
        const history = rows.map((row, index) =>
          index === rows.length - 1
            ? {
                ...row,
                text: 'Сохранённое изображение',
                media: [
                  {
                    id: 'saved-preview',
                    type: 'IMAGE',
                    path,
                    thumbnailPath: path,
                    ex: {
                      width: 64,
                      height: 40,
                      previewWidth: 240,
                      previewHeight: 150
                    }
                  }
                ]
              }
            : row
        );
        (window as any).topicPerformance.seed('performance-0', history);
        return path;
      },
      { source, rows: makeMessages('performance-0', 20) }
    );
    const history = await page.evaluate(() =>
      (window as any).topicPerformance.messages.getFullMessagesByTopicId(
        'performance-0'
      )
    );
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/messages/topic/performance-0?*', async route => {
      await gate;
      await route.fulfill({ json: history });
    });
    try {
      await openTopic(page, 0);
      await expect(
        page.locator('[data-testid$="-MessageList-Skeleton"]')
      ).toHaveCount(0);
      const image = page.locator('[data-message-media-id="saved-preview"] img');
      await expect(image).toBeVisible();
      await expect
        .poll(
          () =>
            image.evaluate(
              (element: HTMLImageElement) =>
                element.complete && element.naturalWidth === 64
            ),
          { timeout: 1800 }
        )
        .toBe(true);
      expect(await image.getAttribute('src')).toMatch(/^blob:/);
      release();
      if (source === 'память') expect(networkAttempts).toBe(0);
      expect(
        await page.evaluate(
          path =>
            (window as any).topicPerformance.messages
              .getFullMessagesByTopicId('performance-0')
              .at(-1).media[0].path === path,
          path
        )
      ).toBe(true);
    } finally {
      release();
    }
    expect(state.errors).toEqual([]);
  });
}
