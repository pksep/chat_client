import { expect, test, type Page } from '@playwright/test';
import {
  androidBack,
  installAndroidBackMock
} from './fixtures/android-back-mock';
import { mockStickerCatalog } from './fixtures/sticker-catalog';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

async function openComposer(page: Page, emptyCatalog = false) {
  await installAndroidBackMock(page);
  const state = await openFixture(page, { shell: true, count: 2 });
  const catalog = await mockStickerCatalog(page);
  if (emptyCatalog) catalog.packs.splice(0);
  await openTopic(page, 0);
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible();
  return state;
}

for (const mode of ['Эмодзи', 'Стикеры', 'Стикеры без наборов']) {
  test(`Назад закрывает ${mode.toLowerCase()} без клавиатуры, сохраняя текущий топик`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Мобильное событие Назад');
    const { errors } = await openComposer(page, mode === 'Стикеры без наборов');
    const topicUrl = page.url();
    await page.locator('.chat__input .smile-button:visible').tap();
    const picker = page.locator('.chat__input .emoji-picker--open:visible');
    await expect(picker).toBeVisible();
    if (mode !== 'Эмодзи') {
      await picker.getByRole('button', { name: 'Стикеры', exact: true }).tap();
      await expect(
        picker.getByRole('region', { name: 'Каталог стикеров' })
      ).toBeVisible();
    }
    await androidBack(page);
    await expect(picker).toHaveCount(0);
    await expect(page).toHaveURL(topicUrl);
    await expect(page.locator('.chat__input .ProseMirror')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-android-exits'
    );
    await androidBack(page);
    await expect(page).toHaveURL(/\/dialogs$/);
    expect(errors).toEqual([]);
  });
}

test('Назад последовательно закрывает клавиатуру поиска, пикер и текущий топик', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильное событие Назад');
  await page.addInitScript(() => {
    const viewport = window.visualViewport!;
    const fullHeight = viewport.height;
    let height = fullHeight;
    Object.defineProperty(viewport, 'height', { get: () => height });
    (window as any).setTestKeyboardVisible = (visible: boolean) => {
      height = fullHeight - (visible ? 280 : 0);
      viewport.dispatchEvent(new Event('resize'));
    };
  });
  const { errors } = await openComposer(page);
  const topicUrl = page.url();
  await page.locator('.chat__input .smile-button:visible').tap();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  const search = picker.locator('.v3-search input');
  await search.tap();
  await search.pressSequentially('smile');
  await page.evaluate(() => (window as any).setTestKeyboardVisible(true));
  await androidBack(page);
  await expect(search).not.toBeFocused();
  await expect(search).toHaveValue('smile');
  await expect(picker).toBeVisible();
  await expect(page).toHaveURL(topicUrl);
  await page.evaluate(() => (window as any).setTestKeyboardVisible(false));
  await androidBack(page);
  await expect(picker).toHaveCount(0);
  await expect(page).toHaveURL(topicUrl);
  await androidBack(page);
  await expect(page).toHaveURL(/\/dialogs$/);
  expect(errors).toEqual([]);
});

test('закрытый или удалённый редактор освобождает обработчик Назад пикера', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Мобильное событие Назад');
  await installAndroidBackMock(page);
  await mockStickerCatalog(page);
  await page.goto(
    '/e2e/fixtures/stickers.html?catalog=1&composer=1&sticker-api=/e2e/sticker-api'
  );
  const trigger = page.locator('.chat__input .smile-button:visible');
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  await trigger.tap();
  await expect(picker).toBeVisible();
  await trigger.tap();
  await expect(picker).toHaveCount(0);
  await androidBack(page);
  await expect(page.locator('html')).toHaveAttribute('data-android-exits', '1');
  await trigger.tap();
  await expect(picker).toBeVisible();
  await page.evaluate(() => (window as any).stickerFixture.unmount());
  await androidBack(page);
  await expect(page.locator('html')).toHaveAttribute('data-android-exits', '2');
});
