import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const userId = '8e0ab563-5f70-4810-8010-f3338a18a11c';
const label = '@Фамилия И. О. ';
const mention = `<span class="link" data-user-id="${userId}" data-span="">${label}</span>`;
const editor = (page: Page) =>
  page.locator('.chat__input .ProseMirror[contenteditable="true"]');

const paste = async (page: Page, html: string, text = '') => {
  await editor(page).focus();
  await editor(page).evaluate(
    (element, clipboard) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', clipboard.html);
      clipboardData.setData('text/plain', clipboard.text);
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          composed: true,
          cancelable: true
        })
      );
    },
    { html, text }
  );
};

const copySelection = (page: Page, selector: string) =>
  page.locator(selector).evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboardData = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent('copy', {
        clipboardData,
        bubbles: true,
        cancelable: true
      })
    );
    selection.removeAllRanges();
    return {
      html: clipboardData.getData('text/html'),
      text: clipboardData.getData('text/plain')
    };
  });

test.beforeEach(async ({ page }) => {
  await openFixture(page, { count: 0, topicCount: 2 });
  await openTopic(page, 0);
  await expect(editor(page)).toBeVisible();
});

test('копирование сообщения сохраняет имя, перенос строки и ID упоминания при отправке', async ({
  page
}) => {
  const message = {
    ...makeMessages('performance-0', 1)[0],
    text: `<p>${mention}<br>test</p>`,
    taggedUserIds: [userId]
  };
  await page.evaluate(
    message =>
      (window as any).topicPerformance.seed('performance-0', [message]),
    message
  );
  const source =
    '[data-message-id="performance-0-message-0"] .message-content__html';
  await expect(page.locator(source)).toContainText(label.trim());
  const clipboard = await copySelection(page, source);
  expect(clipboard.html).toContain('data-span');
  expect(clipboard.html).not.toContain('content=');
  await paste(page, clipboard.html, clipboard.text);
  await expect(editor(page).locator('[data-span]')).toHaveText(label.trim());
  await expect(editor(page).locator('[data-span]')).toHaveAttribute(
    'data-user-id',
    userId
  );
  await expect(editor(page).locator('br')).toHaveCount(1);
  await expect(editor(page)).toContainText('test');

  await page.locator('.chat__input .toolbar-button.right:visible').click();
  const sentMessages = () =>
    page.evaluate(() =>
      (window as any).topicPerformance.messages
        .getFullMessagesByTopicId('performance-0')
        .filter((row: { id: string }) => !row.id.startsWith('performance-'))
    );
  await expect.poll(async () => (await sentMessages()).length).toBe(1);
  const [payload] = await sentMessages();
  expect(payload.taggedUserIds).toEqual([userId]);
  expect(payload.text).toContain(label);
  expect(payload.text).toContain('<br>test');
});

test('упоминание без дополнительного текста не становится пустым', async ({
  page
}) => {
  await paste(page, mention, label);
  await expect(editor(page).locator('[data-span]')).toHaveText(label.trim());
  await expect(
    page.locator('.chat__input .toolbar-button.right:visible')
  ).toBeEnabled();
});

test('повторная вставка HTML редактора и открытие черновика сохраняют упоминание', async ({
  page
}) => {
  await paste(page, `<p>${mention}<br><strong>test</strong></p>`);
  const html = await editor(page).innerHTML();
  expect(html).toContain(label);
  await editor(page).fill('');
  await paste(page, html);
  await expect(editor(page).locator('[data-span]')).toHaveText(label.trim());
  await expect(editor(page).locator('strong')).toHaveText('test');

  await openTopic(page, 1);
  await expect(editor(page)).toHaveText('');
  await openTopic(page, 0);
  await expect(editor(page).locator('[data-span]')).toHaveText(label.trim());
  await expect(editor(page).locator('[data-span]')).toHaveAttribute(
    'data-user-id',
    userId
  );
  await expect(editor(page).locator('strong')).toHaveText('test');
});

test('имя берётся из видимого текста, а обычный текст и форматирование сохраняются', async ({
  page
}) => {
  await paste(
    page,
    `<p><span data-span="" data-user-id="${userId}" content="Старое имя">${label}</span> <em>test</em> <a href="https://example.com">ссылка</a></p>`
  );
  await expect(editor(page).locator('[data-span]')).toHaveText(label.trim());
  await expect(editor(page).locator('em')).toHaveText('test');
  await expect(editor(page).locator('a')).toHaveAttribute(
    'href',
    'https://example.com'
  );
  await editor(page).fill('');
  await paste(page, '', '@Фамилия И. О.\ntest');
  await expect(editor(page)).toContainText('@Фамилия И. О.');
  await expect(editor(page)).toContainText('test');
  await expect(editor(page).locator('[data-span]')).toHaveCount(0);
});
