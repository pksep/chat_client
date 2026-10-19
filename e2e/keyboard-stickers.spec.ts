import { expect, test } from '@playwright/test';

test('Android-клавиатура передаёт стикер в очередь и сохраняет черновик', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as any).androidBridge = {};
    const keyboard = ((window as any).keyboardFixture = {
      enabled: false,
      listeners: {} as Record<string, (payload: any) => void>,
      released: [] as string[]
    });
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'KeyboardMedia',
          methods: [
            { name: 'setEnabled', rtype: 'promise' },
            { name: 'releaseFile', rtype: 'promise' },
            { name: 'addListener' },
            { name: 'removeListener', rtype: 'promise' }
          ]
        }
      ],
      convertFileSrc: (path: string) => path,
      async nativePromise(plugin: string, method: string, options: any) {
        if (plugin !== 'KeyboardMedia') return {};
        if (method === 'setEnabled') keyboard.enabled = options.enabled;
        if (method === 'releaseFile') keyboard.released.push(options.filePath);
        return {};
      },
      async nativeCallback(
        plugin: string,
        method: string,
        options: any,
        listener: (payload: any) => void
      ) {
        if (plugin === 'KeyboardMedia' && method === 'addListener')
          keyboard.listeners[options.eventName] = listener;
        return options.eventName;
      }
    };
  });
  await page.route('https://**/*', route => route.abort());
  await page.goto('/e2e/fixtures/stickers.html?offline=1');
  await page.locator('.ProseMirror').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).keyboardFixture.enabled))
    .toBe(true);
  await page.evaluate(() =>
    (window as any).keyboardFixture.listeners.mediaReceived({
      filePath: '/e2e/fixtures/sticker-assets/animation.webp',
      name: 'keyboard-hello.webp',
      mimeType: 'image/webp'
    })
  );
  const message = page.getByTestId('StickerMessage-Sticker');
  await expect(message).toBeVisible();
  await expect(page.getByTestId('SendCount')).toHaveText('Отправлено: 1');
  await expect(page.getByTestId('Draft')).toHaveText(
    '<p>Несохранённый черновик</p>'
  );
  await expect(message).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.message__article__media')).toHaveCount(0);
  await expect(page.locator('dialog:visible')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).keyboardFixture.released))
    .toContain('/e2e/fixtures/sticker-assets/animation.webp');
  await page.getByRole('button', { name: 'Тёмная тема', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).keyboardFixture.enabled))
    .toBe(false);
  await page.screenshot({
    path: test.info().outputPath('keyboard-sticker.png')
  });
});
