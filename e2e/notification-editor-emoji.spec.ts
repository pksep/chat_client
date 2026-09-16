import { expect, test } from '@playwright/test';
import { message, openFixture } from './fixtures/topic-performance-page';

test('панель эмодзи создаётся при первом открытии и вставляет эмодзи после повторного открытия', async ({
  page
}) => {
  const { errors } = await openFixture(page);
  await page.evaluate(() =>
    (window as any).topicPerformance.notify(1, 'performance-1-message-19')
  );
  await expect(message(page, 1)).toBeVisible();
  await expect(page.locator('.v3-emoji-picker')).toHaveCount(0);
  const trigger = page
    .locator('.editor-component .smile-button:visible')
    .first();
  await trigger.click();
  const picker = page.locator('.emoji-picker--open .v3-emoji-picker:visible');
  await expect(picker).toBeVisible();
  const emoji = picker.locator('.v3-emojis button:visible').first();
  const text = (await emoji.innerText()).trim();
  await emoji.click();
  const input = page.locator('.editor-content .ProseMirror:visible');
  await expect(input).toContainText(text);
  await page
    .locator('[data-testid$="-MessageList-UserMessagesWrapper"]')
    .click({ position: { x: 8, y: 8 } });
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.v3-emoji-picker')).toHaveCount(1);
  await trigger.click();
  await expect(picker).toBeVisible();
  await picker.locator('.v3-emojis button:visible').first().click();
  await expect(input).not.toBeEmpty();
  expect(errors).toEqual([]);
});
