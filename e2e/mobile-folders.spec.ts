import { expect, test, type Page } from '@playwright/test';

test('менеджер папок в desktop-оболочке убирает боковую полосу и возвращает её при выходе', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Desktop-оболочка');
  await page.addInitScript(() =>
    sessionStorage.setItem('menu-collapse', 'false')
  );
  await openFixture(page, { shell: true });
  const rail = page.locator('.menu > .chat-folder-rail');
  await expect(rail).toBeVisible();
  await rail.getByTestId('ChatFolders-Rail-Manage').click();
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
  await expect(rail).toHaveCount(0);
  await expect(page.locator('.menu')).not.toHaveClass(/menu--folders/);
  await page.locator('[data-testid$="MenuBottomNav-Chats"]:visible').click();
  await expect(page.getByTestId('ChatFolders-Panel')).toHaveCount(0);
  await expect(rail).toBeVisible();
  await expect(page.locator('.menu')).toHaveClass(/menu--folders/);
});

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
    shell?: boolean;
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
    `/e2e/fixtures/mobile-folders.html?${options.shell ? 'shell&' : ''}${options.clients ? 'clients&' : ''}${options.dark ? 'dark' : ''}`
  );
  await expect(page.locator('.chats-toolbar__search:visible')).toBeVisible({
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

const folderSettings = (page: Page) =>
  page.locator('.chats-toolbar__headline').getByRole('button', {
    name: 'Открыть папки',
    exact: true
  });

for (const clients of [false, true]) {
  for (const dark of [false, true]) {
    test(`Папки под поиском в одну строку, настройки в хедере: ${clients ? 'клиенты' : 'чаты'}, ${dark ? 'тёмная' : 'светлая'}`, async ({
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
      await expect(folderSettings(page)).toBeInViewport();
      await expect(page.getByTestId('ChatFolders-Rail-Manage')).toHaveCount(0);
      expect(
        (
          await page
            .locator('[data-folder-id] .chat-folder-rail__label')
            .allTextContents()
        ).map(text => text.trim())
      ).toEqual(names);
      const filters = page.locator('.chats-toolbar__filters');
      if (clients) {
        await expect(filters).toHaveCount(0);
        await expect(
          page
            .getByTestId('ChatFolders-Rail-All')
            .locator('.chat-folder-rail__avatar')
        ).toHaveCount(0);
      } else {
        await expect(filters).toBeVisible();
        await expect(
          page.locator('.chat-folder-rail__items .chats-toolbar__filters')
        ).toHaveCount(1);
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
          width: 16,
          height: 16
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
        expect(rail.height).toBe(43);
        expect(rail.y - search.y - search.height).toBe(10);
        expect(
          (await (clients ? buttons.first() : filters).boundingBox())!.x
        ).toBe(16);
        await expect(page.locator('.chat-folder-rail__items')).toHaveCSS(
          'column-gap',
          '5px'
        );
        const firstFolder = page.getByTestId(
          'ChatFolders-Rail-Folder-folder-0'
        );
        await expect(firstFolder).toHaveCSS('padding-left', '10px');
        await expect(firstFolder).toHaveCSS('padding-right', '10px');
        const iconBox = (await firstFolder
          .locator('.chat-folder-rail__avatar')
          .boundingBox())!;
        const labelBox = (await firstFolder
          .locator('.chat-folder-rail__label')
          .boundingBox())!;
        expect(labelBox.x - iconBox.x - iconBox.width).toBeCloseTo(5, 1);
        const firstBox = (await firstFolder.boundingBox())!;
        const secondBox = (await page
          .getByTestId('ChatFolders-Rail-Folder-folder-1')
          .boundingBox())!;
        expect(secondBox.x - firstBox.x - firstBox.width).toBeCloseTo(5, 1);
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
        for (const box of boxes) expect(box.height).toBe(33);
        expect(
          await page
            .locator('.chat-folder-rail__label')
            .evaluateAll(labels =>
              labels.every(label => label.scrollWidth <= label.clientWidth)
            )
        ).toBe(true);
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
      await folderSettings(page).tap();
      await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

test('Папки и фильтры имеют единый выбор, «Все» сбрасывает папку', async ({
  page
}) => {
  await openFixture(page);
  const topics = page.locator('.contact-list__li');
  const folder = page.getByTestId('ChatFolders-Rail-Folder-folder-0');
  const filter = (value: string) =>
    page.getByTestId(`MobileFolders-ChatsToolbar-Filter-${value}`);
  const selected = page.locator(
    '[data-folder-id][aria-pressed="true"], .chats-toolbar__filter-button[aria-pressed="true"]'
  );
  await expect(topics).toHaveCount(4);
  await folder.click();
  await expect(topics).toHaveCount(2);
  await expect(folder).toHaveAttribute('aria-pressed', 'true');
  await expect(filter('all')).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await filter('all').click();
  await expect(topics).toHaveCount(4);
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await expect(filter('all')).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toHaveCount(1);
  await filter('chats').click();
  await expect(topics).toHaveCount(0);
  await folder.click();
  await expect(topics).toHaveCount(2);
  await expect(filter('chats')).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await filter('groups').click();
  await expect(topics).toHaveCount(4);
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await folder.click();
  await expect(topics).toHaveCount(2);
  await expect(filter('groups')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.chats-toolbar__search input').fill('Авито');
  await expect(topics).toHaveCount(1);
  await expect(topics).toContainText('Клиент Авито');
  await filter('all').click();
  await expect(topics).toHaveCount(1);
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await page.locator('.chats-toolbar__search input').fill('');
  await expect(topics).toHaveCount(4);
});

test('Системные папки клиентов и настройки доступны в горизонтальной полосе', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await openFixture(page, { clients: true });
  const topics = page.locator('.contact-list__li');
  const selected = page.locator('.chat-folder-rail [aria-pressed="true"]');
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
    await expect(selected).toHaveCount(1);
    await expect(topics).toHaveCount(1);
    await expect(topics).toContainText(`Клиент ${label}`);
    await page.getByTestId('ChatFolders-Rail-Folder-folder-0').tap();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(topics).toHaveCount(2);
    await expect(selected).toHaveCount(1);
    await page.getByTestId('ChatFolders-Rail-All').tap();
    await expect(topics).toHaveCount(4);
    await expect(
      page.getByTestId('ChatFolders-Rail-Folder-folder-0')
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(selected).toHaveCount(1);
  }
  await folderSettings(page).tap();
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
});

test('В клиентах на компьютере папка, платформа и очередь выбираются по одной', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile);
  await openFixture(page, { clients: true });
  const topics = page.locator('.contact-list__li');
  const folder = page.getByTestId('ChatFolders-Rail-Folder-folder-0');
  const all = page.getByTestId('Clients-Filter-all');
  const site = page.getByTestId('Clients-Platforms-Filter-Сайт');
  const newInquiries = page.getByTestId('Clients-Filter-new');
  const selected = page.locator(
    '[data-folder-id][aria-pressed="true"], .chats-toolbar__filter-button[aria-pressed="true"]'
  );
  await folder.click();
  await expect(topics).toHaveCount(2);
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await all.click();
  await expect(topics).toHaveCount(4);
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await site.click();
  await expect(topics).toHaveCount(2);
  await expect(topics.first()).toContainText('Клиент Сайт');
  await folder.click();
  await expect(topics).toHaveCount(2);
  await expect(site).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await newInquiries.click();
  await expect(topics).toHaveCount(1);
  await expect(folder).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
  await page.getByTestId('ChatFolders-Rail-All').click();
  await expect(topics).toHaveCount(4);
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(newInquiries).toHaveAttribute('aria-pressed', 'false');
  await expect(selected).toHaveCount(1);
});

test('Перетаскивание по горизонтали сохраняет порядок папок', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await page.setViewportSize({ width: 768, height: 851 });
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

for (const clients of [false, true]) {
  test(`Свайп прокручивает общую строку папок: ${clients ? 'клиенты' : 'чаты'}`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile);
    await page.setViewportSize({ width: 320, height: 640 });
    const saves = await openFixture(page, { clients, many: true });
    const folderList = page.locator('.chat-folder-rail__items');
    const initialHeader = await folderSettings(page).boundingBox();
    const rail = (await folderList.boundingBox())!;
    const y = rail.y + 16;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: 290, y, id: 1 }]
    });
    for (const x of [270, 230, 190, 150, 110, 70]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y, id: 1 }]
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
    await expect
      .poll(() => folderList.evaluate(el => el.scrollLeft))
      .toBeGreaterThan(100);
    await expect(page.locator('.chat-folder-drag-preview')).toHaveCount(0);
    expect(await folderSettings(page).boundingBox()).toEqual(initialHeader);
    expect(saves).toEqual([]);
    await cdp.detach();
  });
}

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
  await folderSettings(page).tap();
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
      await folderSettings(page).tap();
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
  expect((await folderList.boundingBox())!.height).toBe(43);
  const last = page.getByTestId('ChatFolders-Rail-Folder-folder-29');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect((await toolbar.boundingBox())!.height).toBe(height);
  await expect(folderSettings(page)).toBeInViewport();
  await folderList.evaluate(el => (el.scrollLeft = 0));
  await page
    .getByTestId('ChatFolders-Rail-Folder-folder-0')
    .scrollIntoViewIfNeeded();
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
