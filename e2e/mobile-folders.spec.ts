import { expect, test, type Page } from '@playwright/test';

const names = [
  'Важное',
  'Работа',
  'Закупки',
  'Бухгалтерия',
  'Очень длинное название папки для проверки переноса'
];

async function openFixture(
  page: Page,
  options: {
    clients?: boolean;
    dark?: boolean;
    empty?: boolean;
    many?: boolean;
  } = {}
) {
  const scope = options.clients ? 'clients' : 'chats';
  let folders = (
    options.empty
      ? []
      : options.many
        ? Array.from(
            { length: 30 },
            (_, index) => `Папка для отдельного проекта № ${index + 1}`
          )
        : names
  ).map((name, index) => ({
    id: `folder-${index}`,
    name,
    icon: index === 0 ? 'star' : 'folder',
    scope,
    topicIds: index === 0 ? ['topic-0', 'topic-1'] : ['topic-2'],
    position: index,
    createdAt: '2026-10-07T00:00:00.000Z',
    updatedAt: '2026-10-07T00:00:00.000Z'
  }));
  const saves: string[][] = [];
  await page.route('**/folder-menu-api/chat-folders**', async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      expect(body.scope).toBe(scope);
      saves.push(body.folderIds);
      folders = body.folderIds.map((id: string, position: number) => ({
        ...folders.find(folder => folder.id === id)!,
        position,
        updatedAt: '2026-10-07T01:00:00.000Z'
      }));
    }
    await route.fulfill({ json: folders });
  });
  await page.route('**/folder-menu-api/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'folder-menu-user',
        effective: { client: true, ai: false }
      }
    })
  );
  await page.route('**/folder-menu-api/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/folder-menu-api/manager/managers', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/folder-menu-api/manager/inquiries?*', route =>
    route.fulfill({
      json: ['widget', 'avito', 'vk', 'support'].map((channel, index) => ({
        id: `inquiry-${index}`,
        topic_id: `topic-${index}`,
        name: `Клиент ${['Сайт', 'Авито', 'ВК', 'Поддержка'][index]}`,
        contacts: {},
        source: { channel },
        channels: [channel],
        manager_ids: index === 0 ? [] : ['folder-menu-user'],
        metadata_version: 1
      }))
    })
  );
  await page.goto(
    `/e2e/fixtures/mobile-folders.html?${options.clients ? 'clients&' : ''}${options.dark ? 'dark' : ''}`
  );
  await expect(page.locator('.chats-toolbar__search')).toBeVisible({
    timeout: 30000
  });
  return saves;
}

const order = (page: Page) =>
  page
    .locator('.chat-folder-rail__items [data-folder-id]')
    .evaluateAll(elements =>
      elements.map(e => e.getAttribute('data-folder-id'))
    );

for (const clients of [false, true]) {
  for (const dark of [false, true]) {
    test(`Папки под поиском, несколько строк, длинные названия: ${clients ? 'клиенты' : 'чаты'}, ${dark ? 'тёмная' : 'светлая'}`, async ({
      page,
      isMobile
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await openFixture(page, { clients, dark });
      if (!isMobile) {
        await expect(page.locator('.chat-folder-rail--mobile')).toHaveCount(0);
        await expect(
          page.locator('.chats-toolbar__filters').first()
        ).toBeVisible();
        await expect(
          page.locator('[data-testid^="Clients-SystemFolder-"]')
        ).toHaveCount(0);
        if (clients) {
          const icons = page.locator(
            '.clients-panel__filter-rows svg, .clients-panel__filter-rows img'
          );
          for (const icon of await icons.all())
            expect(await icon.boundingBox()).toMatchObject({
              width: 16,
              height: 16
            });
        }
        return;
      }
      await expect(page.locator('.chats-toolbar__filters')).toHaveCount(0);
      const buttons = page.locator('.chat-folder-rail__items > button');
      await expect(buttons.first()).toHaveAttribute(
        'data-testid',
        'ChatFolders-Rail-Manage'
      );
      await expect(buttons.nth(1)).toHaveText('Все чаты');
      expect(
        (await buttons.allTextContents())
          .map(text => text.trim())
          .slice(2, 2 + names.length)
      ).toEqual(names);
      if (clients)
        expect(
          (await buttons.allTextContents())
            .map(text => text.trim())
            .slice(2 + names.length)
        ).toEqual([
          'Сайт',
          'Авито',
          'ВК',
          'Telegram',
          'MAX',
          'Новые заявки',
          'Поддержка'
        ]);
      const icons = page.locator(
        '.chat-folder-rail--mobile .chat-folder-rail__avatar > svg, .chat-folder-rail--mobile .chat-folder-rail__avatar > img, .chat-folder-rail--mobile .chat-folder-rail__manage-icon'
      );
      for (const icon of await icons.all())
        expect(await icon.boundingBox()).toMatchObject({
          width: 16,
          height: 16
        });
      for (const width of [320, 360, 393, 412, 768]) {
        await page.setViewportSize({ width, height: 851 });
        const search = (await page.locator('.search-yui-kit').boundingBox())!;
        const rail = (await page.locator('.chat-folder-rail').boundingBox())!;
        expect(search.x).toBe(16);
        expect(search.width).toBe(width - 32);
        expect(rail.x).toBe(16);
        expect(rail.width).toBe(width - 32);
        expect(rail.y - search.y - search.height).toBe(10);
        const boxes = await buttons.evaluateAll(elements =>
          elements.map(e => {
            const r = e.getBoundingClientRect();
            return { x: r.x, right: r.right, y: r.y, height: r.height };
          })
        );
        for (const box of boxes) {
          expect(box.height).toBe(33);
          expect(box.x).toBeGreaterThanOrEqual(16);
          expect(box.right).toBeLessThanOrEqual(width - 16);
        }
        const rows = [...new Set(boxes.map(box => box.y))];
        expect(rows.length).toBeGreaterThan(1);
        for (let index = 1; index < rows.length; index++)
          expect(rows[index] - rows[index - 1]).toBe(38);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`folders-${width}.png`),
          animations: 'disabled'
        });
      }
      expect(errors).toEqual([]);
    });
  }
}

test('Системные папки клиентов фильтруют чаты и сбрасываются при выборе своей папки', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Изменения только для мобильного интерфейса');
  await openFixture(page, { clients: true });
  const topics = page.locator('.contact-list__li');
  await expect(topics).toHaveCount(4);
  for (const [id, label] of [
    ['site', 'Сайт'],
    ['avito', 'Авито'],
    ['vk', 'ВК'],
    ['new', 'Сайт'],
    ['support', 'Поддержка']
  ]) {
    const button = page.getByTestId(`Clients-SystemFolder-${id}`);
    await button.tap();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(topics).toHaveCount(1);
    await expect(topics).toContainText(`Клиент ${label}`);
    await page.getByTestId('ChatFolders-Rail-Folder-folder-0').tap();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(topics).toHaveCount(2);
    await page.getByTestId('ChatFolders-Rail-All').tap();
    await expect(topics).toHaveCount(4);
  }
  await page.getByTestId('ChatFolders-Rail-Manage').tap();
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
});

test('Перетаскивание между строками сохраняет только порядок созданных папок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка новой мобильной раскладки');
  const saves = await openFixture(page, { clients: true });
  const initial = await order(page);
  const manage = (await page
    .getByTestId('ChatFolders-Rail-Manage')
    .boundingBox())!;
  const fixed = page.locator('[data-testid^="Clients-SystemFolder-"]');
  const fixedIds = await fixed.evaluateAll(elements =>
    elements.map(e => e.getAttribute('data-testid'))
  );
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const target = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-4')
    .boundingBox())!;
  expect(target.y).toBeGreaterThan(source.y);
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 8 }
  );
  const preview = page.locator('.chat-folder-drag-preview');
  await expect(preview).toBeVisible();
  await expect
    .poll(() => order(page))
    .toEqual([...initial.slice(1), initial[0]]);
  expect((await preview.boundingBox())!.y).toBeCloseTo(target.y, 1);
  // Движение на 1 px после переноса не должно перебрасывать папку обратно.
  await page.mouse.move(
    target.x + target.width / 2 + 1,
    target.y + target.height / 2 + 1
  );
  await expect
    .poll(() => order(page))
    .toEqual([...initial.slice(1), initial[0]]);
  await page.mouse.move(
    target.x + target.width / 2 - 1,
    target.y + target.height / 2 - 1
  );
  await expect
    .poll(() => order(page))
    .toEqual([...initial.slice(1), initial[0]]);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toEqual([...initial.slice(1), initial[0]]);
  expect(
    await page.getByTestId('ChatFolders-Rail-Manage').boundingBox()
  ).toEqual(manage);
  expect(
    await page
      .locator('.chat-folder-rail__items > button')
      .evaluateAll(
        (elements, createdCount) =>
          elements
            .slice(2 + createdCount)
            .map(e => e.getAttribute('data-testid')),
        initial.length
      )
  ).toEqual(fixedIds);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(saves[0]);
  const last = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const first = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-1')
    .boundingBox())!;
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 1, first.y + first.height / 2, { steps: 8 });
  await expect.poll(() => order(page)).toEqual(initial);
  await page.mouse.up();
  await expect.poll(() => saves.length).toBe(2);
  for (const id of [
    'ChatFolders-Rail-Manage',
    'ChatFolders-Rail-All',
    'Clients-SystemFolder-site'
  ]) {
    const box = (await page.getByTestId(id).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x, last.y, { steps: 5 });
    await expect(preview).toHaveCount(0);
    await page.mouse.up();
    expect(saves.length).toBe(2);
  }
});

test('Удержание пальцем переносит папку; прокрутка и отмена не сохраняют порядок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка touch');
  const saves = await openFixture(page);
  const initial = await order(page);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }]
    });
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const target = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-4')
    .boundingBox())!;
  const x = source.x + source.width / 2,
    y = source.y + source.height / 2;
  await touch('touchStart', x, y);
  await touch('touchMove', x, y - 12);
  await touch('touchMove', x, y - 40);
  await touch('touchMove', x, y - 75);
  await touch('touchEnd', x, y - 75);
  await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
  expect(saves).toEqual([]);
  await expect
    .poll(() =>
      page
        .locator('.mobile-list-container__section')
        .evaluate(el => el.scrollTop)
    )
    .toBeGreaterThan(0);
  await page
    .locator('.mobile-list-container__section')
    .evaluate(el => (el.scrollTop = 0));
  await touch('touchStart', x, y);
  await expect(page.locator('.chat-folder-drag-preview')).toBeVisible();
  await touch(
    'touchMove',
    target.x + target.width / 2,
    target.y + target.height / 2
  );
  await expect
    .poll(() => order(page))
    .toEqual([...initial.slice(1), initial[0]]);
  await touch('touchCancel', 0, 0);
  await expect.poll(() => order(page)).toEqual(initial);
  expect(saves).toEqual([]);
  await page
    .locator('.chat-folder-rail__items')
    .evaluate(element =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map(animation => animation.finished)
      )
    );
  await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .scrollIntoViewIfNeeded();
  const restartedSource = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const restartedTarget = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-4')
    .boundingBox())!;
  await touch(
    'touchStart',
    restartedSource.x + restartedSource.width / 2,
    restartedSource.y + restartedSource.height / 2
  );
  await expect(page.locator('.chat-folder-drag-preview')).toBeVisible();
  await touch(
    'touchMove',
    restartedTarget.x + restartedTarget.width / 2,
    restartedTarget.y + restartedTarget.height / 2
  );
  await expect
    .poll(() => order(page))
    .toEqual([...initial.slice(1), initial[0]]);
  await touch('touchEnd', 0, 0);
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toEqual([...initial.slice(1), initial[0]]);
  await cdp.detach();
});

test('Настройки и системные папки доступны без созданных папок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Изменения только для мобильного интерфейса');
  await openFixture(page, { clients: true, empty: true });
  await expect(
    page.locator('.chat-folder-rail__items [data-folder-id]')
  ).toHaveCount(0);
  await expect(page.locator('.chat-folder-rail__items > button')).toHaveCount(
    9
  );
  await page.getByTestId('Clients-SystemFolder-site').tap();
  await expect(page.locator('.contact-list__li')).toHaveCount(1);
});

for (const clients of [false, true]) {
  for (const dark of [false, true]) {
    test(`Поиск и папки закреплены при прокрутке: ${clients ? 'клиенты' : 'чаты'}, ${dark ? 'тёмная' : 'светлая'}`, async ({
      page,
      isMobile
    }) => {
      test.skip(!isMobile, 'Закрепление мобильной панели');
      await page.setViewportSize({ width: 393, height: 480 });
      await openFixture(page, { clients, dark });
      const section = page.locator('.mobile-list-container__section');
      const toolbar = page.locator('.mobile-list-container__toolbar');
      const search = page.locator('.chats-toolbar__search');
      const folders = page.locator('.chat-folder-rail');
      const start = {
        toolbar: (await toolbar.boundingBox())!,
        search: (await search.boundingBox())!,
        folders: (await folders.boundingBox())!
      };
      await section.evaluate(el => (el.scrollTop = 160));
      await expect
        .poll(() => section.evaluate(el => el.scrollTop))
        .toBeGreaterThan(0);
      for (const [name, locator] of [
        ['toolbar', toolbar],
        ['search', search],
        ['folders', folders]
      ] as const) {
        expect((await locator.boundingBox())!.y).toBe(start[name].y);
        await expect(locator).toBeInViewport();
      }
      await page.getByTestId('ChatFolders-Rail-Manage').tap();
      await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
    });
  }
}

test('Большое число строк не закрывает список, перетаскивание прокручивает папки', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильная прокрутка');
  await page.setViewportSize({ width: 320, height: 640 });
  const saves = await openFixture(page, { many: true });
  const section = page.locator('.mobile-list-container__section');
  const folderList = page.locator('.chat-folder-rail__items');
  const toolbar = page.locator('.mobile-list-container__toolbar');
  const toolbarY = (await toolbar.boundingBox())!.y;
  const last = page.getByTestId('ChatFolders-Rail-Folder-folder-29');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await page
    .getByRole('heading', { name: 'Клиент Сайт', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole('heading', { name: 'Клиент Сайт', exact: true })
  ).toBeInViewport();
  expect((await toolbar.boundingBox())!.y).toBe(toolbarY);
  expect((await toolbar.boundingBox())!.height).toBeLessThan(640 / 2 + 100);
  await expect(page.locator('.chats-toolbar__search')).toBeInViewport();
  await section.evaluate(el => (el.scrollTop = 0));
  await folderList.evaluate(el => (el.scrollTop = 0));
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await page.mouse.down();
  const folderBox = (await folderList.boundingBox())!;
  await page.mouse.move(160, folderBox.y + folderBox.height - 2, { steps: 6 });
  await expect
    .poll(() => folderList.evaluate(el => el.scrollTop))
    .toBeGreaterThan(100);
  expect(await section.evaluate(el => el.scrollTop)).toBe(0);
  expect((await toolbar.boundingBox())!.y).toBe(toolbarY);
  await expect(page.locator('.chat-folder-drag-preview')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(saves).toEqual([]);
  await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
});
