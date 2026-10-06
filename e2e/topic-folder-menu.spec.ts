import { expect, test, type Page } from '@playwright/test';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

const makeFolders = (): ChatFolder[] => [
  ...['Важное', 'Работа', 'Закупки', 'Бухгалтерия'].map((name, index) => ({
    id: `folder-${index}`,
    name,
    icon: (['folder', 'briefcase', 'star', 'heart'] as const)[index],
    scope: 'chats' as const,
    position: index,
    topicIds: index === 3 ? ['menu-topic-0'] : ['existing-topic'],
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z'
  })),
  {
    id: 'client-folder',
    name: 'Клиенты',
    icon: 'settings',
    scope: 'clients',
    topicIds: ['client-existing'],
    createdAt: '',
    updatedAt: ''
  }
];

async function fixture(
  page: Page,
  options: {
    empty?: boolean;
    clients?: boolean;
    many?: boolean;
    mobileShell?: boolean;
  } = {}
) {
  const state = {
    folders: options.empty ? [] : makeFolders(),
    patches: [] as { id: string; topicIds: string[] }[],
    errors: [] as string[],
    failNext: false,
    delay: 0
  };
  if (options.many) {
    state.folders = Array.from({ length: 40 }, (_, index) => ({
      ...makeFolders()[0],
      id: `folder-${index}`,
      name: `Очень длинное название папки ${index}`,
      position: index
    }));
  }
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/folder-menu-api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/chat-folders')) {
      await route.fulfill({ json: state.folders });
    } else if (
      url.pathname.includes('/chat-folders/') &&
      route.request().method() === 'PATCH'
    ) {
      const id = url.pathname.split('/').at(-1)!;
      const payload = route.request().postDataJSON();
      if ('included' in payload) {
        const folder = state.folders.find(item => item.id === id)!;
        payload.topicIds = payload.included
          ? [...new Set([...folder.topicIds, payload.topicId])]
          : folder.topicIds.filter(topicId => topicId !== payload.topicId);
        delete payload.included;
        delete payload.topicId;
      }
      state.patches.push({ id, topicIds: payload.topicIds });
      if (state.delay)
        await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failNext) {
        state.failNext = false;
        await route.fulfill({
          status: 500,
          json: { message: 'Ошибка тестового сохранения' }
        });
        return;
      }
      const folder = state.folders.find(item => item.id === id)!;
      Object.assign(folder, payload);
      await route.fulfill({ json: folder });
    } else {
      await route.fulfill({ json: [] });
    }
  });
  const params = new URLSearchParams();
  if (options.clients) params.set('clients', '');
  if (options.mobileShell) params.set('mobile-shell', '');
  await page.goto(`/e2e/fixtures/topic-folder-menu.html?${params}`);
  await expect(
    page.getByTestId('Fixture-Topics-ContactList-Item1')
  ).toBeVisible();
  return state;
}

const context = (page: Page) => page.locator('.topic-folder-context-menu');
const foldersMenu = (page: Page) =>
  page.getByRole('menu', { name: 'Добавить в папку' });
async function openContext(page: Page, index = 1) {
  await page
    .getByTestId(`Fixture-Topics-ContactList-Item${index}`)
    .locator('.contact-list__item')
    .click({ button: 'right', position: { x: 160, y: 20 } });
  await expect(context(page)).toBeVisible();
}
async function openFolders(page: Page, isMobile: boolean) {
  const button = context(page).getByRole('button', {
    name: 'Добавить в папку',
    exact: true
  });
  if (isMobile) await button.tap();
  else await button.hover();
  await expect(foldersMenu(page)).toBeVisible();
}

test('Мобильное меню топика принимает нажатия поверх списка и добавляет в папку', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверяется мобильный слой меню');
  const state = await fixture(page, { mobileShell: true });
  const row = page
    .getByTestId('Fixture-Topics-ContactList-Item1')
    .locator('.contact-list__item');
  const box = (await row.boundingBox())!;
  const pointer = { x: box.x + 160, y: box.y + 20 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [pointer]
  });
  // В эмуляторе нет системного удержания: воспроизводим событие браузера.
  await row.evaluate(
    (element, pointer) =>
      element.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: pointer.x,
          clientY: pointer.y
        })
      ),
    pointer
  );
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchCancel',
    touchPoints: []
  });
  await expect(context(page)).toBeVisible();
  const trigger = page.getByTestId(
    'Fixture-Topics-ContactList-ContextMenu1-AddToFolder'
  );
  expect(
    await trigger.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2
      );
      return !!target && element.contains(target);
    })
  ).toBe(true);
  await trigger.tap();
  await expect(foldersMenu(page)).toBeVisible();
  await page
    .getByTestId('Fixture-Topics-ContactList-ContextMenu1-FoldersBack')
    .tap();
  await expect(foldersMenu(page)).toHaveCount(0);
  await trigger.tap();
  await page
    .getByTestId('Fixture-Topics-ContactList-ContextMenu1-Folder-folder-1')
    .tap();
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-folder-1')).toContainText(
    'existing-topic,menu-topic-0'
  );
  expect(state.patches).toEqual([
    { id: 'folder-1', topicIds: ['existing-topic', 'menu-topic-0'] }
  ]);
  await expect(page.getByTestId('Fixture-TopicOpens')).toHaveText('0');

  await openContext(page);
  await page.touchscreen.tap(10, 10);
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-TopicOpens')).toHaveText('0');
  expect(state.errors).toEqual([]);
});

test('Добавляет и убирает топик повторным кликом без потери остальных чатов', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  await openContext(page);
  await openFolders(page, isMobile);
  await expect(
    foldersMenu(page).getByRole('menuitemcheckbox', { name: 'Бухгалтерия' })
  ).toHaveAttribute('aria-checked', 'true');
  const work = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Работа'
  });
  if (isMobile) await work.tap();
  else await work.click();
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-folder-1')).toContainText(
    'existing-topic,menu-topic-0'
  );
  expect(state.patches).toEqual([
    { id: 'folder-1', topicIds: ['existing-topic', 'menu-topic-0'] }
  ]);
  expect(state.folders[3].topicIds).toEqual(['menu-topic-0']);
  await openContext(page);
  await openFolders(page, isMobile);
  const checked = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Работа'
  });
  await expect(checked).toHaveAttribute('aria-checked', 'true');
  if (isMobile) await checked.tap();
  else await checked.click();
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-folder-1')).toHaveText(
    'Работа: existing-topic'
  );
  expect(state.patches).toEqual([
    { id: 'folder-1', topicIds: ['existing-topic', 'menu-topic-0'] },
    { id: 'folder-1', topicIds: ['existing-topic'] }
  ]);
  // Данные сохранены на сервере, а не только в локальном состоянии меню.
  await page.getByTestId('Fixture-Refresh').click();
  await expect(page.getByTestId('Fixture-State-folder-1')).toHaveText(
    'Работа: existing-topic'
  );
  await openContext(page);
  await openFolders(page, isMobile);
  await expect(checked).toHaveAttribute('aria-checked', 'false');
  await checked.click();
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-folder-1')).toContainText(
    'existing-topic,menu-topic-0'
  );
  expect(state.patches).toHaveLength(3);
  expect(state.folders[3].topicIds).toEqual(['menu-topic-0']);
  expect(state.errors).toEqual([]);
});

test('Убирает последний топик из папки и сохраняет пустую папку', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  await openContext(page);
  await openFolders(page, isMobile);
  const folder = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Бухгалтерия'
  });
  await expect(folder).toHaveAttribute('aria-checked', 'true');
  await folder.click();
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toEqual([{ id: 'folder-3', topicIds: [] }]);
  await page.getByTestId('Fixture-Refresh').click();
  await expect(page.getByTestId('Fixture-State-folder-3')).toHaveText(
    'Бухгалтерия: '
  );
  await openContext(page);
  await openFolders(page, isMobile);
  await expect(folder).toHaveAttribute('aria-checked', 'false');
  expect(state.errors).toEqual([]);
});

test('При ошибке удаления сохраняет галочку и позволяет повторить', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  state.failNext = true;
  await openContext(page);
  await openFolders(page, isMobile);
  const folder = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Бухгалтерия'
  });
  await folder.click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось убрать чат из папки'
  );
  await expect(folder).toBeEnabled();
  await expect(folder).toHaveAttribute('aria-checked', 'true');
  expect(state.folders[3].topicIds).toEqual(['menu-topic-0']);
  await folder.click();
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toEqual([
    { id: 'folder-3', topicIds: [] },
    { id: 'folder-3', topicIds: [] }
  ]);
  expect(state.errors).toEqual([]);
});

test('При ошибке оставляет меню открытым и позволяет повторить сохранение', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  state.failNext = true;
  await openContext(page);
  await openFolders(page, isMobile);
  const work = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Работа'
  });
  await work.click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось добавить чат в папку'
  );
  await expect(work).toBeEnabled();
  await expect(work).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('Fixture-State-folder-1')).not.toContainText(
    'menu-topic-0'
  );
  await work.click();
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('При сохранении блокирует повторные нажатия', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  state.delay = 400;
  await openContext(page);
  await openFolders(page, isMobile);
  const work = foldersMenu(page).getByRole('menuitemcheckbox', {
    name: 'Работа'
  });
  await work.click();
  await expect(work).toBeDisabled();
  await expect(foldersMenu(page)).toHaveAttribute('aria-busy', 'true');
  await work.dispatchEvent('click');
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toHaveLength(1);
});

test('Пункт отсутствует без папок и в режиме выбора чатов', async ({
  page
}) => {
  const state = await fixture(page, { empty: true });
  await openContext(page);
  await expect(
    context(page).getByRole('button', { name: 'Добавить в папку' })
  ).toHaveCount(0);
  await expect(context(page).getByRole('button')).toHaveCount(3);
  await page.mouse.click(10, 10);
  await expect(context(page)).toHaveCount(0);
  await page.getByTestId('Fixture-Selection').click();
  await expect(context(page)).toHaveCount(0);
  await page
    .getByTestId('Fixture-Topics-ContactList-Item1')
    .dispatchEvent('contextmenu');
  await expect(context(page)).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('Раздел клиентов показывает только клиентские папки', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page, { clients: true });
  await openContext(page);
  await openFolders(page, isMobile);
  await expect(foldersMenu(page).getByRole('menuitemcheckbox')).toHaveCount(1);
  await foldersMenu(page)
    .getByRole('menuitemcheckbox', { name: 'Клиенты' })
    .click();
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toEqual([
    { id: 'client-folder', topicIds: ['client-existing', 'menu-topic-0'] }
  ]);
  await openContext(page);
  await openFolders(page, isMobile);
  await foldersMenu(page)
    .getByRole('menuitemcheckbox', { name: 'Клиенты' })
    .click();
  await expect(context(page)).toHaveCount(0);
  expect(state.patches).toEqual([
    { id: 'client-folder', topicIds: ['client-existing', 'menu-topic-0'] },
    { id: 'client-folder', topicIds: ['client-existing'] }
  ]);
  expect(state.errors).toEqual([]);
});

test('Одновременные удаление и добавление не перезаписывают друг друга', async ({
  page
}) => {
  const state = await fixture(page);
  state.delay = 100;
  await page.getByTestId('Fixture-ConcurrentChanges').click();
  await expect(page.getByTestId('Fixture-ConcurrentResult')).toHaveText(
    'Готово'
  );
  expect(state.patches).toEqual([
    { id: 'folder-0', topicIds: [] },
    { id: 'folder-0', topicIds: ['menu-topic-0'] }
  ]);
  await expect(page.getByTestId('Fixture-State-folder-0')).toHaveText(
    'Важное: menu-topic-0'
  );
  expect(state.errors).toEqual([]);
});

test('Параллельные добавления не перезаписывают друг друга и не допускают чужой раздел', async ({
  page
}) => {
  const state = await fixture(page);
  state.delay = 100;
  await page.getByTestId('Fixture-Concurrent').click();
  await expect(page.getByTestId('Fixture-ConcurrentResult')).toHaveText(
    'Готово'
  );
  expect(state.patches).toEqual([
    { id: 'folder-0', topicIds: ['existing-topic', 'menu-topic-0'] },
    {
      id: 'folder-0',
      topicIds: ['existing-topic', 'menu-topic-0', 'menu-topic-1']
    }
  ]);
  await page.getByTestId('Fixture-CrossScope').click();
  await expect(page.getByTestId('Fixture-ConcurrentResult')).toHaveText(
    'Папка больше недоступна'
  );
  expect(state.patches).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`Геометрия, иконки и цвета меню по макету: ${theme}`, async ({
    page,
    isMobile
  }, testInfo) => {
    await fixture(page);
    if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
    await openContext(page);
    await expect(context(page)).toHaveCSS('width', '257px');
    await expect(context(page)).toHaveCSS('height', '175px');
    await expect(context(page)).toHaveCSS('border-radius', '15px');
    await openFolders(page, isMobile);
    const menu = foldersMenu(page);
    const item = menu.getByRole('menuitemcheckbox').first();
    await expect(item).toHaveCSS('height', '35px');
    await expect(item).toHaveCSS('font-size', '16px');
    await expect(item).toHaveCSS('font-weight', '400');
    await expect(item).toHaveCSS('line-height', '16px');
    await expect(item).toHaveCSS('gap', '5px');
    await expect(item.locator('svg')).toHaveCSS('width', '20px');
    await expect(item.locator('svg')).toHaveCSS('height', '20px');
    const styles = await menu.evaluate(element => {
      const style = getComputedStyle(element);
      const color = (name: string) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        element.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      return {
        surface: style.backgroundColor,
        text: style.color,
        expectedSurface: color('--surface-overlay'),
        expectedText: color('--text-primary'),
        hover: color('--action-secondary-hover-bg')
      };
    });
    expect(styles.surface).toBe(styles.expectedSurface);
    expect(styles.text).toBe(styles.expectedText);
    await page.screenshot({
      path: testInfo.outputPath(`topic-folders-${theme}.png`)
    });
    if (isMobile) {
      await expect(menu).toHaveCSS('position', 'static');
      await expect(context(page)).toHaveCSS('height', '215px');
      await expect(
        context(page).getByTestId('Fixture-Topics-ContactList-PinButton1')
      ).toHaveCount(0);
      await context(page)
        .getByRole('button', { name: 'Добавить в папку' })
        .tap();
      await expect(menu).toHaveCount(0);
      await expect(context(page)).toHaveCSS('height', '175px');
    } else {
      await expect(menu).toHaveCSS('width', '252px');
      await expect(menu).toHaveCSS('height', '175px');
      await expect(menu).toHaveCSS('padding', '10px');
      const box = (await menu.boundingBox())!;
      const parentBox = (await context(page).boundingBox())!;
      expect(box.x - parentBox.x - parentBox.width).toBe(5);
      await item.hover();
      await expect(item).toHaveCSS('background-color', styles.hover);
      await expect(menu).toBeVisible();
    }
  });
}

test('Клавиатура открывает подменю и возвращается назад без открытия чата', async ({
  page
}) => {
  await fixture(page);
  await openContext(page);
  const trigger = context(page).getByRole('button', {
    name: 'Добавить в папку',
    exact: true
  });
  await trigger.focus();
  await trigger.press('ArrowRight');
  await expect(
    foldersMenu(page).getByRole('menuitemcheckbox').first()
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    foldersMenu(page).getByRole('menuitemcheckbox').nth(1)
  ).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(trigger).toBeFocused();
  await expect(foldersMenu(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(context(page)).toHaveCount(0);
});

test('Выбор папки по Enter не открывает сам топик', async ({ page }) => {
  const state = await fixture(page);
  await openContext(page);
  const trigger = context(page).getByRole('button', {
    name: 'Добавить в папку',
    exact: true
  });
  await trigger.focus();
  await trigger.press('ArrowRight');
  await foldersMenu(page).getByRole('menuitemcheckbox').first().press('Enter');
  await expect(context(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-folder-0')).toContainText(
    'menu-topic-0'
  );
  await expect(page.getByTestId('Fixture-TopicOpens')).toHaveText('0');
  expect(state.errors).toEqual([]);
});

test('Ответ сохранения после смены пользователя не возвращает его старые папки', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  state.delay = 500;
  await openContext(page);
  await openFolders(page, isMobile);
  await foldersMenu(page).getByRole('menuitemcheckbox').first().click();
  await expect.poll(() => state.patches.length).toBe(1);
  // Смена авторизации может прийти извне во время открытого меню.
  const response = page.waitForResponse(
    response =>
      response.request().method() === 'PATCH' &&
      response.url().includes('/chat-folders/')
  );
  await page.getByTestId('Fixture-SwitchUser').dispatchEvent('click');
  await response;
  await expect(context(page)).toHaveCount(0);
  await expect(
    page.getByTestId('Fixture-FolderState').locator('div')
  ).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('Длинный список и меню у края не выходят за экран', async ({
  page,
  isMobile
}) => {
  await fixture(page, { many: true });
  const viewport = page.viewportSize()!;
  await page
    .getByTestId('Fixture-Topics-ContactList-Item1')
    .locator('.contact-list__item')
    .evaluate(
      (element, size) =>
        element.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: size.width - 12,
            clientY: size.height - 12
          })
        ),
      viewport
    );
  await openFolders(page, isMobile);
  await expect
    .poll(async () => {
      const settled = (await foldersMenu(page).boundingBox())!;
      return settled.y + settled.height;
    })
    .toBeLessThanOrEqual(viewport.height - 8);
  const box = (await foldersMenu(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
  await expect(foldersMenu(page)).toHaveCSS('overflow-y', 'auto');
  await foldersMenu(page)
    .getByRole('menuitemcheckbox')
    .last()
    .scrollIntoViewIfNeeded();
  await expect(
    foldersMenu(page).getByRole('menuitemcheckbox').last()
  ).toBeVisible();
});
