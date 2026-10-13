import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';
import { stickerPreviewBytes as png } from './fixtures/sticker-catalog';

const animated = {
  id: 'copied-animated-sticker',
  pack: 'clipboard-test',
  version: 1,
  path: `objects/${'1'.repeat(64)}.tgs`,
  previewPath: `objects/${'2'.repeat(64)}.png`,
  messagePreviewPath: `objects/${'2'.repeat(64)}.png`,
  width: 512,
  height: 512,
  format: 'tgs',
  animationDurationMs: 1000
};
const tgs = gzipSync(
  JSON.stringify({
    v: '5.7.4',
    fr: 60,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    nm: 'Clipboard fixture',
    ddd: 0,
    assets: [],
    layers: []
  })
);

async function setup(page: Page, nativeClipboard = false) {
  if (nativeClipboard)
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
  else
    await page.addInitScript(() => {
      const state = { items: [] as ClipboardItem[], text: '' };
      (window as any).testClipboard = state;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: async (items: ClipboardItem[]) => {
            await Promise.all(
              items.flatMap(item => item.types.map(type => item.getType(type)))
            );
            state.items = items;
            state.text = await (await items[0].getType('text/plain')).text();
          },
          writeText: async (text: string) => {
            state.text = text;
            state.items = [];
          },
          read: async () => state.items,
          readText: async () => state.text
        }
      });
    });
  const state = await openFixture(page, { count: 0, topicCount: 2 });
  await page.evaluate(async () => {
    const path = '/src/services/useConfig.ts';
    const { setConfig } = await import(/* @vite-ignore */ path);
    setConfig({
      CHAT_API_DOMAIN: `${location.origin}/performance-api`,
      CHAT_PATH_TO_FILE_CDN: `${location.origin}/performance-api/media/object`
    });
  });
  await page.route('**/performance-api/stickers/assets/**', route => {
    const path = new URL(route.request().url()).pathname.split('/assets/')[1];
    return route.fulfill({
      body: path.endsWith('.tgs') ? tgs : png
    });
  });
  await page.route('**/performance-api/media/object/**', route =>
    route.fulfill({ body: png, contentType: 'image/png' })
  );
  await openTopic(page, 0);
  await expect(
    page.locator('.ProseMirror[contenteditable="true"]')
  ).toBeVisible();
  return state;
}

async function seed(page: Page, data: Record<string, unknown>) {
  const row = { ...makeMessages('performance-0', 1)[0], ...data };
  await page.evaluate(
    row => (window as any).topicPerformance.seed('performance-0', [row]),
    row
  );
  return page.locator('[data-message-id="performance-0-message-0"]').first();
}

async function readCopy(page: Page) {
  return page.evaluate(async () => {
    const items = (window as any).testClipboard.items as ClipboardItem[];
    const html = await (await items[0].getType('text/html')).text();
    const path = '/src/utils/chat-clipboard.ts';
    const { readChatClipboardContent } = await import(/* @vite-ignore */ path);
    return readChatClipboardContent(html);
  });
}

async function paste(page: Page, focused: boolean) {
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  if (!focused) {
    await page.getByTestId('open-performance-0').focus();
    await page.keyboard.press('Control+V');
    return;
  }
  await editor.focus();
  await editor.evaluate(async element => {
    const state = (window as any).testClipboard;
    const transfer = new DataTransfer();
    transfer.setData('text/plain', state.text);
    transfer.setData(
      'text/html',
      await (await state.items[0].getType('text/html')).text()
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        composed: true,
        cancelable: true,
        clipboardData: transfer
      })
    );
  });
}

async function sentMessages(page: Page, topicId = 'performance-0') {
  return page.evaluate(
    topicId =>
      (window as any).topicPerformance.messages
        .getFullMessagesByTopicId(topicId)
        .filter((row: { id: string }) => !row.id.startsWith('performance-')),
    topicId
  );
}

for (const focused of [true, false]) {
  test(`копирование анимированного стикера сохраняет оригинал, вставка ${focused ? 'с фокусом' : 'без фокуса'} отправляет один стикер`, async ({
    page
  }) => {
    const state = await setup(page);
    const {
      path,
      previewPath,
      messagePreviewPath,
      width,
      height,
      format,
      animationDurationMs
    } = animated;
    const reference = {
      id: animated.id,
      pack: animated.pack,
      version: animated.version,
      asset: {
        path,
        previewPath,
        messagePreviewPath,
        width,
        height,
        format,
        animationDurationMs
      }
    };
    const row = await seed(page, {
      text: 'Стикер: Рыба',
      ex: JSON.stringify({ kind: 'sticker', sticker: reference })
    });
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await editor.fill('Мой черновик');
    const draft = await editor.innerHTML();
    await row.locator('.message-sticker__image').click({ button: 'right' });
    await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
      1
    );
    await expect(
      page.getByRole('button', { name: 'Копировать текст', exact: true })
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Копировать стикер', exact: true })
      .click();
    expect((await readCopy(page)).sticker).toMatchObject(reference);
    await paste(page, focused);
    await expect.poll(async () => (await sentMessages(page)).length).toBe(1);
    expect(JSON.parse((await sentMessages(page))[0].ex).sticker).toEqual(
      reference
    );
    await expect(editor).toHaveJSProperty('innerHTML', draft);
    expect(state.errors).toEqual([]);
  });

  for (const [type, label, name, mime] of [
    ['IMAGE', 'фото', 'second.png', 'image/png'],
    ['VIDEO', 'видео', 'second.webm', 'video/webm'],
    ['FILE', 'файл', 'second.txt', 'text/plain']
  ]) {
    test(`правый клик копирует только второе ${label}, Ctrl+V ${focused ? 'с фокусом' : 'без фокуса'} открывает вложение перед отправкой оригинальных байтов`, async ({
      page
    }) => {
      const state = await setup(page);
      let bytes = png;
      if (type === 'FILE')
        bytes = Buffer.from('Оригинальный файл, а не превью');
      if (type === 'VIDEO') {
        bytes = Buffer.from(
          await page.evaluate(async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const context = canvas.getContext('2d')!;
            context.fillStyle = '#ed5432';
            context.fillRect(0, 0, 64, 64);
            const stream = canvas.captureStream(10);
            const recorder = new MediaRecorder(stream, {
              mimeType: 'video/webm'
            });
            const chunks: Blob[] = [];
            recorder.ondataavailable = event => chunks.push(event.data);
            const stopped = new Promise<void>(resolve => {
              recorder.onstop = () => resolve();
            });
            recorder.start();
            await new Promise(resolve => setTimeout(resolve, 250));
            recorder.stop();
            await stopped;
            stream.getTracks().forEach(track => track.stop());
            return Array.from(
              new Uint8Array(await new Blob(chunks).arrayBuffer())
            );
          })
        );
      }
      await page.route(
        '**/performance-api/media/object/original-second*',
        route => route.fulfill({ body: bytes, contentType: mime })
      );
      const media = [0, 1].map(index => ({
        id: `attachment-${index}`,
        path: index ? 'original-second' : 'original-first',
        thumbnailPath: `preview-${index}.png`,
        originName: index ? name : 'first-file',
        size: bytes.length,
        type,
        ex: { width: 64, height: 64 }
      }));
      const row = await seed(page, {
        text: '<p>Подпись к вложениям</p>',
        media
      });
      const editor = page.locator('.ProseMirror[contenteditable="true"]');
      await editor.fill('Мой черновик');
      await row
        .locator('[data-message-media-id="attachment-1"]')
        .click({ button: 'right' });
      await expect(
        page.getByRole('button', { name: /^Копировать/ })
      ).toHaveCount(1);
      await page
        .getByRole('button', { name: `Копировать ${label}`, exact: true })
        .click();
      expect((await readCopy(page)).media).toMatchObject({
        id: 'attachment-1',
        path: 'original-second',
        originName: name,
        type
      });
      await paste(page, focused);
      const modal = page.locator('dialog.attach-modal-container');
      await expect(modal).toBeVisible();
      expect(await sentMessages(page)).toHaveLength(0);
      await expect(modal.locator('.ProseMirror')).toHaveText('Мой черновик');
      await modal.locator('button.primary-yui-kit.right').click();
      await expect(modal).toHaveCount(0);
      await expect.poll(async () => (await sentMessages(page)).length).toBe(1);
      const sent = (await sentMessages(page))[0];
      expect(sent.media).toHaveLength(1);
      expect(sent.media[0]).toMatchObject({
        originName: name,
        size: bytes.length,
        type
      });
      const queued = await page.evaluate(async messageId => {
        const payload = await (
          window as any
        ).topicPerformance.messages.getPendingUploadFile(
          'performance-0',
          messageId,
          '0'
        );
        return {
          name: payload.file.name,
          type: payload.file.type,
          bytes: Array.from(new Uint8Array(await payload.file.arrayBuffer()))
        };
      }, sent.id);
      expect(queued).toEqual({ name, type: mime, bytes: Array.from(bytes) });
      await expect(editor).toHaveText('');
      expect(state.errors).toEqual([]);
    });
  }

  test(`закрытие модалки после Ctrl+V ${focused ? 'с фокусом' : 'без фокуса'} сохраняет черновик и не отправляет файл`, async ({
    page
  }) => {
    const state = await setup(page);
    const row = await seed(page, {
      text: '',
      media: [
        {
          id: 'cancelled-file',
          path: 'cancelled-file.txt',
          originName: 'неотправленный.txt',
          size: png.length,
          type: 'FILE'
        }
      ]
    });
    const editor = page.locator('.ProseMirror[contenteditable="true"]');
    await editor.fill('Несохранённый черновик');
    await row
      .locator('[data-message-media-id="cancelled-file"]')
      .click({ button: 'right' });
    await page
      .getByRole('button', { name: 'Копировать файл', exact: true })
      .click();
    await paste(page, focused);
    const modal = page.locator('dialog.attach-modal-container');
    await expect(modal).toBeVisible();
    expect(await sentMessages(page)).toHaveLength(0);
    await modal.locator('.attach-modal__close').click();
    await expect(modal).toHaveCount(0);
    await expect(editor).toHaveText('Несохранённый черновик');
    expect(await sentMessages(page)).toHaveLength(0);
    expect(state.errors).toEqual([]);
  });
}

test('правый клик на подпись предлагает только текст; вставка без фокуса сохраняет текст и URL', async ({
  page
}) => {
  await setup(page);
  const row = await seed(page, {
    text: '<p>Текст рядом с фото &amp; видео</p>',
    media: [
      {
        id: 'photo',
        path: 'photo.png',
        thumbnailPath: 'thumb.png',
        originName: 'photo.png',
        size: png.length,
        type: 'IMAGE',
        ex: { width: 64, height: 64 }
      }
    ]
  });
  await row.locator('.message-content__html').click({ button: 'right' });
  await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
    1
  );
  await page
    .getByRole('button', { name: 'Копировать текст', exact: true })
    .click();
  expect(await page.evaluate(() => (window as any).testClipboard.text)).toBe(
    'Текст рядом с фото & видео'
  );
  const editor = page.locator('.ProseMirror[contenteditable="true"]');
  await editor.fill('');
  await page.getByTestId('open-performance-0').focus();
  await page.keyboard.press('Control+V');
  await expect(editor).toHaveText('Текст рядом с фото & видео');
  await page.evaluate(() => {
    (window as any).testClipboard.text = 'https://example.com/file';
  });
  await page.getByTestId('open-performance-0').focus();
  await page.keyboard.press('Control+V');
  await expect(editor.locator('a')).toHaveAttribute(
    'href',
    'https://example.com/file'
  );
  expect(await sentMessages(page)).toHaveLength(0);
});

test('сообщение с несколькими фото без подписи сохраняет одну кнопку копирования', async ({
  page
}) => {
  await setup(page);
  const row = await seed(page, {
    text: '',
    media: [0, 1].map(index => ({
      id: `photo-${index}`,
      path: `photo-${index}.png`,
      originName: `photo-${index}.png`,
      size: String(png.length),
      type: 'IMAGE',
      ex: { width: 64, height: 64 }
    }))
  });
  await row.evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 10,
        clientY: rect.bottom - 10
      })
    );
  });
  await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
    1
  );
  await page
    .getByRole('button', { name: 'Копировать фото', exact: true })
    .click();
  expect((await readCopy(page)).media.id).toBe('photo-0');
});

test('вставка в другое поле и смена чата во время чтения буфера не отправляют вложение', async ({
  page
}) => {
  await setup(page);
  const row = await seed(page, {
    text: '',
    media: [
      {
        id: 'file',
        path: 'delayed.txt',
        originName: 'delayed.txt',
        size: 4,
        type: 'FILE'
      }
    ]
  });
  await row
    .locator('[data-message-media-id="file"]')
    .click({ button: 'right' });
  await page
    .getByRole('button', { name: 'Копировать файл', exact: true })
    .click();
  const prevented = await page.evaluate(async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const transfer = new DataTransfer();
    transfer.setData(
      'text/html',
      await (
        await (window as any).testClipboard.items[0].getType('text/html')
      ).text()
    );
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      composed: true,
      cancelable: true,
      clipboardData: transfer
    });
    input.dispatchEvent(event);
    input.remove();
    return event.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await page.evaluate(() => {
    (window as any).clipboardReadStarted = false;
    navigator.clipboard.read = () =>
      new Promise(resolve => {
        (window as any).clipboardReadStarted = true;
        (window as any).releaseClipboardRead = () => {
          resolve((window as any).testClipboard.items);
          (window as any).clipboardReadFinished = true;
        };
      });
  });
  await paste(page, true);
  await expect
    .poll(() => page.evaluate(() => (window as any).clipboardReadStarted))
    .toBe(true);
  await openTopic(page, 1);
  await page.evaluate(() => (window as any).releaseClipboardRead());
  await expect(
    page.locator('.ProseMirror[contenteditable="true"]')
  ).toBeVisible();
  await expect(page.locator('dialog.attach-modal-container')).toHaveCount(0);
  expect(await sentMessages(page)).toHaveLength(0);
  expect(await sentMessages(page, 'performance-1')).toHaveLength(0);
});

for (const focused of [true, false]) {
  test(`системный буфер содержит исходные байты, PNG для внешних приложений и открывает модалку вложения ${focused ? 'с фокусом' : 'без фокуса'}`, async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Системный буфер проверяется последовательно на десктопе'
    );
    await setup(page, true);
    for (const [index, type, name, mime, bytes] of [
      [0, 'IMAGE', 'original.png', 'image/png', png],
      [
        1,
        'FILE',
        'original.txt',
        'text/plain',
        Buffer.from('Оригинальные байты файла')
      ],
      [
        2,
        'VIDEO',
        'original.webm',
        'video/webm',
        Buffer.from([26, 69, 223, 163, 0, 1, 2, 3])
      ]
    ] as const) {
      await page.route(
        `**/performance-api/media/object/native-${index}*`,
        route => route.fulfill({ body: bytes, contentType: mime })
      );
      const row = await seed(page, {
        text: '<p>Подпись</p>',
        media: [
          {
            id: `native-${index}`,
            path: `native-${index}`,
            originName: name,
            size: bytes.length,
            type,
            ex: { width: 64, height: 64 }
          }
        ]
      });
      await row
        .locator(`[data-message-media-id="native-${index}"]`)
        .click({ button: 'right' });
      await page
        .getByRole('button', { name: /^Копировать (фото|файл|видео)$/ })
        .click();
      await expect(page.locator('.context-menu')).toHaveCount(0);
      const copied = await page.evaluate(async () => {
        const item = (await navigator.clipboard.read())[0];
        const original = await item.getType('web application/x-sep-chat-file');
        const html = await (await item.getType('text/html')).text();
        const path = '/src/utils/chat-clipboard.ts';
        const { readChatClipboardContent } = await import(
          /* @vite-ignore */ path
        );
        return {
          types: item.types,
          bytes: Array.from(new Uint8Array(await original.arrayBuffer())),
          text: await navigator.clipboard.readText(),
          content: readChatClipboardContent(html)
        };
      });
      expect(copied.bytes).toEqual(Array.from(bytes));
      expect(copied.text).toBe(name);
      expect(copied.content?.media).toMatchObject({
        id: `native-${index}`,
        mimeType: mime
      });
      if (type === 'IMAGE') expect(copied.types).toContain('image/png');
      const editor = page.locator('.ProseMirror[contenteditable="true"]');
      await editor.fill('Черновик остаётся');
      if (focused) await editor.focus();
      else await page.getByTestId('open-performance-0').focus();
      await page.keyboard.press('Control+V');
      const modal = page.locator('dialog.attach-modal-container');
      await expect(modal).toBeVisible();
      expect(await sentMessages(page)).toHaveLength(0);
      await expect(modal.locator('.ProseMirror')).toHaveText(
        'Черновик остаётся'
      );
      await modal.locator('button.primary-yui-kit.right').click();
      await expect(modal).toHaveCount(0);
      await expect.poll(async () => (await sentMessages(page)).length).toBe(1);
      const sent = (await sentMessages(page))[0];
      expect(sent.media[0]).toMatchObject({
        originName: name,
        size: bytes.length,
        type
      });
      const uploaded = await page.evaluate(async id => {
        const { file } = await (
          window as any
        ).topicPerformance.messages.getPendingUploadFile(
          'performance-0',
          id,
          '0'
        );
        return {
          name: file.name,
          type: file.type,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
        };
      }, sent.id);
      expect(uploaded).toEqual({ name, type: mime, bytes: Array.from(bytes) });
      await expect(editor).toHaveText('');
    }
  });
}

test('большие, недоступные и неподдерживаемые вложения не предлагают копирование текста или ссылки', async ({
  page
}) => {
  await setup(page);
  for (const type of ['IMAGE', 'VIDEO', 'FILE']) {
    const row = await seed(page, {
      text: '<p>Подпись</p>',
      media: [
        {
          id: 'large',
          path: 'large',
          originName: 'large',
          size: 21 * 1024 * 1024,
          type,
          ex: { width: 64, height: 64 }
        }
      ]
    });
    await row
      .locator('[data-message-media-id="large"]')
      .click({ button: 'right' });
    await expect(
      page.getByRole('button', { name: 'Скачать', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
      0
    );
    await page.locator('.ProseMirror').click();
  }
  await page.route('**/performance-api/media/object/missing*', route =>
    route.fulfill({ status: 404 })
  );
  const row = await seed(page, {
    text: '<p>Подпись</p>',
    media: [
      {
        id: 'missing',
        path: 'missing',
        originName: 'missing',
        size: 100,
        type: 'FILE'
      }
    ]
  });
  const failed = page.waitForResponse(
    '**/performance-api/media/object/missing*'
  );
  await row
    .locator('[data-message-media-id="missing"]')
    .click({ button: 'right' });
  await failed;
  await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
    0
  );
  await page.locator('.ProseMirror').click();
  await page.evaluate(() => {
    ClipboardItem.supports = () => false;
  });
  await row
    .locator('[data-message-media-id="missing"]')
    .click({ button: 'right' });
  await expect(page.getByRole('button', { name: /^Копировать/ })).toHaveCount(
    0
  );
});

test('кнопка копирования видна до загрузки оригинала и принимает немедленный клик', async ({
  page
}) => {
  await setup(page, true);
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(
    '**/performance-api/media/object/slow-original*',
    async route => {
      await gate;
      await route.fulfill({ body: png, contentType: 'image/png' });
    }
  );
  const row = await seed(page, {
    text: '',
    media: [
      {
        id: 'slow-original',
        path: 'slow-original',
        thumbnailPath: 'thumb.png',
        originName: 'slow.png',
        size: String(png.length),
        type: 'IMAGE',
        ex: { width: 64, height: 64 }
      }
    ]
  });
  const request = page.waitForRequest(
    '**/performance-api/media/object/slow-original*'
  );
  try {
    await row
      .locator('[data-message-media-id="slow-original"]')
      .click({ button: 'right' });
    await request;
    const button = page.getByRole('button', {
      name: 'Копировать фото',
      exact: true
    });
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toBeVisible();
    release();
    await expect(page.locator('.context-menu')).toHaveCount(0);
    const data = await page.evaluate(async () =>
      Array.from(
        new Uint8Array(
          await (
            await (
              await navigator.clipboard.read()
            )[0].getType('web application/x-sep-chat-file')
          ).arrayBuffer()
        )
      )
    );
    expect(data).toEqual(Array.from(png));
  } finally {
    release();
  }
});
