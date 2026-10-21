import { expect, test } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  await openFixture(page, { count: 2, shell: true });
  await openTopic(page, 0);
  await expect(
    page.locator('[data-message-id="performance-0-message-1"]')
  ).toBeVisible();
});

test('двойной клик по свободной строке сообщения открывает ответ', async ({
  page
}) => {
  const message = page.locator('[data-message-id="performance-0-message-1"]');
  const box = (await message.boundingBox())!;
  await message.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator('.chat__input__action__blog p')).toHaveText(
    'Сообщение 1 в performance-0'
  );
});

test('двойной клик по отступу пузыря открывает ответ, а по тексту выделяет слово', async ({
  page
}) => {
  const message = page.locator('[data-message-id="performance-0-message-1"]');
  await message.locator('.message-content__html').dblclick();
  await expect(page.locator('.chat__input__action')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.getSelection()?.toString())
  ).toBeTruthy();
  await message
    .locator('.message__article')
    .dblclick({ position: { x: 4, y: 4 } });
  await expect(page.locator('.chat__input__action__blog p')).toHaveText(
    'Сообщение 1 в performance-0'
  );
});

test('двойной клик по своему сообщению в диалоге тоже открывает ответ', async ({
  page
}) => {
  const id = await page.evaluate(() => {
    const fixture = (window as any).topicPerformance;
    return fixture.appendOwnMessage('performance-0').id;
  });
  const message = page.locator(`[data-message-id="${id}"]`);
  await expect(message).toBeVisible();
  const box = (await message.boundingBox())!;
  await message.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator('.chat__input__action__blog p')).toHaveText(
    'Локальное сообщение для проверки реакции'
  );
  await expect(message.locator('.message__reply-button')).toHaveCount(0);
});

for (const type of ['IMAGE', 'FILE']) {
  test(`двойной клик по вложению ${type} не открывает ответ`, async ({
    page
  }) => {
    const row = {
      ...makeMessages('performance-0', 1)[0],
      text: '',
      media: [
        {
          id: 'attachment',
          path: 'attachment.png',
          originName: 'attachment.png',
          size: 100,
          type,
          ex: { width: 64, height: 64 }
        }
      ]
    };
    await page.evaluate(
      row => (window as any).topicPerformance.seed('performance-0', [row]),
      row
    );
    const message = page.locator('[data-message-id="performance-0-message-0"]');
    const attachment = message.locator(
      type === 'IMAGE' ? '.message-content--media' : '.message-content__file'
    );
    await expect(attachment).toBeVisible();
    // Проверяем всплытие dblclick отдельно от открытия просмотрщика по первому click.
    await attachment.dispatchEvent('dblclick');
    if (type === 'IMAGE')
      await attachment.locator('img').dispatchEvent('dblclick');
    await expect(page.locator('.chat__input__action')).toHaveCount(0);
  });
}
