import { expect, test, type Page } from '@playwright/test';
import type { Editor } from '@tiptap/core';

declare global {
  interface Window {
    colorHarness: { editor: Editor; sent: string };
    colorClipboard: { html: string; text: string };
  }
}

const editor = (page: Page) => page.locator('.tiptap');

const pasteHtml = async (page: Page, html: string) => {
  await editor(page).evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', value);
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true })
    );
  }, html);
};

const copyMessage = (page: Page, partial = false) =>
  page.locator('#message').evaluate((element, selectPartial) => {
    const range = document.createRange();
    if (selectPartial) {
      const text = element.querySelector('span')!.firstChild!;
      range.setStart(text, 1);
      range.setEnd(text, 4);
    } else {
      range.selectNodeContents(element);
    }
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const clipboardData = new DataTransfer();
    element.dispatchEvent(
      new ClipboardEvent('copy', { clipboardData, bubbles: true })
    );
    selection.removeAllRanges();
    return clipboardData.getData('text/html');
  }, partial);

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/content-editor-colors.html');
  await expect(editor(page)).toBeVisible();
  await page.waitForFunction(() => !!window.colorHarness?.editor);
});

test('formatting toolbar stays hidden after selecting all and deleting the text', async ({
  page
}) => {
  await editor(page).fill('Текст для удаления');
  await editor(page).press('Control+a');
  if (test.info().project.name.includes('mobile')) {
    await editor(page).dispatchEvent('contextmenu');
  }
  await expect(page.locator('.formatting-toolbar')).toBeVisible();
  await editor(page).press('Backspace');
  await expect(editor(page)).toHaveText('');
  await expect(page.locator('.formatting-toolbar')).toBeHidden();
  await editor(page).press('Delete');
  await expect(page.locator('.formatting-toolbar')).toBeHidden();

  await editor(page).fill('Новый текст');
  await editor(page).press('Control+a');
  if (test.info().project.name.includes('mobile')) {
    await editor(page).dispatchEvent('contextmenu');
  }
  await expect(page.locator('.formatting-toolbar')).toBeVisible();
});

test('native spellchecking prefers Russian and switches to English without changing message HTML', async ({
  page
}) => {
  await expect(editor(page)).toHaveAttribute('spellcheck', 'true');
  await expect(editor(page)).toHaveAttribute('lang', 'ru');
  await editor(page).fill('Русский текст');
  await expect(editor(page)).toHaveAttribute('lang', 'ru');
  await editor(page).fill('English text');
  await expect(editor(page)).toHaveAttribute('lang', 'en');
  await editor(page).fill('Русский and English');
  await expect(editor(page)).toHaveAttribute('lang', 'ru');
  expect(await page.locator('#draft').textContent()).not.toMatch(
    /spellcheck|lang=/
  );
  await editor(page).press('Control+a');
  await editor(page).press('Backspace');
  await expect(editor(page)).toHaveAttribute('lang', 'ru');
});

test('selected text and background colors survive sending and partial copying', async ({
  page
}) => {
  await editor(page).fill('Красный');
  await page.evaluate(() =>
    window.colorHarness.editor.chain().focus().selectAll().run()
  );
  const toolbar = page.locator('.formatting-toolbar');
  if (test.info().project.name.includes('mobile')) {
    await editor(page).dispatchEvent('contextmenu');
    await toolbar
      .getByRole('button', { name: 'Форматирование', exact: true })
      .click();
  }
  await toolbar.locator('button[aria-label="Цвет текста"]').click();
  await page
    .getByRole('button', { name: 'Цвет текста: Красный', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Цвет фона: Жёлтый', exact: true })
    .click();
  await expect(page.locator('#draft')).toContainText(
    'data-yui-color="#ff6868"'
  );
  await expect(page.locator('#draft')).toContainText(
    'data-yui-background-color="#ffcc00"'
  );
  await page.evaluate(() =>
    window.colorHarness.editor.chain().focus().setTextSelection(8).run()
  );
  await editor(page).press('Enter');
  await expect(page.locator('#message')).toHaveText('Красный');
  const html = await copyMessage(page, true);
  expect(html).toContain('data-yui-color="#ff6868"');
  expect(html).toContain('data-yui-background-color="#ffcc00"');
  await pasteHtml(page, html);
  await expect(editor(page)).toHaveText('рас');
  await expect(editor(page).locator('span')).toHaveCSS(
    'color',
    'rgb(255, 104, 104)'
  );
  await expect(editor(page).locator('span')).toHaveCSS(
    'background-color',
    'rgb(255, 204, 0)'
  );
});

test('external colors are removed while other formatting is preserved', async ({
  page
}) => {
  await pasteHtml(
    page,
    '<p style="color:#ff6868;background:#ffcc00"><font color="#57d278"><span style="color:#ff6868;background-color:#ffcc00"><strong>Внешний</strong></span></font> <a href="https://example.com">ссылка</a></p>'
  );
  await expect(editor(page).locator('strong')).toHaveText('Внешний');
  await expect(editor(page).locator('a')).toHaveAttribute(
    'href',
    'https://example.com'
  );
  const html = await page.locator('#draft').textContent();
  expect(html).not.toMatch(/data-yui-|color:/);
  await expect(editor(page).locator('strong')).toHaveCSS(
    'color',
    'rgb(24, 24, 24)'
  );
});

test('markers are validated independently and override browser clipboard styles', async ({
  page
}) => {
  await pasteHtml(
    page,
    '<p><span data-yui-color="#ff6868" style="color:#181818;background:#ffcc00">Текст</span> <span data-yui-background-color="#ffcc00" style="color:#ff6868">Фон</span> <span data-yui-color="red" data-yui-background-color="var(--text-primary)" style="color:red;background-color:#ffcc00">Неверный</span></p>'
  );
  const text = editor(page)
    .locator('span')
    .filter({ hasText: /^Текст$/ });
  const background = editor(page).locator('span').filter({ hasText: /^Фон$/ });
  await expect(text).toHaveAttribute('data-yui-color', '#ff6868');
  await expect(text).not.toHaveAttribute('data-yui-background-color');
  await expect(background).toHaveAttribute(
    'data-yui-background-color',
    '#ffcc00'
  );
  await expect(background).not.toHaveAttribute('data-yui-color');
  const html = await page.locator('#draft').textContent();
  expect(html).not.toContain('data-yui-color="red"');
  expect(html).not.toContain('data-yui-background-color="var(--text-primary)"');
});

test('default color follows the theme after copying and explicit colors stay fixed', async ({
  page
}) => {
  await editor(page).fill('Тема');
  await page.evaluate(() =>
    window.colorHarness.editor.chain().focus().selectAll().run()
  );
  const toolbar = page.locator('.formatting-toolbar');
  if (test.info().project.name.includes('mobile')) {
    await editor(page).dispatchEvent('contextmenu');
    await toolbar
      .getByRole('button', { name: 'Форматирование', exact: true })
      .click();
  }
  await toolbar.locator('button[aria-label="Цвет текста"]').click();
  await page
    .getByRole('button', { name: 'Цвет текста: По умолчанию', exact: true })
    .click();
  await expect(editor(page).locator('span')).toHaveAttribute(
    'data-yui-color',
    'var(--text-primary)'
  );
  await page.evaluate(() =>
    window.colorHarness.editor.chain().focus().setTextSelection(5).run()
  );
  await editor(page).press('Enter');
  const html = await copyMessage(page);
  await page.evaluate(() => document.body.classList.add('dark'));
  await expect(page.locator('#message span')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)'
  );
  await pasteHtml(page, html);
  await expect(editor(page).locator('span')).toHaveCSS(
    'color',
    'rgb(255, 255, 255)'
  );
  await page.evaluate(() => document.body.classList.remove('dark'));
  await expect(editor(page).locator('span')).toHaveCSS(
    'color',
    'rgb(24, 24, 24)'
  );
  await page.evaluate(() =>
    window.colorHarness.editor.chain().selectAll().setColor('#ff6868').run()
  );
  await page.evaluate(() => document.body.classList.add('dark'));
  await expect(editor(page).locator('span')).toHaveCSS(
    'color',
    'rgb(255, 104, 104)'
  );
});

test('old drafts keep their colors when opened, but unmarked copied HTML does not import them', async ({
  page
}) => {
  await page.evaluate(() =>
    window.colorHarness.editor.commands.setContent(
      '<p><span style="color:#57d278"><span style="background-color:#ffcc00">Старый</span></span></p>'
    )
  );
  await expect(editor(page).locator('span')).toHaveCSS(
    'color',
    'rgb(87, 210, 120)'
  );
  await expect(editor(page).locator('span')).toHaveCSS(
    'background-color',
    'rgb(255, 204, 0)'
  );
  await page.evaluate(() => window.colorHarness.editor.commands.clearContent());
  await pasteHtml(page, '<span style="color:#57d278">Скопированный</span>');
  expect(await page.locator('#draft').textContent()).not.toMatch(
    /data-yui-|color:/
  );
});

test('mobile clipboard actions preserve marked colors and remove external colors', async ({
  page
}) => {
  test.skip(!test.info().project.name.includes('mobile'));
  await page.evaluate(() => {
    window.colorClipboard = { html: '', text: '' };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => window.colorClipboard.text,
        read: async () => [
          new ClipboardItem({
            'text/html': new Blob([window.colorClipboard.html], {
              type: 'text/html'
            })
          })
        ],
        write: async (items: ClipboardItem[]) => {
          window.colorClipboard.html = await (
            await items[0].getType('text/html')
          ).text();
          window.colorClipboard.text = await (
            await items[0].getType('text/plain')
          ).text();
        }
      }
    });
    window.colorHarness.editor
      .chain()
      .setContent('<p>Буфер</p>')
      .focus()
      .selectAll()
      .setColor('#ff6868')
      .setBackgroundColor('#ffcc00')
      .run();
  });
  await editor(page).dispatchEvent('contextmenu');
  await page.getByRole('button', { name: 'Скопировать', exact: true }).click();
  expect(await page.evaluate(() => window.colorClipboard.html)).toContain(
    'data-yui-color="#ff6868"'
  );

  await page.evaluate(() => window.colorHarness.editor.commands.clearContent());
  await editor(page).dispatchEvent('contextmenu');
  await expect(
    page.getByRole('button', { name: 'Форматирование', exact: true })
  ).toBeHidden();
  await page.getByRole('button', { name: 'Вставить', exact: true }).click();
  await expect(editor(page)).toHaveText('Буфер');
  await expect(editor(page).locator('span')).toHaveAttribute(
    'data-yui-background-color',
    '#ffcc00'
  );

  await page.evaluate(() => {
    window.colorClipboard.html =
      '<span style="color:#ff6868;background-color:#ffcc00">Внешний</span>';
    window.colorClipboard.text = 'Внешний';
    window.colorHarness.editor.commands.clearContent();
  });
  await editor(page).dispatchEvent('contextmenu');
  await page.getByRole('button', { name: 'Вставить', exact: true }).click();
  await expect(editor(page)).toHaveText('Внешний');
  expect(await page.locator('#draft').textContent()).not.toMatch(
    /data-yui-|color:/
  );
});

test('sanitizer keeps only valid color markers and preserves legacy rendering', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const path = '/src/utils/sanitizeMessageHtml.ts';
    const { sanitizeMessageHtml } = await import(path);
    return {
      marked: sanitizeMessageHtml(
        '<span data-yui-color="var(--text-primary)" data-yui-background-color="#ffcc00" style="color:#181818;position:fixed" onclick="alert(1)">Тема</span>'
      ),
      invalid: sanitizeMessageHtml(
        '<p data-yui-color="#ff6868">Блок</p><span data-yui-color="url(javascript:alert(1))" data-yui-background-color="var(--text-primary)">Неверный</span>'
      ),
      legacy: sanitizeMessageHtml('<span style="color:#57d278">Старый</span>')
    };
  });
  expect(result.marked).toContain('data-yui-color="var(--text-primary)"');
  expect(result.marked).toContain('data-yui-background-color="#ffcc00"');
  expect(result.marked).not.toMatch(/position|onclick/);
  expect(result.invalid).not.toContain('data-yui-');
  expect(result.legacy).toContain('color: rgb(87, 210, 120)');
  expect(result.legacy).not.toContain('data-yui-');
});
