import { expect, test, type Page } from '@playwright/test';

const folder = {
  id: 'cached-work',
  name: 'Работа офлайн',
  icon: 'star',
  scope: 'chats',
  position: 0,
  topicIds: ['topic-0'],
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z'
};

async function loadFolders(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(
        url => new URL(url).pathname === '/src/composables/useChatFolders.ts'
      );
    if (!url) throw new Error('Модуль папок ещё не загружен');
    const { useChatFolders } = await import(url);
    await useChatFolders().loadFolders(true);
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const url = performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .find(
            url =>
              new URL(url).pathname === '/src/composables/useChatFolders.ts'
          )!;
        return (await import(url)).useChatFolders().isLoading.value;
      })
    )
    .toBe(false);
}

test('папки видны после перезапуска до ответа сети, ошибка загрузки на мобильном без уведомления', async ({
  page,
  isMobile
}) => {
  let mode: 'initial' | 'slow-failure' | 'updated' | 'deleted' = 'initial';
  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/folder-menu-api/chat-folders**', async route => {
    if (mode === 'slow-failure') {
      await gate;
      return route.abort('failed');
    }
    return route.fulfill({
      json:
        mode === 'deleted'
          ? []
          : [
              {
                ...folder,
                name: mode === 'updated' ? 'Обновлённая работа' : folder.name
              }
            ]
    });
  });
  await page.goto('/e2e/fixtures/mobile-folders.html?background');
  const cached = page.locator(
    '.chat-folder-rail [data-folder-id="cached-work"]'
  );
  await expect(cached).toBeVisible();
  mode = 'slow-failure';
  try {
    await page.reload();
    await expect(cached).toBeVisible();
    await expect(cached).toContainText(folder.name);
    await expect(page.locator('.chat-folder-rail .skeleton-block')).toHaveCount(
      0
    );
  } finally {
    release();
  }
  await loadFolders(page);
  const notifications = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(
        url => new URL(url).pathname === '/src/composables/useNotifications.ts'
      )!;
    return (await import(url))
      .useNotifications()
      .state.items.map((item: { title: string }) => item.title);
  });
  expect(notifications.includes('Не удалось загрузить папки')).toBe(!isMobile);
  await expect(cached).toBeVisible();
  mode = 'updated';
  await loadFolders(page);
  await expect(cached).toContainText('Обновлённая работа');
  await page.reload();
  await expect(cached).toContainText('Обновлённая работа');
  mode = 'deleted';
  await loadFolders(page);
  await expect(cached).toHaveCount(0);
  mode = 'slow-failure';
  await page.reload();
  await expect(page.locator('.chats-toolbar')).toBeVisible();
  await expect(cached).toHaveCount(0);
});
