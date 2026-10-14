import { expect, test } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

test('мобильный пикер открывается и вставляет эмодзи без клавиатуры, прямой тап разрешает ввод', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile');
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('inputmode', 'none');
  await editor.tap();
  await expect(editor).toBeFocused();
  await expect(editor).not.toHaveAttribute('inputmode', 'none');
  await editor.pressSequentially('Черновик ');
  await page.locator('.chat__input .smile-button:visible').tap();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  await expect(picker).toBeVisible();
  await expect(editor).not.toBeFocused();
  await expect(editor).toHaveAttribute('inputmode', 'none');
  await picker.locator('.v3-emojis button:visible').first().tap();
  await expect(editor).not.toHaveText('Черновик');
  await expect(editor).toContainText('Черновик');
  await expect(editor).toHaveAttribute('inputmode', 'none');
  await editor.tap();
  await expect(editor).toBeFocused();
  await expect(editor).not.toHaveAttribute('inputmode', 'none');
  await expect(picker).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('поиск сохраняет фокус при выборе категории, эмодзи и нажатии рядом', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile');
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible();
  await page.locator('.chat__input .smile-button:visible').tap();
  const picker = page.locator('.chat__input .emoji-picker--open:visible');
  const search = picker.locator('.v3-search input');
  await search.tap();
  await expect(search).toBeFocused();
  await search.pressSequentially('smile');
  await expect(search).toHaveValue('smile');
  await picker.locator('.v3-emojis button:visible').first().tap();
  await expect(search).toBeFocused();
  await expect(editor).toHaveAttribute('inputmode', 'none');
  await search.fill('');
  await picker.locator('.v3-groups button:visible').last().tap();
  await expect(search).toBeFocused();
  await page.evaluate(() => {
    const outside = document.createElement('div');
    outside.dataset.testid = 'KeyboardOutside';
    outside.style.cssText =
      'position:fixed;top:25px;right:0;width:40px;height:20px;z-index:1000';
    outside.tabIndex = 0;
    outside.textContent = 'Чат';
    document.body.append(outside);
  });
  await page.getByTestId('KeyboardOutside').tap();
  await expect(search).toBeFocused();
  expect(errors).toEqual([]);
});

test('десктоп сохраняет обычный фокус редактора при выборе эмодзи', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible();
  await page.locator('.chat__input .smile-button:visible').click();
  await page
    .locator('.chat__input .emoji-picker--open .v3-emojis button:visible')
    .first()
    .click();
  await expect(editor).toBeFocused();
  await expect(editor).not.toHaveAttribute('inputmode', 'none');
  expect(errors).toEqual([]);
});
