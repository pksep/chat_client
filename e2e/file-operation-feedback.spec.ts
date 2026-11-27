import { devices, expect, test, type Page } from '@playwright/test';
import { stickerPreviewBytes as png } from './fixtures/sticker-catalog';

test.use({
  viewport: { width: 1280, height: 900 },
  userAgent: devices['Desktop Chrome'].userAgent,
  isMobile: false,
  hasTouch: false
});
test.describe.configure({ mode: 'default', timeout: 60_000 });

async function open(page: Page, native = true, query = '') {
  await page.context().route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname.startsWith('/api/media/object/'))
      return route.fulfill({ body: png, contentType: 'image/png' });
    if (url.pathname.startsWith('/operation-api/'))
      return route.fulfill({ json: [] });
    return route.continue();
  });
  await page.addInitScript(
    ({ native }) => {
      const win = window as any;
      win.fileCalls = [];
      win.pendingFiles = [];
      win.savedFiles = new Map();
      const callbacks = new Map<number, any>();
      let id = 0;
      const key = (value: string) => {
        const url = new URL(value);
        for (const p of ['v', 'preview', 'downloadName'])
          url.searchParams.delete(p);
        return url.href;
      };
      win.emitFileProgress = (percent: number) => {
        const request = win.pendingFiles[0]?.options.requestId;
        callbacks.forEach(callback =>
          callback({ payload: { requestId: request, percent } })
        );
      };
      win.finishFile = (fail = false) => {
        const pending = win.pendingFiles.shift();
        if (!pending) throw new Error('Нет скачивания');
        const { options, resolve, reject } = pending;
        if (fail || (options.size && options.size !== 1024))
          return reject({
            code: 'FILE_SIZE',
            message: 'Файл скачан не полностью. Повторите скачивание'
          });
        const fileName = `image-${win.savedFiles.size}.png`;
        const result = {
          downloaded: true,
          fileName,
          path: `C:/fixture-downloads/${fileName}`,
          mimeType: 'image/webp'
        };
        win.savedFiles.set(key(options.url), result);
        resolve(result);
      };
      if (native) {
        win.isTauri = true;
        win.__TAURI_INTERNALS__ = {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { label: 'main' }
          },
          transformCallback: (callback: any) => {
            callbacks.set(++id, callback);
            return id;
          },
          invoke: async (command: string, args: any = {}) => {
            if (command === 'plugin:event|listen') return args.handler;
            if (command === 'plugin:event|unlisten') return;
            if (command === 'desktop_file_status')
              return (
                win.savedFiles.get(key(args.options.url)) || {
                  downloaded: false,
                  fileName: args.options.fileName,
                  path: '',
                  mimeType: ''
                }
              );
            if (command === 'desktop_file_download') {
              win.fileCalls.push(args.options);
              return new Promise((resolve, reject) =>
                win.pendingFiles.push({
                  options: args.options,
                  resolve,
                  reject
                })
              );
            }
            if (command === 'desktop_file_open') {
              win.revealedFile = args;
              return win.savedFiles.get(key(args.options.url));
            }
            return null;
          }
        };
        win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
      }
      win.clipboardWrites = [];
      win.clipboardDenied = false;
      if (!win.ClipboardItem)
        win.ClipboardItem = class {
          static supports() {
            return true;
          }
          types: string[];
          constructor(private data: Record<string, Blob | Promise<Blob>>) {
            this.types = Object.keys(data);
          }
          getType(type: string) {
            return Promise.resolve(this.data[type]);
          }
        };
      // В этом стенде Clipboard API подменён целиком и принимает файловые MIME.
      win.ClipboardItem.supports = () => true;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            if (win.clipboardDenied) throw new Error('Буфер недоступен');
            win.clipboardWrites.push(text);
          },
          write: async (items: ClipboardItem[]) => {
            if (win.clipboardDenied) throw new Error('Буфер недоступен');
            await new Promise<void>(resolve => {
              win.finishCopy = resolve;
            });
            await Promise.all(
              items.flatMap(item => item.types.map(type => item.getType(type)))
            );
            win.clipboardWrites.push('вложение');
          }
        }
      });
      document.execCommand = () => false;
    },
    { native }
  );
  await page.goto('/e2e/fixtures/file-operation-feedback.html' + query);
  await expect(
    page.getByTestId('photo-message-MessageBubble-Container')
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).fileOperationFixture))
    .toBe(true);
}

async function menu(page: Page, rowId: string, mediaIndex?: number) {
  const row = page.getByTestId(`${rowId}-MessageBubble-Container`);
  if (mediaIndex !== undefined)
    await row
      .locator('[data-message-media-id]')
      .nth(mediaIndex)
      .click({ button: 'right' });
  else {
    const caption = row
      .locator('.message-media__caption-text, .message-content__html')
      .first();
    if (await caption.count()) await caption.click({ button: 'right' });
    else await row.click({ button: 'right', position: { x: 2, y: 2 } });
  }
}

test('Скачать всё сохраняет обработанные картинки, показывает проценты и папку выбранной фотографии', async ({
  page
}) => {
  await open(page);
  await menu(page, 'photo-message');
  await page.getByRole('button', { name: 'Скачать всё', exact: true }).click();
  for (let index = 0; index < 4; index++) {
    await expect
      .poll(() => page.evaluate(() => (window as any).pendingFiles.length))
      .toBe(1);
    expect(
      await page.evaluate(() => (window as any).fileCalls.at(-1).size)
    ).toBeUndefined();
    await page.evaluate(() => (window as any).emitFileProgress(43));
    await expect(
      page.getByRole('status').filter({ hasText: '43%' })
    ).toBeVisible();
    await page.evaluate(() => (window as any).finishFile());
  }
  await expect(
    page.getByText('Файл скачан: image-3.png', { exact: true })
  ).toBeVisible();
  await menu(page, 'photo-message', 2);
  await page
    .getByRole('button', { name: 'Показать в папке', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).revealedFile?.options.url))
    .toContain('compressed-image-2.webp');
});

test('слайдер показывает сохранение и копирование, меню текста подтверждает результат', async ({
  page
}) => {
  await open(page);
  await page
    .getByTestId('photo-message-MessageBubble-Container')
    .locator('img')
    .first()
    .click();
  const download = page
    .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
    .first();
  await expect(download).toBeVisible();
  await download.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingFiles.length))
    .toBe(1);
  await page.evaluate(() => (window as any).emitFileProgress(61));
  await expect(
    page.getByRole('status').filter({ hasText: '61%' })
  ).toBeVisible();
  await page.evaluate(() => (window as any).finishFile());
  await expect(
    page.getByText('Файл скачан: image-0.png', { exact: true })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Скопировать изображение', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Копируем…' })
  ).toBeVisible();
  await page.waitForTimeout(3100);
  await expect(
    page.getByRole('status').filter({ hasText: 'Копируем…' })
  ).toBeVisible();
  await page.evaluate(() => (window as any).finishCopy());
  await expect(
    page.getByRole('status').filter({ hasText: 'Скопировано' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await menu(page, 'text-message');
  await page
    .getByRole('button', { name: 'Копировать текст', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Текст скопирован' })
  ).toBeVisible();
});

for (const kind of ['фото', 'файл'] as const) {
  test(`контекстное меню подтверждает копирование: ${kind}`, async ({
    page
  }) => {
    await open(page);
    await menu(
      page,
      kind === 'фото' ? 'photo-message' : 'file-message',
      kind === 'фото' ? 1 : undefined
    );
    await page
      .getByRole('button', { name: `Копировать ${kind}`, exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Копируем…' })
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).finishCopy))
      .toBe('function');
    await page.evaluate(() => (window as any).finishCopy());
    await expect(
      page.getByRole('status').filter({ hasText: 'Вложение скопировано' })
    ).toBeVisible();
  });
}

test('отказ буфера не превращается в успешное копирование', async ({
  page
}) => {
  await open(page);
  await page.evaluate(() => ((window as any).clipboardDenied = true));
  await menu(page, 'text-message');
  await page
    .getByRole('button', { name: 'Копировать текст', exact: true })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Текст скопирован', { exact: true })).toHaveCount(
    0
  );
});

test('уведомления, полученные до открытия интерфейса, сразу видны и не накладываются', async ({
  page
}) => {
  await open(page, false, '?startup');
  const cards = page.getByTestId('Notification');
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeVisible();
  const first = await cards.first().boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height + 8);
});

for (const dark of [false, true]) {
  test(`новые уведомления соответствуют макету и не перекрываются — ${dark ? 'тёмные' : 'светлые'}`, async ({
    page
  }) => {
    await open(page);
    await page.evaluate(dark => {
      document.documentElement.classList.toggle('theme-dark', dark);
      const fixture = (window as any).fileOperationFixture;
      fixture.closeNotification();
      fixture.notification('info', 'Сейчас будет обновление');
      fixture.notification('success', 'Файл успешно перенесен в архив');
      fixture.notification('warning', 'Предупреждение');
      fixture.notification('error', 'Страница не загрузилась');
    }, dark);
    const cards = page.getByTestId('Notification');
    await expect(cards).toHaveCount(4);
    const boxes = await cards.evaluateAll(elements =>
      elements.map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: rect.x,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          border: style.borderTopWidth,
          radius: style.borderRadius
        };
      })
    );
    for (const [index, box] of boxes.entries()) {
      expect(box.width).toBe(320);
      expect(box.height).toBe(48);
      expect(box.border).toBe('2px');
      expect(box.radius).toBe('5px');
      if (index)
        expect(box.top - boxes[index - 1].bottom).toBeGreaterThanOrEqual(8);
    }
    await page.screenshot({
      path: test
        .info()
        .outputPath(`notifications-${dark ? 'dark' : 'light'}.png`)
    });
    await cards
      .first()
      .getByRole('button', { name: 'Закрыть уведомление' })
      .click();
    await expect(cards).toHaveCount(3);
  });
}

test('время подписи остаётся внизу пузыря при узкой ширине', async ({
  page
}) => {
  await open(page, false);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => (document.body.style.padding = '16px'));
    const caption = page.locator('.message-media__caption');
    const bounds = await caption.evaluate(element => {
      const caption = element.getBoundingClientRect();
      const text = element
        .querySelector('.message-media__caption-text')!
        .getBoundingClientRect();
      const time = element
        .querySelector('.message-media__caption-time')!
        .getBoundingClientRect();
      return {
        caption: { right: caption.right, bottom: caption.bottom },
        text: { right: text.right, bottom: text.bottom },
        time: {
          left: time.left,
          right: time.right,
          bottom: time.bottom,
          top: time.top
        }
      };
    });
    expect(bounds.time.right).toBeLessThanOrEqual(bounds.caption.right - 14);
    expect(bounds.caption.bottom - bounds.time.bottom).toBeCloseTo(11.5, 0);
    expect(
      bounds.text.right <= bounds.time.left ||
        bounds.text.bottom <= bounds.time.top
    ).toBe(true);
  }
  await page.screenshot({ path: test.info().outputPath('caption-320.png') });
});

test('ошибка сохранения не показывается как успех, повтор работает', async ({
  page
}) => {
  await open(page);
  await menu(page, 'photo-message', 0);
  await page.getByRole('button', { name: 'Скачать', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingFiles.length))
    .toBe(1);
  await page.evaluate(() => (window as any).finishFile(true));
  await expect(page.getByRole('alert')).toHaveText(
    'Файл скачан не полностью. Повторите скачивание'
  );
  await expect(page.getByText(/Файл скачан:/)).toHaveCount(0);
  await menu(page, 'photo-message', 0);
  await page.getByRole('button', { name: 'Скачать', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).pendingFiles.length))
    .toBe(1);
  await page.evaluate(() => (window as any).finishFile());
  await expect(
    page.getByText('Файл скачан: image-0.png', { exact: true })
  ).toBeVisible();
});
