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
    test(`Папки сверху в одну строку, поиск и фильтры ниже: ${clients ? 'клиенты' : 'чаты'}, ${dark ? 'тёмная' : 'светлая'}`, async ({
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
        return;
      }
      const buttons = page.locator('.chat-folder-rail__items > button');
      await expect(buttons.first()).toHaveAttribute(
        'data-testid',
        'ChatFolders-Rail-All'
      );
      await expect(buttons.last()).toHaveAttribute(
        'data-testid',
        'ChatFolders-Rail-Manage'
      );
      expect(
        (await buttons.allTextContents())
          .map(text => text.trim())
          .slice(1, 1 + names.length)
      ).toEqual(names);
      const filters = page.locator('.chats-toolbar__filters');
      if (clients) await expect(filters).toHaveCount(0);
      else {
        await expect(filters).toBeVisible();
        await expect(filters.locator('button > span:first-child')).toHaveText([
          'Все',
          'Чаты',
          'Группы',
          'Боты'
        ]);
      }
      const icons = page.locator(
        '.chat-folder-rail--mobile .chat-folder-rail__avatar > svg, .chat-folder-rail--mobile .chat-folder-rail__avatar > img, .chat-folder-rail--mobile .chat-folder-rail__manage-icon'
      );
      for (const icon of await icons.all())
        expect(await icon.boundingBox()).toMatchObject({
          width: 24,
          height: 24
        });
      for (const width of [320, 360, 393, 412, 768]) {
        await page.setViewportSize({ width, height: 851 });
        await page
          .locator('.chat-folder-rail__items')
          .evaluate(el => (el.scrollLeft = 0));
        const search = (await page.locator('.search-yui-kit').boundingBox())!;
        const rail = (await page.locator('.chat-folder-rail').boundingBox())!;
        expect(search.x).toBe(16);
        expect(search.width).toBe(width - 32);
        expect(rail.x).toBe(0);
        expect(rail.width).toBe(width);
        expect(rail.height).toBe(72);
        expect(search.y - rail.y - rail.height).toBe(10);
        if (!clients)
          expect(
            (await filters.boundingBox())!.y - search.y - search.height
          ).toBe(10);
        const boxes = await buttons.evaluateAll(elements =>
          elements.map(el => {
            const box = el.getBoundingClientRect();
            return { y: box.y, width: box.width, height: box.height };
          })
        );
        expect(new Set(boxes.map(box => box.y)).size).toBe(1);
        for (const box of boxes)
          expect(box).toMatchObject({ width: 70, height: 72 });
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

test('Фильтр типов работает внутри папки и вместе с поиском', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await openFixture(page);
  const topics = page.locator('.contact-list__li');
  await expect(topics).toHaveCount(4);
  await page.getByTestId('ChatFolders-Rail-Folder-folder-0').tap();
  await expect(topics).toHaveCount(2);
  await page.getByTestId('MobileFolders-ChatsToolbar-Filter-chats').tap();
  await expect(topics).toHaveCount(0);
  await page.getByTestId('MobileFolders-ChatsToolbar-Filter-groups').tap();
  await expect(topics).toHaveCount(2);
  await page.locator('.chats-toolbar__search input').fill('Авито');
  await expect(topics).toHaveCount(1);
  await expect(topics).toContainText('Клиент Авито');
  await page.getByTestId('ChatFolders-Rail-All').tap();
  await expect(
    page.getByTestId('MobileFolders-ChatsToolbar-Filter-groups')
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(topics).toHaveCount(1);
});

test('Системные папки клиентов и настройки доступны в горизонтальной полосе', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
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

test('Перетаскивание по горизонтали сохраняет порядок папок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  const saves = await openFixture(page);
  const initial = await order(page);
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const target = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-2')
    .boundingBox())!;
  const expected = [initial[1], initial[2], initial[0], ...initial.slice(3)];
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2 + 8,
    target.y + target.height / 2,
    { steps: 8 }
  );
  await expect(page.locator('.chat-folder-drag-preview')).toBeVisible();
  await expect.poll(() => order(page)).toEqual(expected);
  await page.mouse.up();
  await expect.poll(() => saves.length).toBe(1);
  expect(saves[0]).toEqual(expected);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(expected);
});

test('Свайп прокручивает папки, удержание позволяет перетащить и отменить', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  const saves = await openFixture(page);
  const initial = await order(page);
  const folderList = page.locator('.chat-folder-rail__items');
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }]
    });
  const rail = (await folderList.boundingBox())!;
  const y = rail.y + rail.height / 2;
  await touch('touchStart', 280, y);
  for (const x of [260, 220, 180, 140]) await touch('touchMove', x, y);
  await touch('touchEnd', 140, y);
  await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
  await expect
    .poll(() => folderList.evaluate(el => el.scrollLeft))
    .toBeGreaterThan(0);
  expect(saves).toEqual([]);
  await folderList.evaluate(el => (el.scrollLeft = 0));
  await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .scrollIntoViewIfNeeded();
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  const target = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-2')
    .boundingBox())!;
  await touch(
    'touchStart',
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await expect(page.locator('.chat-folder-drag-preview')).toBeVisible();
  await touch(
    'touchMove',
    target.x + target.width / 2 + 8,
    target.y + target.height / 2
  );
  await expect
    .poll(() => order(page))
    .toEqual([initial[1], initial[2], initial[0], ...initial.slice(3)]);
  await touch('touchCancel', 0, 0);
  await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(initial);
  expect(saves).toEqual([]);
  await cdp.detach();
});

test('Настройки и системные папки доступны без созданных папок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await openFixture(page, { clients: true, empty: true });
  await expect(
    page.locator('.chat-folder-rail__items [data-folder-id]')
  ).toHaveCount(0);
  await expect(page.locator('.chat-folder-rail__items > button')).toHaveCount(
    9
  );
  await page.getByTestId('Clients-SystemFolder-site').tap();
  await expect(page.locator('.contact-list__li')).toHaveCount(1);
  await page.getByTestId('ChatFolders-Rail-Manage').tap();
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
});

for (const clients of [false, true]) {
  for (const dark of [false, true]) {
    test(`Папки и поиск закреплены при прокрутке списка: ${clients ? 'клиенты' : 'чаты'}, ${dark ? 'тёмная' : 'светлая'}`, async ({
      page,
      isMobile
    }) => {
      test.skip(!isMobile);
      await page.setViewportSize({ width: 393, height: 480 });
      await openFixture(page, { clients, dark });
      const section = page.locator('.mobile-list-container__section');
      const toolbar = page.locator('.mobile-list-container__toolbar');
      const initial = (await toolbar.boundingBox())!;
      await section.evaluate(el => (el.scrollTop = 160));
      await expect
        .poll(() => section.evaluate(el => el.scrollTop))
        .toBeGreaterThan(0);
      expect((await toolbar.boundingBox())!.y).toBe(initial.y);
      await expect(page.locator('.chats-toolbar__search')).toBeInViewport();
      await expect(page.locator('.chat-folder-rail')).toBeInViewport();
      if (!clients)
        await expect(page.locator('.chats-toolbar__filters')).toBeInViewport();
      await page.getByTestId('ChatFolders-Rail-Manage').tap();
      await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
    });
  }
}

test('Большое число папок не увеличивает высоту панели', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 320, height: 640 });
  const saves = await openFixture(page, { many: true });
  const folderList = page.locator('.chat-folder-rail__items');
  const toolbar = page.locator('.mobile-list-container__toolbar');
  const height = (await toolbar.boundingBox())!.height;
  expect((await folderList.boundingBox())!.height).toBe(72);
  const last = page.getByTestId('ChatFolders-Rail-Folder-folder-29');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect((await toolbar.boundingBox())!.height).toBe(height);
  await expect(page.locator('.chats-toolbar__filters')).toBeInViewport();
  await folderList.evaluate(el => (el.scrollLeft = 0));
  const source = (await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .boundingBox())!;
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2
  );
  await page.mouse.down();
  const box = (await folderList.boundingBox())!;
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, {
    steps: 6
  });
  await expect
    .poll(() => folderList.evaluate(el => el.scrollLeft))
    .toBeGreaterThan(100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(saves).toEqual([]);
  await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
});
