import { test, expect, type Page } from '@playwright/test';
import { createPinFixtureApi } from './fixtures/pinned-messages-api';

const fixture = '/e2e/fixtures/pinned-messages.html';

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  await testInfo.attach('pin-layout.png', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  await testInfo.attach('pin-layout.json', {
    body: JSON.stringify(
      await page.evaluate(() => ({
        viewport: {
          width: innerWidth,
          height: innerHeight,
          x: scrollX,
          y: scrollY
        },
        elements: [
          ...document.querySelectorAll(
            '.chat, .chat__message-viewport, .chat__message-wrapper, .chat__message-bubble, .chat__message-navigation-overlay, .pinned-list, [data-message-id="01f0a010-7ff7-4e7b-b97b-000000000000"]'
          )
        ].map(element => {
          const style = getComputedStyle(element);
          return {
            class: element.className,
            bounds: element.getBoundingClientRect().toJSON(),
            scrollTop: element.scrollTop,
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight,
            display: style.display,
            visibility: style.visibility,
            overflow: style.overflow,
            transform: style.transform,
            gridRows: style.gridTemplateRows,
            gridRow: style.gridRow,
            animation: style.animation,
            animations: element.getAnimations().map(animation => ({
              playState: animation.playState,
              currentTime: animation.currentTime
            }))
          };
        })
      })),
      null,
      2
    ),
    contentType: 'application/json'
  });
});

const isNarrow = (page: Page) => (page.viewportSize()?.width || 1000) <= 768;
const noteAction = async (
  page: Page,
  action: 'Редактировать комментарий' | 'Удалить комментарий'
) => {
  if (isNarrow(page)) {
    await page.getByTestId('PinnedList').locator('.pin-note').first().tap();
    await page.getByRole('menuitem', { name: action }).click();
  } else
    await page
      .getByTestId('PinnedList')
      .getByRole('button', { name: action, exact: true })
      .first()
      .click();
};
export async function openPinnedFixture(
  page: Page,
  options: {
    old?: boolean;
    slow?: boolean;
    api?: ReturnType<typeof createPinFixtureApi>;
  } = {}
) {
  const errors: string[] = [];
  const api = options.api || createPinFixtureApi();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (url.pathname.startsWith('/pin-fixture-api/')) {
      if (url.pathname.endsWith('/pin-comments')) {
        if (options.old) return route.fulfill({ status: 404, json: {} });
        if (options.slow)
          await new Promise(resolve => setTimeout(resolve, 1500));
      }
      const response = api.execute(
        route.request().method(),
        url.pathname,
        route.request().postDataJSON()
      );
      return route.fulfill(response);
    }
    return route.fallback();
  });
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await expect
    .poll(() => page.evaluate(() => (window as any).pins?.ready))
    .toBe(true);
  await expect(page.getByTestId('Pinned-Messages')).toBeVisible();
  return errors;
}

test('иконка открывает хронологический список и сохраняет черновик при возврате', async ({
  page
}) => {
  const errors = await openPinnedFixture(page);
  const editor = page.locator('.tiptap').first();
  await expect(editor).toBeVisible();
  await editor.fill('Черновик не потерять');
  const original = page.locator(
    '[data-testid$="-MessageList-UserMessagesWrapper"]'
  );
  const before = await original.evaluate(element => element.scrollTop);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList')).toBeVisible();
  await expect(page.getByTestId('PinnedList-Header')).toContainText(
    '3 закреплённых сообщения'
  );
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    3
  );
  await expect(
    page.getByTestId('PinnedList').locator('textarea,.tiptap')
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId('PinnedList')
      .locator('.message-time svg:has(path[d^="M15.0586"])')
  ).toHaveCount(3);
  await expect(page.getByTestId('PinnedList').locator('.pin-note')).toHaveCount(
    3
  );
  await expect(
    page
      .getByTestId('PinnedList')
      .getByRole('button', { name: 'Редактировать комментарий', exact: true })
  ).toHaveCount(isNarrow(page) ? 0 : 2);
  await page.getByRole('button', { name: 'Назад в переписку' }).click();
  await expect(page.getByTestId('PinnedList')).toHaveCount(0);
  await expect(editor).toHaveText('Черновик не потерять');
  expect(await original.evaluate(element => element.scrollTop)).toBeCloseTo(
    before,
    0
  );
  expect(errors).toEqual([]);
});

test('список сразу показывает сохранённые закрепления при медленной сети', async ({
  page
}) => {
  const errors = await openPinnedFixture(page, { slow: true });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    3
  );
  await expect(page.getByTestId('PinnedList')).not.toContainText(
    'Загрузка закреплений'
  );
  expect(errors).toEqual([]);
});

test('сохранённые заметки видны после перезапуска до ответа медленного GET', async ({
  page
}) => {
  await openPinnedFixture(page);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList').locator('.pin-note')).toHaveCount(
    3
  );
  await page.evaluate(async () => {
    const fixture = (window as any).pins;
    await fixture.refresh();
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  let completed = false;
  await page.route('**/pin-comments', async route => {
    await held;
    completed = true;
    await route.fallback();
  });
  try {
    await page.goto(fixture, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('Pinned-Messages-ListButton').click();
    await expect(
      page.getByTestId('PinnedList').locator('.pin-note')
    ).toHaveCount(3);
    expect(completed).toBe(false);
  } finally {
    release();
  }
});

test('обе темы сохраняют центральные даты и не выходят за узкий экран', async ({
  page
}) => {
  await openPinnedFixture(page);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await page.setViewportSize({ width: 320, height: 720 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => (window as any).pins.setTheme(theme), theme);
    await page.waitForTimeout(300);
    const panel = await page.getByTestId('PinnedList').boundingBox();
    const divider = await page
      .getByTestId('PinnedList')
      .locator('.date-divider')
      .first()
      .boundingBox();
    expect(
      Math.abs(divider!.x + divider!.width / 2 - panel!.x - panel!.width / 2)
    ).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth
      )
    ).toBe(false);
    await expect(
      page.getByTestId('PinnedList').locator('.pin-note')
    ).toHaveCount(3);
  }
});

test('старый сервер сохраняет список без выдуманных заметок', async ({
  page
}) => {
  const errors = await openPinnedFixture(page, { old: true });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    3
  );
  await expect(page.getByTestId('PinnedList').locator('.pin-note')).toHaveCount(
    0
  );
  expect(errors).toEqual([]);
});

test('редактирование и удаление своих заметок сохраняют pin, чужие недоступны', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await noteAction(page, 'Редактировать комментарий');
  await page
    .getByRole('textbox', { name: 'Комментарий к закреплению' })
    .fill('Отредактированная заметка');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByTestId('PinnedList')).toContainText(
    'Отредактированная заметка'
  );
  await expect
    .poll(
      () =>
        api.requests.filter(request => request.path.endsWith('/commands'))
          .length
    )
    .toBe(1);
  await expect
    .poll(() => api.comments[0].text)
    .toBe('Отредактированная заметка');
  await expect(
    page.getByTestId('PinnedList').locator('.pin-note--pending')
  ).toHaveCount(0);
  await noteAction(page, 'Удалить комментарий');
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await expect(page.getByTestId('PinnedList').locator('.pin-note')).toHaveCount(
    2
  );
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    3
  );
  await expect.poll(() => api.comments.length).toBe(2);
  expect(api.rows[0].isPin).toBe(true);
  expect(errors).toEqual([]);
});

test('создание заметки через подтверждение — одна атомарная команда', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  const message = page
    .locator(`[data-message-id="${api.rows[24].id}"]`)
    .first();
  await message.click({ button: 'right' });
  await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Комментарий к закреплению' })
    .fill('Новая заметка');
  await page.getByRole('button', { name: 'Да', exact: true }).click();
  await expect
    .poll(
      () =>
        api.requests.filter(request => request.path.endsWith('/commands'))
          .length
    )
    .toBe(1);
  const command = api.requests.find(request =>
    request.path.endsWith('/commands')
  )?.body as any;
  expect(command).toMatchObject({
    action: 'PIN',
    scope: 'ALL',
    expectedPinned: false,
    text: 'Новая заметка'
  });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    4
  );
  await expect(page.getByTestId('PinnedList')).toContainText('Новая заметка');
  expect(errors).toEqual([]);
});

test('конфликт версии возвращает подтверждённое состояние и текст для восстановления', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await noteAction(page, 'Редактировать комментарий');
  await page
    .getByRole('textbox', { name: 'Комментарий к закреплению' })
    .fill('Восстановить этот текст');
  api.comments[0].revision = '9007199254740994';
  api.comments[0].text = 'Подтверждено другим сеансом';
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByTestId('PinnedList')).toContainText(
    'Подтверждено другим сеансом'
  );
  await expect(page.getByTestId('PinnedList')).toContainText(
    'Восстановить этот текст'
  );
  expect(errors).toEqual([]);
});

test('переход к оригиналу закрывает список', async ({ page }) => {
  const errors = await openPinnedFixture(page);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await page
    .getByTestId('PinnedList')
    .getByText('По заказу № 2847:', { exact: false })
    .click();
  await expect(page.getByTestId('PinnedList')).toHaveCount(0);
  await expect(
    page
      .locator(
        '[data-testid$="-MessageList-UserMessagesWrapper"] [data-message-id]'
      )
      .filter({ hasText: 'По заказу № 2847' })
      .first()
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test('изменение и удаление оригинала сразу обновляет список и скрывает заметки', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  api.rows[0].text = 'Оригинал исправлен';
  await page.evaluate(
    message => (window as any).pins.edit(message),
    api.rows[0]
  );
  await expect(page.getByTestId('PinnedList')).toContainText(
    'Оригинал исправлен'
  );
  await page.evaluate(id => (window as any).pins.remove(id), api.rows[0].id);
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    2
  );
  await expect(page.getByTestId('PinnedList')).not.toContainText(
    'Взять этот заказ'
  );
  // Запоздалый ответ pinned не должен воскресить удалённый оригинал.
  await page.getByRole('button', { name: 'Меню закреплений' }).click();
  await page.getByRole('menuitem', { name: 'Обновить закрепления' }).click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    2
  );
  expect(errors).toEqual([]);
});

test('смена аккаунта закрывает список, личная заметка прежнего владельца не появляется', async ({
  page
}) => {
  const api = createPinFixtureApi();
  api.comments[0].scope = 'SELF';
  const errors = await openPinnedFixture(page, { api });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList')).toContainText(
    'Взять этот заказ'
  );
  await page.evaluate(() => {
    const fixture = (window as any).pins;
    fixture.setUser({ id: fixture.peerId, initials: 'Петров П.П.' });
  });
  await expect(page.getByTestId('PinnedList')).toHaveCount(0);
  await page.evaluate(
    async rows => {
      const fixture = (window as any).pins;
      fixture.seed(rows);
      await fixture.refresh();
      fixture.open();
    },
    api.rows.filter(row => row.isPin)
  );
  await expect(page.getByTestId('PinnedList')).toBeVisible();
  await expect(page.getByTestId('PinnedList')).not.toContainText(
    'Взять этот заказ'
  );
  expect(errors).toEqual([]);
});

test('старый сервер отключает поле заметки в обычном подтверждении pin', async ({
  page
}) => {
  const api = createPinFixtureApi();
  await openPinnedFixture(page, { api, old: true });
  await page
    .locator(`[data-message-id="${api.rows[24].id}"]`)
    .first()
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Да', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Комментарий к закреплению' })
  ).toBeDisabled();
});

test('переход с базы v6 сохраняет закрепления и метаданные незавершённой загрузки', async ({
  page
}) => {
  await page.route('**/migration-shell', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Миграция</title>'
    })
  );
  await page.goto('/migration-shell');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('chat-topic-messages-db', 6);
        request.onupgradeneeded = () => {
          for (const name of [
            'topicMessages',
            'pinnedMessages',
            'pendingUploads',
            'pendingUploadMeta'
          ])
            request.result.createObjectStore(name, { keyPath: 'cacheKey' });
          request.result
            .createObjectStore('pendingUploadChunks', {
              keyPath: ['cacheKey', 'chunkIndex']
            })
            .createIndex('cacheKey', 'cacheKey');
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction(
            ['pinnedMessages', 'pendingUploadMeta'],
            'readwrite'
          );
          transaction
            .objectStore('pinnedMessages')
            .put({ cacheKey: 'migration-pin', messages: ['сохранено'] });
          transaction
            .objectStore('pendingUploadMeta')
            .put({ cacheKey: 'migration-upload', clientId: 'не потерять' });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      })
  );
  await openPinnedFixture(page);
  const result = await page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('chat-topic-messages-db');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([
            'pinnedMessages',
            'pendingUploadMeta'
          ]);
          const pins = transaction
            .objectStore('pinnedMessages')
            .get('migration-pin');
          const upload = transaction
            .objectStore('pendingUploadMeta')
            .get('migration-upload');
          transaction.oncomplete = () => {
            resolve({
              version: db.version,
              store: db.objectStoreNames.contains('pinCommentTopics'),
              pins: pins.result,
              upload: upload.result
            });
            db.close();
          };
        };
      })
  );
  expect(result).toMatchObject({
    version: 7,
    store: true,
    pins: { messages: ['сохранено'] },
    upload: { clientId: 'не потерять' }
  });
});

test('фотография, видео, файл и стикер используют прежние компоненты и действия', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  const base = 'http://localhost:5173/e2e/fixtures';
  const messages = api.rows.slice(0, 4).map(row => ({
    ...row,
    text: '',
    isPin: true,
    isPinnedForAll: true,
    isPinnedForMe: true
  }));
  messages[0].media = [
    {
      id: 'photo',
      type: 'IMAGE',
      path: `${base}/sticker-assets/preview.png`,
      ex: { width: 220, height: 220 }
    }
  ] as any;
  messages[1].media = [
    {
      id: 'video',
      type: 'VIDEO',
      path: `${base}/video-cover.mp4`,
      thumbnailPath: `${base}/sticker-assets/preview.png`,
      ex: { width: 220, height: 220 }
    }
  ] as any;
  messages[2].media = [
    { ...api.rows[2].media[0], path: `${base}/pinned-report.txt` }
  ];
  messages[3].media = [];
  messages[3].ex = JSON.stringify({
    kind: 'sticker',
    sticker: { id: 'sep-robot-heart', pack: 'sep-robots', version: 1 }
  });
  api.rows.splice(0, api.rows.length, ...messages);
  await page.route('**/stickers/assets/**', route =>
    route.fulfill({
      path: 'e2e/fixtures/sticker-assets/animation.webp',
      contentType: 'image/webp'
    })
  );
  await page.evaluate(rows => (window as any).pins.seed(rows), messages);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  const panel = page.getByTestId('PinnedList');
  await expect(panel.locator('.message-content__media')).toHaveCount(2);
  await expect(panel.locator('.message-media__pin')).toHaveCount(2);
  await expect(panel.locator('.message-sticker__image')).toHaveCount(1);
  for (const index of [0, 1, 2]) {
    const item = page.getByTestId(`PinnedList-Item-${messages[index].id}`);
    if (index === 2) await item.locator('.message-content__file').click();
    else await item.locator('.message-content__media').click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  await expect(
    panel.locator('.message-sticker__animation--loaded')
  ).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('перезагрузка страницы восстанавливает потерянный ACK с тем же сохранённым UUID', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  let first = true;
  await page.route('**/pin-comments/commands', async route => {
    const result = api.execute(
      'POST',
      new URL(route.request().url()).pathname,
      route.request().postDataJSON()
    );
    if (first) {
      first = false;
      await route.abort();
    } else await route.fulfill(result);
  });
  await page.evaluate(async () => {
    const fixture = (window as any).pins;
    await fixture.refresh();
    fixture.store.pin(
      fixture.topicId,
      fixture.rows[24].id,
      'SELF',
      'Сохранено через перезапуск'
    );
  });
  await expect
    .poll(
      () =>
        api.requests.filter(request => request.path.endsWith('/commands'))
          .length
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).pins.store.state((window as any).pins.topicId).value
            .operations[0]?.status
      )
    )
    .toBe('retryable');
  await page.goto(fixture, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('Pinned-Messages-ListButton')).toBeVisible();
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect
    .poll(
      () =>
        api.requests.filter(request => request.path.endsWith('/commands'))
          .length
    )
    .toBe(2);
  await expect(
    page
      .getByTestId('PinnedList')
      .locator('.pin-note')
      .filter({ hasText: 'Сохранено через перезапуск' })
  ).toHaveCount(1);
  const commands = api.requests
    .filter(request => request.path.endsWith('/commands'))
    .map(request => request.body as any);
  expect(commands[0]).toEqual(commands[1]);
  expect(errors).toEqual([]);
});

test('большая коллекция не монтирует все тяжёлые вложения сразу', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  const collection = Array.from({ length: 1000 }, (_, index) => ({
    ...api.rows[0],
    id: `01f0a010-7ff7-4e7b-b97b-${String(index + 10000).padStart(12, '0')}`,
    text: `Закрепление ${index}`,
    createdAt: new Date(2020, 0, 1, 0, index)
  }));
  api.rows.splice(0, api.rows.length, ...collection);
  await page.evaluate(rows => (window as any).pins.seed(rows), collection);
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    80
  );
  await page.getByRole('button', { name: 'Показать ещё закрепления' }).click();
  await expect(page.getByTestId('PinnedList').locator('.message')).toHaveCount(
    160
  );
  expect(errors).toEqual([]);
});

test('скрытая переписка не читает сообщения, не принимает клики и не прокручивается', async ({
  page
}) => {
  const errors = await openPinnedFixture(page);
  await page.evaluate(() => {
    const win = window as any;
    win.readCalls = [];
    win.pins.sdk.markMessagesAsRead = async (...args: unknown[]) => {
      win.readCalls.push(args);
    };
    win.pins.sdk.emitConnectionState(true);
  });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  const viewport = page.locator(
    '[data-testid$="-MessageList-UserMessagesWrapper"]'
  );
  const top = await viewport.evaluate(element => element.scrollTop);
  const anchor = await viewport.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const row = [
      ...element.querySelectorAll<HTMLElement>('[data-message-id]')
    ].find(
      row =>
        row.getBoundingClientRect().bottom > bounds.top &&
        row.getBoundingClientRect().top < bounds.bottom
    )!;
    return {
      id: row.dataset.messageId!,
      offset: row.getBoundingClientRect().top - bounds.top
    };
  });
  await page.evaluate(() => {
    const win = window as any;
    win.readCalls.length = 0;
    win.pins.append({
      ...win.pins.rows[24],
      id: '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0999',
      text: 'Скрытое непрочитанное сообщение',
      isReadByMe: false,
      isRead: false,
      senderUserId: win.pins.peerId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  });
  const bounds = await page.getByTestId('PinnedList').boundingBox();
  await page
    .getByTestId('PinnedList')
    .click({ position: { x: bounds!.width - 15, y: bounds!.height - 15 } });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).readCalls)).toEqual([]);
  expect(await viewport.evaluate(element => element.scrollTop)).toBeCloseTo(
    top,
    0
  );
  await expect(page.getByTestId('PinnedList')).toBeVisible();
  const overlayCount = await page
    .locator('.message-context-menu:visible')
    .count();
  expect(overlayCount).toBe(0);
  await page.getByRole('button', { name: 'Назад в переписку' }).click();
  const returnedOffset = await viewport.evaluate((element, id) => {
    const row = element.querySelector<HTMLElement>(
      `[data-message-id="${id}"]`
    )!;
    return (
      row.getBoundingClientRect().top - element.getBoundingClientRect().top
    );
  }, anchor.id);
  // Вставка выше viewport меняет scrollTop; видимый оригинал остаётся на месте.
  expect(returnedOffset).toBeCloseTo(anchor.offset, 0);
  expect(errors).toEqual([]);
});

test('потерянный ответ POST повторяется с тем же UUID без дублирования заметки', async ({
  page
}) => {
  const api = createPinFixtureApi();
  const errors = await openPinnedFixture(page, { api });
  let first = true;
  await page.route('**/pin-comments/commands', async route => {
    const result = api.execute(
      'POST',
      new URL(route.request().url()).pathname,
      route.request().postDataJSON()
    );
    if (first) {
      first = false;
      await route.abort();
    } else await route.fulfill(result);
  });
  await page.evaluate(async () => {
    const fixture = (window as any).pins;
    await fixture.store.refresh(fixture.topicId);
  });
  await page.evaluate(() => {
    const fixture = (window as any).pins;
    fixture.store.pin(
      fixture.topicId,
      fixture.rows[24].id,
      'SELF',
      'Личная заметка без дублей'
    );
  });
  await page.getByTestId('Pinned-Messages-ListButton').click();
  await expect
    .poll(
      () =>
        api.requests.filter(request => request.path.endsWith('/commands'))
          .length
    )
    .toBe(2);
  await expect(
    page
      .getByTestId('PinnedList')
      .locator('.pin-note')
      .filter({ hasText: 'Личная заметка без дублей' })
  ).toHaveCount(1);
  await expect(
    page.getByTestId('PinnedList').locator('.pin-note--pending')
  ).toHaveCount(0);
  const commands = api.requests
    .filter(request => request.path.endsWith('/commands'))
    .map(request => request.body as any);
  expect(commands).toHaveLength(2);
  expect(commands[0].commandId).toBe(commands[1].commandId);
  expect(
    api.comments.filter(comment => comment.text === 'Личная заметка без дублей')
  ).toHaveLength(1);
  expect(errors).toEqual([]);
});
