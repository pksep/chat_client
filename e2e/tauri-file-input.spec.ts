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
    win.nativeDrop = (
      type: string,
      paths: string[],
      position = { x: 200, y: 200 }
    ) => {
      const event = `tauri://drag-${type}`;
      for (const listener of listeners.filter(item => item.event === event))
        callbacks.get(listener.handler)?.({
          event,
          id: listener.id,
          payload: { paths, position }
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

const installMedia = async (page: Page) => {
  await page.evaluate(async () => {
    const win = window as any;
    win.localFiles['C:\\Pictures\\photo.PNG'] = {
      name: 'photo.PNG',
      mimeType: 'image/png',
      bytes: Array.from(
        atob(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        ),
        char => char.charCodeAt(0)
      )
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => chunks.push(event.data);
    const done = new Promise(resolve => (recorder.onstop = resolve));
    recorder.start();
    canvas.getContext('2d')!.fillRect(0, 0, 32, 32);
    await new Promise(resolve => setTimeout(resolve, 250));
    recorder.stop();
    await done;
    stream.getTracks().forEach(track => track.stop());
    win.localFiles['C:\\Videos\\clip.webm'] = {
      name: 'clip.webm',
      mimeType: 'video/webm',
      bytes: Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
    };
  });
};

const nativePosition = async (page: Page, mode: 'file' | 'media') => {
  const zone = page.locator(`[data-drop-mode="${mode}"]`);
  await expect(zone).toBeVisible();
  return zone.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: (rect.left + rect.width / 2) * window.devicePixelRatio,
      y: (rect.top + rect.height / 2) * window.devicePixelRatio
    };
  });
};

test.describe('выбор формата native drop при масштабе Windows 200%', () => {
  test.use({ deviceScaleFactor: 2 });

  for (const name of ['photo.PNG', 'clip.webm']) {
    for (const mode of ['file', 'media'] as const) {
      test(`${name}: выбранная зона ${mode} сохраняет формат отправки`, async ({
        page
      }) => {
        await setupTauri(page);
        await openFixture(page);
        await installMedia(page);
        const path =
          name === 'photo.PNG'
            ? 'C:\\Pictures\\photo.PNG'
            : 'C:\\Videos\\clip.webm';
        await expect
          .poll(() => page.evaluate(() => (window as any).nativeReady()))
          .toBe(true);
        await page.evaluate(
          path => (window as any).nativeDrop('enter', [path]),
          path
        );
        await expect(page.locator('[data-drop-mode]')).toHaveCount(2);
        await expect(page.locator('.drag-overlay')).toHaveCount(0);
        const position = await nativePosition(page, mode);
        await page.evaluate(
          ({ path, position }) => {
            (window as any).nativeDrop('over', [path], position);
          },
          { path, position }
        );
        await expect(page.locator(`[data-drop-mode="${mode}"]`)).toHaveClass(
          /--active/
        );
        await page.evaluate(
          ({ path, position }) => {
            (window as any).nativeDrop('drop', [path], position);
          },
          { path, position }
        );
        await sendPreview(page);
        await expect
          .poll(() => page.evaluate(() => (window as any).attachments.length))
          .toBe(1);
        expect(
          await page.evaluate(() => (window as any).attachments[0].kind)
        ).toBe(mode);
        expect(
          await page.evaluate(() => (window as any).attachments[0].name)
        ).toBe(name);
      });
    }
  }
});

test.describe('native drop на Mac Retina', () => {
  test.use({ deviceScaleFactor: 2 });

  for (const mode of ['file', 'media'] as const) {
    test(`Cocoa points: фото отправляется в выбранном формате ${mode}`, async ({
      page
    }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'platform', { value: 'MacIntel' });
        Object.defineProperty(navigator, 'userAgentData', { value: undefined });
      });
      await setupTauri(page);
      await openFixture(page);
      await installMedia(page);
      await expect
        .poll(() => page.evaluate(() => (window as any).nativeReady()))
        .toBe(true);
      await page.evaluate(() =>
        (window as any).nativeDrop('enter', ['C:\\Pictures\\photo.PNG'])
      );
      const position = await page
        .locator(`[data-drop-mode="${mode}"]`)
        .evaluate(element => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          };
        });
      await page.evaluate(position => {
        (window as any).nativeDrop(
          'drop',
          ['C:\\Pictures\\photo.PNG'],
          position
        );
      }, position);
      await sendPreview(page);
      await expect
        .poll(() => page.evaluate(() => (window as any).attachments[0]?.kind))
        .toBe(mode);
    });
  }

  test('HTML dragover без MIME не скрывает распознанную native зону фото', async ({
    page
  }) => {
    await setupTauri(page);
    await openFixture(page);
    await expect
      .poll(() => page.evaluate(() => (window as any).nativeReady()))
      .toBe(true);
    await page.evaluate(() =>
      (window as any).nativeDrop('enter', ['C:\\Pictures\\photo.PNG'])
    );
    await expect(page.locator('[data-drop-mode]')).toHaveCount(2);
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['local'], 'unknown', { type: '' }));
      Object.defineProperty(transfer, 'files', { value: [] });
      window.dispatchEvent(
        new DragEvent('dragover', {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true
        })
      );
    });
    await expect(page.locator('[data-drop-mode]')).toHaveCount(2);
  });
});

test('переход Tauri проходит через промежуточную прозрачность при входе и выходе', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).nativeReady()))
    .toBe(true);
  const sample = async (type: 'enter' | 'leave') =>
    page.evaluate(async type => {
      const values: number[] = [];
      (window as any).nativeDrop(type, ['C:\\Pictures\\photo.PNG']);
      for (let frame = 0; frame < 30; frame++) {
        await new Promise(requestAnimationFrame);
        const overlay = document.querySelector('.chat__input-tauri-dropzone');
        if (overlay) values.push(Number(getComputedStyle(overlay).opacity));
      }
      return values;
    }, type);
  const enter = await sample('enter');
  expect(enter.some(value => value > 0 && value < 1)).toBe(true);
  await expect(page.locator('[data-drop-mode]')).toHaveCount(2);
  await page.screenshot({ path: 'doc/images/tauri-drop-zones.png' });
  const leave = await sample('leave');
  expect(leave.some(value => value > 0 && value < 1)).toBe(true);
  await expect(page.getByTestId('Drop-MessageList-TauriDropzone')).toHaveCount(
    0
  );
});

test('HTML drop в Tauri выбирает нижнюю зону, а смешанные файлы не теряются', async ({
  page
}) => {
  await setupTauri(page);
  await openFixture(page);
  await installMedia(page);
  const transfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    const file = (window as any).localFiles['C:\\Pictures\\photo.PNG'];
    transfer.items.add(
      new File([new Uint8Array(file.bytes)], file.name, { type: file.mimeType })
    );
    transfer.items.add(
      new File(['document'], 'notes.txt', { type: 'text/plain' })
    );
    return transfer;
  });
  await page.locator('body').dispatchEvent('dragenter', {
    dataTransfer: transfer,
    clientX: 100,
    clientY: 100
  });
  await expect(page.locator('[data-drop-mode]')).toHaveCount(2);
  const rect = await page.locator('[data-drop-mode="media"]').boundingBox();
  await page.locator('body').dispatchEvent('drop', {
    dataTransfer: transfer,
    clientX: rect!.x + rect!.width / 2,
    clientY: rect!.y + rect!.height / 2
  });
  await sendPreview(page);
  await expect
    .poll(() => page.evaluate(() => (window as any).attachments.length))
    .toBe(2);
  expect(
    await page.evaluate(() =>
      (window as any).attachments.map((file: any) => file.name).sort()
    )
  ).toEqual(['notes.txt', 'photo.PNG']);
  expect(
    await page.evaluate(() =>
      (window as any).attachments.map((file: any) => file.kind).sort()
    )
  ).toEqual(['file', 'media']);
});
