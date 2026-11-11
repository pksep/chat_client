import { expect, test, type Page } from '@playwright/test';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

const menuId = 'Fixture-Header-ContextMenu';
const menu = (page: Page) =>
  page.getByTestId(`${menuId}-ContextMenu-Container`);
const openMenu = async (page: Page) => {
  await page.getByTestId('Fixture-Header-PopoverIcon').click();
  await expect(menu(page)).toBeVisible();
};

async function fixture(page: Page, kind = 'group', empty = false) {
  const state = {
    pin: false,
    mute: false,
    patches: [] as string[],
    errors: [] as string[],
    failFolder: false,
    folders: (empty
      ? []
      : [
          { id: 'work', name: 'Работа', scope: 'chats' },
          { id: 'clients', name: 'Клиенты', scope: 'clients' },
          { id: 'support', name: 'Поддержка', scope: 'clients', isSystem: true }
        ].map(folder => ({
          ...folder,
          icon: 'folder',
          topicIds: [],
          createdAt: '',
          updatedAt: ''
        }))) as ChatFolder[]
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/folder-menu-api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/pin')) {
      state.pin = !state.pin;
      state.patches.push(path);
      await route.fulfill({
        json: {
          isPin: state.pin,
          pinnedAt: state.pin ? new Date().toISOString() : null
        }
      });
    } else if (path.endsWith('/mute')) {
      state.mute = !state.mute;
      state.patches.push(path);
      await route.fulfill({ json: { isMute: state.mute } });
    } else if (path.endsWith('/chat-folders')) {
      await route.fulfill({ json: state.folders });
    } else if (
      path.includes('/chat-folders/') &&
      route.request().method() === 'PATCH'
    ) {
      const folder = state.folders.find(
        item => item.id === path.split('/').at(-1)
      )!;
      const payload = route.request().postDataJSON();
      state.patches.push(path);
      if (state.failFolder) {
        state.failFolder = false;
        await route.fulfill({
          status: 500,
          json: { message: 'Ошибка тестового сохранения' }
        });
        return;
      }
      folder.topicIds = payload.included
        ? [...new Set([...folder.topicIds, payload.topicId])]
        : folder.topicIds.filter(id => id !== payload.topicId);
      await route.fulfill({ json: folder });
    } else await route.fulfill({ json: [] });
  });
  await page.goto(`/e2e/fixtures/header-context-menu.html?kind=${kind}`);
  await expect(page.getByTestId('Fixture-Header-Container')).toBeVisible();
  return state;
}

for (const kind of ['group', 'dm']) {
  test(`Хедер ${kind}: закрепление синхронизируется со списком и не меняет прочитанность`, async ({
    page
  }) => {
    const state = await fixture(page, kind);
    await openMenu(page);
    await expect(menu(page)).not.toContainText(/прочитан|Пометить как новое/);
    await page.getByTestId(`${menuId}-Pin`).click();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByTestId('Fixture-PinState')).toHaveText('true');
    await page
      .getByTestId('Fixture-Topics-ContactList-Item1')
      .click({ button: 'right' });
    await expect(
      page.getByTestId('Fixture-Topics-ContactList-PinButton1')
    ).toContainText('Открепить');
    await page.getByTestId('Fixture-Topics-ContactList-PinButton1').click();
    await expect(page.getByTestId('Fixture-PinState')).toHaveText('false');
    await openMenu(page);
    await expect(page.getByTestId(`${menuId}-Pin`)).toHaveText('Закрепить');
    expect(state.patches.filter(path => path.endsWith('/pin'))).toHaveLength(2);
    expect(state.errors).toEqual([]);
  });
}

test('Папку можно добавить и убрать из хедера; подменю остаётся в окне', async ({
  page,
  isMobile
}) => {
  const state = await fixture(page);
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).click();
  const folders = page.getByTestId(`${menuId}-Folders`);
  await expect(folders).toBeVisible();
  const rect = await folders.boundingBox();
  const viewport = page.viewportSize()!;
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  if (isMobile) {
    await expect(page.getByTestId(`${menuId}-Pin`)).toHaveCount(0);
    await page.getByTestId(`${menuId}-FoldersBack`).click();
    await expect(page.getByTestId(`${menuId}-Pin`)).toBeVisible();
    await page.getByTestId(`${menuId}-AddToFolder`).click();
  }
  await page.getByTestId(`${menuId}-Folder-work`).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-work')).toContainText(
    'header-topic'
  );
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).click();
  await expect(page.getByTestId(`${menuId}-Folder-work`)).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.getByTestId(`${menuId}-Folder-work`).click();
  await expect(page.getByTestId('Fixture-State-work')).not.toContainText(
    'header-topic'
  );
  expect(state.patches.filter(path => path.endsWith('/work'))).toHaveLength(2);
  expect(state.errors).toEqual([]);
});

test('Клиентское обращение показывает только пользовательские папки клиентов', async ({
  page
}) => {
  const state = await fixture(page, 'clients');
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).click();
  await expect(page.getByTestId(`${menuId}-Folder-work`)).toHaveCount(0);
  await expect(page.getByTestId(`${menuId}-Folder-support`)).toHaveCount(0);
  await page.getByTestId(`${menuId}-Folder-clients`).click();
  await expect(page.getByTestId('Fixture-State-clients')).toContainText(
    'header-topic'
  );
  expect(state.errors).toEqual([]);
});

test('Без папок остаются закрепление, уведомления и удаление', async ({
  page
}, testInfo) => {
  const state = await fixture(page, 'group', true);
  await openMenu(page);
  await expect(page.getByTestId(`${menuId}-AddToFolder`)).toHaveCount(0);
  await expect(page.getByTestId(`${menuId}-Pin`)).toBeVisible();
  await expect(
    menu(page).getByRole('button', { name: 'Выйти из группы' })
  ).toBeVisible();
  await expect(
    menu(page).getByRole('button', { name: 'Информация', exact: true })
  ).toHaveCount(0);
  const mute = menu(page).getByRole('button', { name: 'Выкл. уведомления' });
  const destructiveColor = await menu(page)
    .getByRole('button', { name: 'Выйти из группы' })
    .evaluate(button => getComputedStyle(button).color);
  await expect(mute).toHaveCSS('color', destructiveColor);
  await expect(mute.locator('svg')).toHaveCSS('color', destructiveColor);
  await menu(page).screenshot({
    path: testInfo.outputPath('header-disable-notifications.png')
  });
  await mute.click();
  await expect(page.getByTestId('Fixture-MuteState')).toHaveText('true');
  await expect(menu(page)).toHaveCount(0);
  await openMenu(page);
  const unmute = menu(page).getByRole('button', { name: 'Вкл. уведомления' });
  const regularColor = await page
    .getByTestId(`${menuId}-Pin`)
    .evaluate(button => getComputedStyle(button).color);
  await expect(unmute).toHaveCSS('color', regularColor);
  await expect(unmute.locator('svg')).toHaveCSS('color', regularColor);
  await menu(page).screenshot({
    path: testInfo.outputPath('header-enable-notifications.png')
  });
  await unmute.click();
  await expect(page.getByTestId('Fixture-MuteState')).toHaveText('false');
  expect(state.errors).toEqual([]);
});

test('Ошибку сохранения папки можно исправить повторным выбором', async ({
  page
}) => {
  const state = await fixture(page);
  state.failFolder = true;
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).click();
  await page.getByTestId(`${menuId}-Folder-work`).click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось добавить чат в папку'
  );
  await expect(page.getByTestId(`${menuId}-Folder-work`)).toHaveAttribute(
    'aria-checked',
    'false'
  );
  await page.getByTestId(`${menuId}-Folder-work`).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByTestId('Fixture-State-work')).toContainText(
    'header-topic'
  );
  expect(state.errors).toEqual([]);
});

test('Подменю поддерживает клавиатуру и закрывается при смене топика', async ({
  page
}) => {
  const state = await fixture(page);
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).press('ArrowRight');
  await expect(page.getByTestId(`${menuId}-Folder-work`)).toBeFocused();
  await page.getByTestId(`${menuId}-Folder-work`).press('Escape');
  await expect(page.getByTestId(`${menuId}-AddToFolder`)).toBeFocused();
  await page.getByTestId(`${menuId}-AddToFolder`).press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await openMenu(page);
  await page.getByTestId('Fixture-SwitchTopic').press('Enter');
  await expect(menu(page)).toHaveCount(0);
  await openMenu(page);
  await page.getByTestId(`${menuId}-AddToFolder`).click();
  await page.getByTestId(`${menuId}-Folder-work`).click();
  await expect(page.getByTestId('Fixture-State-work')).toContainText(
    'second-topic'
  );
  await expect(page.getByTestId('Fixture-State-work')).not.toContainText(
    'header-topic'
  );
  expect(state.errors).toEqual([]);
});

for (const theme of ['light', 'dark']) {
  test(`Меню хедера в теме ${theme}`, async ({ page, isMobile }, testInfo) => {
    const state = await fixture(page);
    if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
    await openMenu(page);
    await page.getByTestId(`${menuId}-AddToFolder`).click();
    await expect(page.getByTestId(`${menuId}-Folder-work`)).toBeVisible();
    if (!isMobile)
      await expect(page.getByTestId(`${menuId}-Pin`)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`header-menu-${theme}.png`)
    });
    expect(state.errors).toEqual([]);
  });
}

for (const kind of ['favorites', 'ai', 'call']) {
  test(`Специальный хедер ${kind} сохраняет своё меню`, async ({
    page,
    isMobile
  }) => {
    const state = await fixture(page, kind);
    if (kind !== 'call' || isMobile) await openMenu(page);
    await expect(page.getByTestId(`${menuId}-Pin`)).toHaveCount(0);
    await expect(page.getByTestId(`${menuId}-AddToFolder`)).toHaveCount(0);
    if (kind === 'favorites')
      await expect(menu(page)).toContainText('Очистить историю');
    if (kind === 'ai') await expect(menu(page)).toContainText('Создать чат');
    expect(state.errors).toEqual([]);
  });
}
