import { expect, test, type Page } from '@playwright/test';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

async function fixture(page: Page) {
  const state = {
    folder: {
      id: 'folder-0',
      name: 'Работа',
      icon: 'folder',
      scope: 'chats',
      topicIds: ['menu-topic-0'],
      createdAt: '',
      updatedAt: ''
    } as ChatFolder,
    failNext: false,
    failLoad: false,
    errors: [] as string[],
    saves: [] as unknown[]
  };
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/folder-menu-api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.includes('/chat-folders')) {
      if (
        (request.method() === 'GET' && state.failLoad) ||
        (request.method() !== 'GET' && state.failNext)
      ) {
        state.failLoad = false;
        state.failNext = false;
        await route.abort('failed');
        return;
      }
      if (request.method() === 'GET') {
        await route.fulfill({ json: [state.folder] });
      } else if (request.method() === 'DELETE') {
        await route.fulfill({ status: 204 });
      } else {
        const payload = request.postDataJSON();
        state.saves.push(payload);
        Object.assign(state.folder, payload);
        await route.fulfill({ json: state.folder });
      }
    } else await route.fulfill({ json: [] });
  });
  await page.goto('/e2e/fixtures/topic-folder-menu.html?panel');
  await expect(page.getByTestId('ChatFolders-Folder-folder-0')).toBeVisible();
  return state;
}

async function expectTopNotification(page: Page, title: string, index = 0) {
  const notification = page
    .getByTestId('Fixture-Notification')
    .filter({ hasText: title });
  await expect(notification).toBeVisible();
  await expect(notification).toContainText(title);
  await expect(notification).toContainText(/Failed to fetch/i);
  await expect(notification).toHaveCSS('top', `${16 + index * 88}px`);
  await expect
    .poll(async () =>
      notification.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return (
          element.matches(':popover-open') &&
          element.contains(
            document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2
            )
          )
        );
      })
    )
    .toBe(true);
  await expect(
    page.locator(
      '.chat-folder-editor__error, .chat-folder-details__error, .chat-folder-editor--has-error'
    )
  ).toHaveCount(0);
  for (const content of await page
    .locator('dialog[open] > .modal-yui-kit__modal-content')
    .all())
    await expect(content).not.toContainText(/Failed to fetch/i);
}

for (const theme of ['light', 'dark']) {
  for (const mode of ['create', 'edit'] as const) {
    test(`Ошибка сети показывается сверху, выбор сохраняется: ${mode}, ${theme}`, async ({
      page
    }) => {
      const state = await fixture(page);
      if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
      if (mode === 'create') {
        await page.getByTestId('ChatFolders-CreateButton').click();
      } else {
        await page.getByTestId('ChatFolders-Folder-folder-0').click();
        await page
          .getByRole('button', { name: 'Добавить чат', exact: true })
          .click();
      }
      const modal = page.locator('dialog.chat-folder-editor-modal[open]');
      await expect(modal).toBeVisible();
      const nameInput = page
        .getByTestId('ChatFolders-NameInput')
        .locator('input');
      if (mode === 'create') await nameInput.fill('Новая папка');
      await modal
        .getByTestId('ChatFolders-TopicList-ContactList-Item2')
        .locator('.contact-list__item')
        .click();
      const checkbox = modal.getByTestId(
        'ChatFolders-TopicList-ContactList-Checkbox2'
      );
      await expect(checkbox).toBeChecked();
      await expect(modal).not.toHaveClass(/-enter-(active|from|to)/);
      const topicsBox = await modal
        .locator('.chat-folder-editor__topics')
        .boundingBox();
      const save = page.getByTestId('ChatFolders-SaveButton');
      state.failNext = true;
      await save.click();
      await expectTopNotification(page, 'Не удалось сохранить папку');
      await expect(modal).toBeVisible();
      await expect(checkbox).toBeChecked();
      await expect(nameInput).toHaveValue(
        mode === 'create' ? 'Новая папка' : 'Работа'
      );
      await expect(save).toBeEnabled();
      expect(
        await modal.locator('.chat-folder-editor__topics').boundingBox()
      ).toEqual(topicsBox);
      await page.screenshot({
        path: test.info().outputPath('folder-error.png')
      });
      await save.click();
      await expect(modal).toHaveCount(0);
      expect(state.saves).toEqual([
        {
          name: mode === 'create' ? 'Новая папка' : 'Работа',
          ...(mode === 'create' ? { icon: 'folder', scope: 'chats' } : {}),
          topicIds:
            mode === 'create'
              ? ['menu-topic-1']
              : ['menu-topic-0', 'menu-topic-1']
        }
      ]);
      expect(state.errors).toEqual([]);
    });
  }
}

test('Ошибка переименования и смены иконки не появляется внутри правой модалки', async ({
  page
}) => {
  const state = await fixture(page);
  await page.getByTestId('ChatFolders-Folder-folder-0').click();
  const name = page
    .getByTestId('ChatFolders-DetailsNameInput')
    .locator('input');
  state.failNext = true;
  await name.fill('Новое имя');
  await name.press('Enter');
  await expectTopNotification(page, 'Не удалось переименовать папку');
  await expect(name).toHaveValue('Работа');
  await page.getByTestId('Fixture-Notification-Notification-Button').click();
  await expect(page.getByTestId('Fixture-Notification')).toHaveCount(0);
  await page.getByTestId('ChatFolders-IconButton').click();
  state.failNext = true;
  await page.getByTestId('ChatFolders-Icon-settings').click();
  await expectTopNotification(page, 'Не удалось изменить иконку');
  await expect(page.getByTestId('ChatFolders-IconPicker')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('Ошибка удаления не заменяет текст подтверждения', async ({ page }) => {
  const state = await fixture(page);
  await page.getByTestId('ChatFolders-Folder-folder-0').click();
  await page
    .getByRole('button', { name: 'Удалить папку', exact: true })
    .click();
  const confirmation = page
    .locator('dialog[open]')
    .filter({ has: page.getByRole('heading', { name: 'Удалить папку' }) });
  state.failNext = true;
  await confirmation.getByRole('button', { name: 'Да', exact: true }).click();
  await expectTopNotification(page, 'Не удалось удалить папку');
  await expect(confirmation).toContainText(
    'Вы уверены, что хотите удалить папку «Работа»?'
  );
  await expect(page.getByTestId('Fixture-State-folder-0')).toContainText(
    'Работа'
  );
  expect(state.errors).toEqual([]);
});

test('Ошибка загрузки папок выводится верхней плашкой, не подменяя список', async ({
  page
}) => {
  const state = await fixture(page);
  state.failLoad = true;
  await page.getByTestId('Fixture-Refresh').click();
  await expectTopNotification(page, 'Не удалось загрузить папки');
  await expect(page.getByTestId('ChatFolders-Panel')).not.toContainText(
    /Failed to fetch/i
  );
  await expect(page.getByTestId('ChatFolders-Folder-folder-0')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('Плашка остаётся доступной при открытии и закрытии модалки', async ({
  page
}) => {
  const state = await fixture(page);
  await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-02T12:00:01Z'));
  state.failLoad = true;
  await page.getByTestId('Fixture-Refresh').click();
  await expectTopNotification(page, 'Не удалось загрузить папки');
  await page.getByTestId('ChatFolders-Folder-folder-0').click();
  await page.clock.runFor(400);
  await expectTopNotification(page, 'Не удалось загрузить папки');
  await page.keyboard.press('Escape');
  await page.clock.runFor(400);
  await expect(
    page.locator('dialog.chat-folder-details-modal[open]')
  ).toHaveCount(0);
  await expectTopNotification(page, 'Не удалось загрузить папки');
  await expect(page.getByTestId('Fixture-Notification')).toHaveCount(1);
  await page.getByTestId('Fixture-Notification-Notification-Button').click();
  await expect(page.getByTestId('Fixture-Notification')).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test('Несколько ошибок образуют верхний стек и удаляются без повторного появления', async ({
  page
}) => {
  const state = await fixture(page);
  await page.clock.install({ time: new Date('2026-10-02T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-02T12:00:01Z'));
  state.failLoad = true;
  await page.getByTestId('Fixture-Refresh').click();
  await expectTopNotification(page, 'Не удалось загрузить папки');
  await page.getByTestId('ChatFolders-CreateButton').click();
  await page.clock.runFor(400);
  await page
    .getByTestId('ChatFolders-NameInput')
    .locator('input')
    .fill('Новая папка');
  await page
    .getByTestId('ChatFolders-TopicList-ContactList-Item2')
    .locator('.contact-list__item')
    .click();
  state.failNext = true;
  await page.getByTestId('ChatFolders-SaveButton').click();
  await expectTopNotification(page, 'Не удалось сохранить папку', 1);
  await page.clock.runFor(1);
  await page
    .getByTestId('Fixture-Notification')
    .filter({ hasText: 'Не удалось загрузить папки' })
    .getByTestId('Fixture-Notification-Notification-Button')
    .click();
  await expect(page.getByTestId('Fixture-Notification')).toHaveCount(1);
  await expectTopNotification(page, 'Не удалось сохранить папку');
  await page.clock.runFor(3000);
  await expect(page.getByTestId('Fixture-Notification')).toHaveCount(0);
  await expect(
    page.locator('dialog.chat-folder-editor-modal[open]')
  ).toBeVisible();
  expect(state.errors).toEqual([]);
});
