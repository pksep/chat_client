import { expect, test, type Page } from '@playwright/test';

const testImage =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';

// Изолированная страница: реальные composables и IndexedDB, без аккаунта пользователя.
async function openFixture(page: Page, seed = false) {
  await page.route('**/__background-sync-test', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Background sync test</title>'
    })
  );
  await page.goto('http://localhost:5173/__background-sync-test');
  await page.evaluate(
    async ({ seed, dataUrl }) => {
      const importModule = (path: string) => import(/* @vite-ignore */ path);
      if (seed) {
        for (const [name, store, id] of [
          ['chat-custom-wallpapers-db', 'wallpapers', 'legacy-chat'],
          ['chat-custom-call-backgrounds-db', 'backgrounds', 'legacy-call']
        ]) {
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(name, 1);
            request.onupgradeneeded = () =>
              request.result.createObjectStore(store, { keyPath: 'id' });
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction(store, 'readwrite');
              tx.objectStore(store).put({ id, dataUrl, createdAt: 123 });
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            };
          });
        }
        localStorage.setItem('chat_wallpaper_selection_v2', 'legacy-chat');
        localStorage.setItem('call_background_selection_v1', 'legacy-call');
        localStorage.setItem('chat_wallpaper_custom_data_v1', dataUrl);
      }
      const fixture = await importModule(
        '/e2e/fixtures/custom-background-harness.ts'
      );
      (window as any).backgroundFixture = fixture.initializeBackgroundFixture();
    },
    { seed, dataUrl: testImage }
  );
}

const state = (page: Page) =>
  page.evaluate(() => {
    const { wallpaper, call } = (window as any).backgroundFixture;
    return {
      chat: wallpaper.wallpaperPreviewItems.value.map((item: any) => item.id),
      call: call.callBackgroundPreviewItems.value.map((item: any) => item.id),
      selectedChat: wallpaper.selectedWallpaperId.value,
      selectedCall: call.selectedCallBackgroundId.value
    };
  });

test('старые фоны переносятся один раз; другое устройство получает список, сохраняя свой выбор', async ({
  page,
  browser
}) => {
  const records = new Map<string, any>();
  let uploads = 0;
  const attachApi = async (target: Page) =>
    target.route('**/test-background-api/**', async route => {
      const [kind, id] = new URL(route.request().url()).pathname
        .split('/')
        .slice(2);
      if (route.request().method() === 'POST') {
        uploads++;
        const image = JSON.parse(route.request().postData()!);
        records.set(`${kind}:${image.id}`, { ...image, kind });
        await route.fulfill({
          json: { id: image.id, createdAt: image.createdAt, kind }
        });
      } else {
        await route.fulfill({
          json: id
            ? records.get(`${kind}:${id}`)
            : [...records.values()]
                .filter(item => item.kind === kind)
                .map(({ id, kind, createdAt }) => ({ id, kind, createdAt }))
        });
      }
    });
  await attachApi(page);
  await openFixture(page, true);
  await expect.poll(() => uploads).toBe(2);
  await expect
    .poll(async () => (await state(page)).selectedChat)
    .toBe('legacy-chat');
  expect((await state(page)).selectedCall).toBe('legacy-call');
  const context = await browser.newContext();
  const second = await context.newPage();
  try {
    await attachApi(second);
    await openFixture(second);
    await expect
      .poll(async () => (await state(second)).chat)
      .toContain('legacy-chat');
    await expect
      .poll(async () => (await state(second)).call)
      .toContain('legacy-call');
    expect((await state(second)).selectedChat).toBe('none');
    expect((await state(second)).selectedCall).toBe('none');
    await openFixture(page);
    await expect
      .poll(async () => (await state(page)).chat)
      .toContain('legacy-chat');
    expect(uploads).toBe(2);
    const selected = await page.evaluate(async dataUrl => {
      const { wallpaper, call } = (window as any).backgroundFixture;
      await wallpaper.setCustomWallpaper(dataUrl);
      await call.setCustomCallBackground(dataUrl);
      return {
        chat: wallpaper.selectedWallpaperId.value,
        call: call.selectedCallBackgroundId.value
      };
    }, testImage);
    expect(uploads).toBe(4);
    await second.evaluate(() =>
      (window as any).backgroundFixture.sync.refreshCustomBackgrounds()
    );
    await expect
      .poll(async () => (await state(second)).chat)
      .toContain(selected.chat);
    await expect
      .poll(async () => (await state(second)).call)
      .toContain(selected.call);
    expect((await state(second)).selectedChat).toBe('none');
    expect((await state(second)).selectedCall).toBe('none');
  } finally {
    await context.close();
  }
});
