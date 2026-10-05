import { expect, test, type Page } from './fixtures/ai-history';
import {
  androidBack,
  installAndroidBackMock
} from './fixtures/android-back-mock';

test.beforeEach(async ({ page }) => installAndroidBackMock(page));

async function folderFixture(page: Page, scope = 'chats') {
  const mutations: string[] = [];
  await page.route('**/folder-menu-api/**', route => {
    if (
      route.request().url().includes('/chat-folders') &&
      route.request().method() !== 'GET'
    )
      mutations.push(route.request().method());
    return route.fulfill({
      json: route.request().url().includes('/chat-folders')
        ? [
            {
              id: 'folder-0',
              name: 'Работа',
              icon: 'folder',
              scope,
              topicIds: ['menu-topic-0'],
              createdAt: '',
              updatedAt: ''
            }
          ]
        : []
    });
  });
  await page.goto(
    `/e2e/fixtures/topic-folder-menu.html?panel${scope === 'clients' ? '&clients' : ''}`
  );
  await expect(page.getByTestId('ChatFolders-Folder-folder-0')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute(
    'data-android-back-listeners',
    '1'
  );
  return mutations;
}

async function noExit(page: Page) {
  await expect(page.locator('html')).not.toHaveAttribute('data-android-exits');
}

for (const scope of ['chats', 'clients']) {
  for (const edit of [false, true]) {
    test(`Назад закрывает ${edit ? 'редактор' : 'создание'} папки, затем настройки: ${scope}`, async ({
      page
    }) => {
      const mutations = await folderFixture(page, scope);
      if (edit) {
        await page.getByTestId('ChatFolders-Folder-folder-0').click();
        await page
          .getByRole('button', { name: 'Добавить чат', exact: true })
          .click();
      } else await page.getByTestId('ChatFolders-CreateButton').click();
      const editor = page.locator('dialog.chat-folder-editor-modal[open]');
      await expect(editor).toBeVisible();
      await androidBack(page);
      await expect(editor).toHaveCount(0);
      await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
      await noExit(page);
      await androidBack(page);
      await expect(page.getByTestId('ChatFolders-Panel')).toHaveCount(0);
      await noExit(page);
      expect(mutations).toEqual([]);
      await androidBack(page);
      await expect(page.locator('html')).toHaveAttribute(
        'data-android-exits',
        '1'
      );
    });
  }
}

test('Назад закрывает иконки, подтверждение удаления и информацию по одному слою', async ({
  page
}) => {
  const mutations = await folderFixture(page);
  await page.getByTestId('ChatFolders-Folder-folder-0').click();
  const details = page.locator('dialog.chat-folder-details-modal[open]');
  await expect(details).toBeVisible();
  await page.getByTestId('ChatFolders-IconButton').click();
  await expect(page.getByTestId('ChatFolders-IconPicker')).toBeVisible();
  await androidBack(page);
  await expect(page.getByTestId('ChatFolders-IconPicker')).toHaveCount(0);
  await expect(details).toBeVisible();
  await details
    .getByRole('button', { name: 'Удалить папку', exact: true })
    .click();
  const confirm = page
    .locator('dialog[open]')
    .filter({ hasText: 'Вы уверены' });
  await expect(confirm).toBeVisible();
  await androidBack(page);
  await expect(confirm).toHaveCount(0);
  await expect(details).toBeVisible();
  await noExit(page);
  await androidBack(page);
  await expect(details).toHaveCount(0);
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
  expect(mutations).toEqual([]);
});

test('контекстное меню папки закрывается перед настройками', async ({
  page
}) => {
  await folderFixture(page);
  await page
    .getByTestId('ChatFolders-Folder-folder-0')
    .click({ button: 'right' });
  const menu = page.getByTestId('ChatFolders-Actions-ContextMenu-Container');
  await expect(menu).toBeVisible();
  await androidBack(page);
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
  await noExit(page);
});

test('вложенное окно и меню имеют приоритет над поздним обработчиком переписки', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/android-back.html');
  await page.getByTestId('Fixture-OpenModal').click();
  const base = page.locator('dialog[data-testid="Fixture-BaseModal"][open]');
  await expect(base).toBeVisible();
  await page.getByTestId('Fixture-LateNavigation').click();
  await page.getByTestId('Fixture-OpenNested').click();
  const nested = page.locator('dialog[data-testid^="Fixture-Nested"][open]');
  await expect(nested).toBeVisible();
  await androidBack(page);
  await expect(nested).toHaveCount(0);
  await expect(base).toBeVisible();
  await expect(page.getByTestId('Fixture-RouteBacks')).toHaveText('0');
  await page.getByTestId('Fixture-OpenContext').click();
  const context = page.getByTestId('Fixture-Context-ContextMenu-Container');
  await expect(context).toBeVisible();
  await page.getByTestId('Fixture-NestedFromContext').click();
  await expect(nested).toBeVisible();
  await androidBack(page);
  await expect(nested).toHaveCount(0);
  await expect(context).toBeVisible();
  await androidBack(page);
  await expect(context).toHaveCount(0);
  await expect(base).toBeVisible();
  await androidBack(page);
  await expect(base).toHaveCount(0);
  await expect(page.getByTestId('Fixture-RouteBacks')).toHaveText('0');
  await noExit(page);
  await androidBack(page);
  await expect(page).toHaveURL(/\/dialogs$/);
  await noExit(page);
  await androidBack(page);
  await expect(page.locator('html')).toHaveAttribute('data-android-exits', '1');
});

test('обрезка аватара закрывается перед родительским окном', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/android-back.html');
  await page.getByTestId('Fixture-OpenModal').click();
  await page.getByTestId('Fixture-OpenCrop').click();
  const crop = page
    .locator('dialog[open]')
    .filter({ hasText: 'Изменение фото профиля' });
  await expect(crop).toBeVisible();
  await androidBack(page);
  await expect(crop).toHaveCount(0);
  await expect(
    page.locator('dialog[data-testid="Fixture-BaseModal"][open]')
  ).toBeVisible();
  await noExit(page);
});

test('Назад сворачивает звонок и сохраняет соединение', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Сценарий мобильного звонка');
  await page.goto('/e2e/fixtures/android-back.html');
  await page.getByTestId('Fixture-OpenCall').click();
  await expect(
    page.locator('.call-modal:not(.call-modal--hidden)')
  ).toBeVisible();
  await androidBack(page);
  await expect(page.locator('.call-modal')).toHaveClass(/call-modal--hidden/);
  await expect(page.getByTestId('Fixture-CallOpen')).toHaveText('true');
  await expect(page).toHaveURL(/\/dialogs\/android-back-topic$/);
  await noExit(page);
});

async function rootFixture(page: Page, authenticated = true) {
  await page.addInitScript(authenticated => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', { value: true });
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_AUTH_API: url,
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: 'http://127.0.0.1:4111'
          }
        }
      ])
    );
    localStorage.setItem('chat_runtime_last_organization', url);
    if (authenticated)
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({
          token: 'local-ui-test',
          user: { id: 'android-back-user', initials: 'Тест' }
        })
      );
  }, authenticated);
  await page.route('**/chat-folders', route => route.fulfill({ json: [] }));
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'android-back-user',
        effective: { client: true, ai: true }
      }
    })
  );
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.goto('/');
  if (!authenticated) return;
  await expect(page.locator('.menu-bottom-nav:visible')).toHaveAttribute(
    'aria-busy',
    'false'
  );
  await expect(
    page.locator('.menu-bottom-nav:visible .menu-bottom-nav__button')
  ).toHaveCount(5);
}

test('Назад из мобильных разделов возвращает в Чаты, из настроек папок — к списку', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильные разделы');
  await rootFixture(page);
  const nav = page.locator('.menu-bottom-nav:visible');
  for (const section of ['Calls', 'Profile', 'Clients', 'AI']) {
    const button = nav.locator(`[data-testid$="MenuBottomNav-${section}"]`);
    await button.click();
    await expect(button).toHaveClass(/menu-bottom-nav__button--active/);
    await androidBack(page);
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Chats"]')
    ).toHaveClass(/menu-bottom-nav__button--active/);
    await noExit(page);
  }
  await page
    .getByTestId('ChatFolders-Rail-Manage')
    .filter({ visible: true })
    .click();
  await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
  await androidBack(page);
  await expect(page.getByTestId('ChatFolders-Panel')).toHaveCount(0);
  await noExit(page);
  await androidBack(page);
  await expect(page.locator('html')).toHaveAttribute('data-android-exits', '1');
});

test('Назад с ввода пароля возвращает к выбору организации', async ({
  page
}) => {
  await rootFixture(page, false);
  const authorization = page.getByTestId('AuthorizationScreen');
  await expect(authorization).toBeVisible();
  await expect(
    authorization.getByRole('button', { name: 'Назад', exact: true })
  ).toBeVisible();
  await androidBack(page);
  await expect(
    authorization.getByRole('button', { name: 'Назад', exact: true })
  ).toHaveCount(0);
  await noExit(page);
  await androidBack(page);
  await expect(page.locator('html')).toHaveAttribute('data-android-exits', '1');
});

test('Назад сворачивает голосовой режим ИИ', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Мобильный голосовой режим');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise<MediaStream>(() => {}) }
    });
  });
  await rootFixture(page);
  await page.goto('/ai');
  await page
    .getByTestId('ChatContainer-ChatContainer-Header-Header-CallIcon')
    .click();
  const voice = page.getByRole('dialog', { name: 'Голосовой режим' });
  await expect(voice).toBeVisible();
  await androidBack(page);
  await expect(voice).toHaveCount(0);
  await expect(page.locator('.chat__header-active-call')).toBeVisible();
  await noExit(page);
});
