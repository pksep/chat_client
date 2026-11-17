import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'Проверка оконного Tauri и настольного предпросмотра');
});

test('одинаковые имена и размеры не подменяют папку исходного файла', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeReady()))
    .toBe(true);
  await page.evaluate(() => {
    const win = window as any;
    win.localFiles['C:\\Other\\first.txt'] = {
      ...win.localFiles['C:\\Originals\\first.txt']
    };
    win.nativeDrop('drop', [
      'C:\\Originals\\first.txt',
      'C:\\Other\\first.txt'
    ]);
  });
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments.length))
    .toBe(2);
  expect(
    await page.evaluate(() =>
      (window as any).fileCalls
        .filter((call: any) => call.command === 'desktop_file_register_source')
        .map((call: any) => call.args.path)
    )
  ).toEqual(['C:\\Originals\\first.txt', 'C:\\Other\\first.txt']);
});

test('native picker добавляет фото и дополнительные файлы из предпросмотра', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await page.evaluate(() => {
    const win = window as any;
    win.localFiles['C:\\Pictures\\pixel.png'] = {
      name: 'pixel.png',
      mimeType: 'image/png',
      bytes: Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        ),
        char => char.charCodeAt(0)
      )
    };
    win.pickPaths = ['C:\\Pictures\\pixel.png'];
  });
  await page.locator('.attach-file-button:visible').click();
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Фото или видео', { exact: true })
    .click();
  await expect(page.locator('.attach-modal img')).toBeVisible();
  await page.evaluate(
    () => ((window as any).pickPaths = ['C:\\Other\\second.txt'])
  );
  await page.locator('.attach-file-button:visible').click();
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Файл', { exact: true })
    .click();
  await expect(page.locator('.attach-modal__attachment-name')).toContainText(
    'second'
  );
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments.length))
    .toBe(2);
  expect(
    await page.evaluate(() =>
      (window as any).fileCalls
        .filter((call: any) => call.command === 'desktop_file_register_source')
        .map((call: any) => call.args.path)
        .sort()
    )
  ).toEqual(['C:\\Other\\second.txt', 'C:\\Pictures\\pixel.png']);
});

const setupTauri = async (page: Page) => {
  await page.addInitScript(() => {
    const win = window as any;
    const callbacks = new Map();
    const listeners: any[] = [];
    let nextId = 0;
    win.fileCalls = [];
    win.localFiles = {
      'C:\\Originals\\first.txt': {
        name: 'first.txt',
        mimeType: 'text/plain',
        bytes: [102, 105, 114, 115, 116]
      },
      'C:\\Other\\second.txt': {
        name: 'second.txt',
        mimeType: 'text/plain',
        bytes: [115, 101, 99, 111, 110, 100]
      }
    };
    const saved = new Map();
    win.isTauri = true;
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      },
      transformCallback: (callback: any) => {
        callbacks.set(++nextId, callback);
        return nextId;
      },
      unregisterCallback: (id: number) => callbacks.delete(id),
      invoke: async (command: string, args: any) => {
        win.fileCalls.push({ command, args });
        if (command === 'plugin:event|listen') {
          listeners.push({ ...args, id: ++nextId });
          return nextId;
        }
        if (command === 'plugin:event|unlisten') return;
        if (command === 'desktop_file_pick') return win.pickPaths || [];
        if (command === 'desktop_file_read_info') {
          const file = win.localFiles[args.path];
          if (!file) throw { message: 'Файл недоступен' };
          return {
            name: file.name,
            mimeType: file.mimeType,
            size: file.bytes.length,
            lastModified: 123456
          };
        }
        if (command === 'read_dropped_file') {
          if (win.holdRead)
            await new Promise(resolve => (win.finishRead = resolve));
          return new Uint8Array(win.localFiles[args.path].bytes).buffer;
        }
        if (command === 'desktop_file_register_source') {
          const status = {
            downloaded: true,
            path: args.path,
            fileName: args.options.fileName,
            mimeType: args.options.mimeType
          };
          saved.set(args.options.url, status);
          return status;
        }
        if (command === 'desktop_file_status')
          return saved.get(args.options.url) || { downloaded: false };
        if (command === 'desktop_file_open') return saved.get(args.options.url);
        if (command === 'plugin:app|version') return '1.6.8';
        if (command === 'plugin:app|name') return 'SEP Chat';
        return null;
      }
    };
    win.nativeDrop = (type: string, paths: string[]) => {
      const event = `tauri://drag-${type}`;
      for (const listener of listeners.filter(item => item.event === event))
        callbacks.get(listener.handler)?.({
          event,
          id: listener.id,
          payload: { paths, position: { x: 200, y: 200 } }
        });
    };
    win.nativeReady = () =>
      listeners.some(item => item.event === 'tauri://drag-drop');
  });
};

const openFixture = async (page: Page) => {
  await page.route('**/*', route =>
    ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort()
  );
  await page.goto('/e2e/fixtures/tauri-file-input.html');
  await expect(page.locator('.tiptap').first()).toBeVisible();
};
const sendPreview = async (page: Page) => {
  await expect(page.locator('.attach-modal')).toBeVisible();
  await page.locator('.attach-modal .tiptap').press('Enter');
};

test('native drop отправляет несколько файлов и сохраняет разные исходные папки', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeReady()))
    .toBe(true);
  await page.evaluate(() =>
    (window as any).nativeDrop('drop', [
      'C:\\Originals\\first.txt',
      'C:\\Other\\second.txt'
    ])
  );
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments.length))
    .toBe(2);
  const attachments = await page.evaluate(() => (window as any).attachments);
  expect(attachments.map((file: any) => file.text)).toEqual([
    'first',
    'second'
  ]);
  const originals = await page.evaluate(() =>
    (window as any).fileCalls
      .filter((call: any) => call.command === 'desktop_file_register_source')
      .map((call: any) => call.args.path)
  );
  expect(originals).toEqual([
    'C:\\Originals\\first.txt',
    'C:\\Other\\second.txt'
  ]);
  await page.evaluate(async () =>
    (window as any).nativeFiles.showNativeFileInFolder({
      id: 'uploaded/first.txt',
      path: 'uploaded/first.txt',
      originName: 'first.txt',
      size: 5
    })
  );
  expect(
    await page.evaluate(() =>
      (window as any).fileCalls.some(
        (call: any) => call.command === 'desktop_file_open' && call.args.reveal
      )
    )
  ).toBe(true);
});

test('скрепка Tauri использует native picker, сохраняет источник клонированного фото и не привязывает изменённые байты', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await page.evaluate(() => {
    (window as any).pickPaths = ['C:\\Originals\\first.txt'];
  });
  await page.locator('.attach-file-button:visible').click();
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Файл', { exact: true })
    .click();
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments.length))
    .toBe(1);
  await page.evaluate(async () => {
    const win = window as any;
    const [original] = await win.tauriUploads.readTauriFiles([
      'C:\\Originals\\first.txt'
    ]);
    const clone = new File([original], 'photo.png', {
      type: 'image/png',
      lastModified: original.lastModified
    });
    await win.uploadFile(clone);
    const edited = new File(['other'], 'edited.png', {
      type: 'image/png',
      lastModified: original.lastModified
    });
    await win.uploadFile(edited);
  });
  const names = await page.evaluate(() =>
    (window as any).fileCalls
      .filter((call: any) => call.command === 'desktop_file_register_source')
      .map((call: any) => call.args.options.fileName)
  );
  expect(names).toEqual(['first.txt', 'photo.png']);
});

test('Tauri принимает HTML drop без потери файлов', async ({ page }) => {
  await setupTauri(page);
  await openFixture(page);
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['html drop'], 'html.txt', { type: 'text/plain' })
    );
    return transfer;
  });
  await page
    .locator('.tiptap')
    .first()
    .dispatchEvent('drop', { dataTransfer: transfer });
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments[0]?.text))
    .toBe('html drop');
});

test('native чтение после смены чата не добавляет файлы в другой чат', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeReady()))
    .toBe(true);
  await page.evaluate(() => {
    const win = window as any;
    win.holdRead = true;
    win.nativeDrop('drop', ['C:\\Originals\\first.txt']);
  });
  await expect
    .poll(() => page.evaluate(() => !!(window as any).finishRead))
    .toBe(true);
  await page.evaluate(() => (window as any).changeTopic());
  await page.evaluate(() => {
    const win = window as any;
    win.holdRead = false;
    win.finishRead();
  });
  await expect(page.getByTestId('Drop-MessageList-TauriDropzone')).toHaveCount(
    0
  );
  await expect(page.locator('.attach-modal')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).attachments)).toEqual([]);
});

test('браузер сохраняет filechooser и отправку через DropZone', async ({
  page
}) => {
  await openFixture(page);
  await page.locator('.attach-file-button:visible').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page
    .locator('.attach-file-popover .popover-yui-kit__content:visible')
    .getByText('Файл', { exact: true })
    .click();
  const chooser = await chooserPromise;
  expect(chooser.isMultiple()).toBe(true);
  await chooser.setFiles({
    name: 'browser.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('browser picker')
  });
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments[0]?.text))
    .toBe('browser picker');
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['browser drop'], 'drop.txt', { type: 'text/plain' })
    );
    return transfer;
  });
  await page
    .locator('body')
    .dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('.drag-overlay')).toBeVisible();
  await page
    .locator('.drag-overlay__zone')
    .dispatchEvent('drop', { dataTransfer: transfer });
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments[1]?.text))
    .toBe('browser drop');
});
