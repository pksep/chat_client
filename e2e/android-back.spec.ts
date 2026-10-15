import { expect, test, type Page } from './fixtures/ai-history';
import {
  androidBack,
  installAndroidBackMock
} from './fixtures/android-back-mock';

test.beforeEach(async ({ page }) => installAndroidBackMock(page));

test('стрелка Назад сохраняет размер и эффекты во всех хедерах', async ({
  page
}) => {
  for (const width of [320, 390, 600, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/e2e/fixtures/android-back.html?headers');
    const buttons = page
      .getByTestId('Fixture-Headers')
      .locator('button.chat__header-back');
    await expect(buttons).toHaveCount(5);
    for (const button of await buttons.all()) {
      await expect(button).toHaveCSS('width', '30px');
      await expect(button).toHaveCSS('height', '30px');
      await expect(button).toHaveClass(/popover-yui-kit/);
    }
    const button = buttons.first();
    const idle = await button.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    await button.hover();
    await expect(button).not.toHaveCSS('background-color', idle);
    const hover = await button.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    await page.mouse.down();
    await expect(button).not.toHaveCSS('background-color', hover);
    await expect(button).not.toHaveCSS('background-color', idle);
    await expect(button).toHaveCSS('width', '30px');
    await expect(button).toHaveCSS('height', '30px');
    await page.mouse.up();
  }
});

test('Звонилка сохраняет оформление при загрузке данных и возвращается к звонкам', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильный хедер');
  await page.goto('/e2e/fixtures/android-back.html');
  await page.getByTestId('Fixture-OpenCallTopic').click();
  const title = page.getByTestId('Fixture-CallHeader-Header-CallTopicTitle');
  const back = page.getByTestId('Fixture-CallHeader-Header-BackButton');
  const message = page.locator('[data-message-id="call-style-message"]');
  const titleStyle = () =>
    title.evaluate(element => {
      const style = getComputedStyle(element);
      return [
        style.fontFamily,
        style.fontSize,
        style.fontWeight,
        style.lineHeight
      ];
    });
  await expect(title).toHaveText('Звонилка');
  await expect(message).toBeVisible();
  await expect(page.locator('.message-group__avatar-slot')).toHaveCount(0);
  await expect(back).toHaveCSS('width', '30px');
  await expect(back).toHaveCSS('height', '30px');
  const initialStyle = await titleStyle();
  for (const state of ['Clear', 'Load']) {
    await page.getByTestId(`Fixture-${state}CallMetadata`).click();
    await expect(title).toHaveText('Звонилка');
    await expect(page.locator('.message-group__avatar-slot')).toHaveCount(0);
    expect(await titleStyle()).toEqual(initialStyle);
  }
  await back.click();
  await expect(page).toHaveURL(/\/call$/);
  await expect(page.getByTestId('Fixture-CallTopic')).toHaveCount(0);
  await page.getByTestId('Fixture-OpenCallTopic').click();
  await androidBack(page);
  await expect(page).toHaveURL(/\/call$/);
  await expect(page.getByTestId('Fixture-CallTopic')).toHaveCount(0);
  await noExit(page);
});

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

for (const width of [393, 600]) {
  test(`Назад из топика ИИ возвращает в список ИИ: ${width}px`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Мобильное событие Назад');
    await page.setViewportSize({ width, height: 851 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'sep:chat:ai-assistant:v1',
        JSON.stringify({
          sessions: [
            {
              id: 'android-back-ai',
              title: 'Тест возврата ИИ',
              description: '',
              time: '10:00',
              messages: []
            }
          ],
          tasks: [],
          permissionMode: 'ask'
        })
      );
    });
    await rootFixture(page);
    const nav = page.locator('.menu-bottom-nav:visible');
    await nav.locator('[data-testid$="MenuBottomNav-AI"]').click();
    const session = page
      .getByTestId('AI-MenuPanel')
      .getByRole('button', { name: /Тест возврата ИИ/ });
    await session.click();
    await expect(page).toHaveURL(/\/ai\/android-back-ai$/);
    const composer = page.locator('.ai-assistant__composer');
    await expect(composer.locator('.ProseMirror')).toBeVisible();
    if (width > 480) {
      await composer.locator('.smile-button:visible').click();
      const picker = composer.locator('.emoji-picker--open:visible');
      await expect(picker).toBeVisible();
      await androidBack(page);
      await expect(picker).toHaveCount(0);
      await expect(page).toHaveURL(/\/ai\/android-back-ai$/);
      await noExit(page);
    }
    await androidBack(page);
    await expect(page).toHaveURL(/\/assistant$/);
    await expect(session).toBeVisible();
    await expect(nav.locator('[data-testid$="MenuBottomNav-AI"]')).toHaveClass(
      /menu-bottom-nav__button--active/
    );
    await noExit(page);
    await androidBack(page);
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Chats"]')
    ).toHaveClass(/menu-bottom-nav__button--active/);
    await noExit(page);
    await androidBack(page);
    await expect(page.locator('html')).toHaveAttribute(
      'data-android-exits',
      '1'
    );
  });
}

test('Назад из обращения менеджера закрывает эмодзи и возвращает в Клиенты', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильное событие Назад');
  await rootFixture(page);
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({
      json: [
        {
          id: 'android-back-inquiry',
          topic_id: 'android-back-client',
          name: 'Клиент для возврата',
          contacts: {},
          source: { channel: 'widget' },
          manager_ids: [],
          metadata_version: 1
        }
      ]
    })
  );
  await page.route('**/messages/topic/**', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/manager/inquiries/android-back-inquiry/routes', route =>
    route.fulfill({ json: [] })
  );
  await page.evaluate(async () => {
    const moduleUrl = (path: string) => {
      const url = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === path);
      if (!url) throw new Error(`Модуль ${path} ещё не загружен`);
      return url;
    };
    const { setTopics } = await import(
      moduleUrl('/src/composables/useTopics.ts')
    );
    setTopics([
      {
        id: 'android-back-client',
        type: 'GROUP',
        name: 'Клиент для возврата',
        group: { id: 'android-back-client', name: 'Клиент для возврата' },
        info: {},
        unreadMessageCount: 0
      }
    ]);
    const { refreshManagerInquiries } = await import(
      moduleUrl('/src/composables/useManagerInquiries.ts')
    );
    await refreshManagerInquiries();
  });
  const nav = page.locator('.menu-bottom-nav:visible');
  const clientsButton = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
  await clientsButton.click();
  const client = page
    .getByTestId('ClientsPanel')
    .getByRole('heading', { name: 'Клиент для возврата', exact: true });
  await client.click();
  await expect(page).toHaveURL(/\/group\/android-back-client$/);
  const composer = page.locator('.chat__input');
  await expect(composer.locator('.ProseMirror')).toBeVisible();
  await composer.locator('.smile-button:visible').click();
  const picker = composer.locator('.emoji-picker--open:visible');
  await expect(picker).toBeVisible();
  await androidBack(page);
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(/\/group\/android-back-client$/);
  await noExit(page);
  await androidBack(page);
  await expect(page).toHaveURL(/\/group$/);
  await expect(client).toBeVisible();
  await expect(clientsButton).toHaveClass(/menu-bottom-nav__button--active/);
  await noExit(page);
  await androidBack(page);
  await expect(nav.locator('[data-testid$="MenuBottomNav-Chats"]')).toHaveClass(
    /menu-bottom-nav__button--active/
  );
  await noExit(page);
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
