import { expect, test, type Page } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

const editor = (page: Page) =>
  page.locator('.chat__input .ProseMirror[contenteditable="true"]');

const paste = async (page: Page, html: string, text = '') => {
  await editor(page).evaluate(
    (element, clipboard) => {
      if (document.activeElement !== element) (element as HTMLElement).focus();
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', clipboard.html);
      clipboardData.setData('text/plain', clipboard.text);
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true
        })
      );
    },
    { html, text }
  );
};

test.beforeEach(async ({ page }) => {
  await openFixture(page, { count: 0, topicCount: 1 });
  await openTopic(page, 0);
  await expect(editor(page)).toBeVisible();
});

test('HTML вставляется без пустых строк по краям, сохраняя внутреннюю пустую строку и оформление', async ({
  page
}) => {
  await paste(
    page,
    '<p><br></p><p>&nbsp;</p><p><strong>Первая</strong></p><p><br></p><p>Последняя</p><p><br></p><p> </p>'
  );
  await expect(editor(page).locator(':scope > p')).toHaveText([
    'Первая',
    '',
    'Последняя'
  ]);
  await expect(editor(page).locator('strong')).toHaveText('Первая');
});

test('обычный текст вставляется без пустых строк по краям, сохраняя внутренние переносы', async ({
  page
}) => {
  await paste(page, '', '\r\n \r\nПервая\r\n\r\nПоследняя\r\n \r\n');
  await expect(editor(page).locator(':scope > p')).toHaveText([
    'Первая',
    'Последняя'
  ]);
});

test('переносы по краям HTML-обёртки не создают пустые строки', async ({
  page
}) => {
  await paste(
    page,
    '<div><!--StartFragment--><br><span>Первая</span><br><br><span>Последняя</span><br><br><!--EndFragment--></div>'
  );
  await expect(editor(page)).toHaveText('ПерваяПоследняя');
  const html = await editor(page).innerHTML();
  expect(html).toMatch(/^<p>Первая<br><br>Последняя<\/p>$/);
});

test('вставка в середину сообщения не отделяет существующий текст пустыми строками', async ({
  page
}) => {
  await editor(page).fill('До после');
  const paragraph = editor(page).locator('p');
  const cursor = await paragraph.evaluate(element => {
    const text = document
      .createTreeWalker(element, NodeFilter.SHOW_TEXT)
      .nextNode()!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    const textBounds = range.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return {
      x: textBounds.right - bounds.left,
      y: textBounds.top + textBounds.height / 2 - bounds.top
    };
  });
  await paragraph.click({ position: cursor });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.focusOffset))
    .toBe(2);
  await paste(page, '<p><br></p><p>Вставка</p><p><br></p>');
  await expect(editor(page).locator(':scope > p')).toHaveText(
    'ДоВставка после'
  );
});

for (const format of ['text', 'html'] as const) {
  test(`пункт «Вставить» очищает края ${format} из буфера`, async ({
    page
  }) => {
    test.skip(
      !test.info().project.name.includes('mobile'),
      'Собственное меню редактора доступно в мобильной раскладке'
    );
    await page.evaluate(format => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          readText: async () => '\n\nИз меню\n\n',
          ...(format === 'html'
            ? {
                read: async () => [
                  {
                    types: ['text/html'],
                    getType: async () =>
                      new Blob(
                        [
                          '<p><br></p><p><strong>Из меню</strong></p><p><br></p>'
                        ],
                        { type: 'text/html' }
                      )
                  }
                ]
              }
            : {})
        }
      });
    }, format);
    await editor(page).focus();
    await editor(page).dispatchEvent('contextmenu');
    await page
      .getByRole('button', { name: 'Вставить', exact: true })
      .click({ timeout: 5000 });
    await expect(editor(page).locator(':scope > p')).toHaveText(['Из меню']);
    if (format === 'html')
      await expect(editor(page).locator('strong')).toHaveText('Из меню');
  });
}

test('из списка можно выйти двумя Enter без автоматически добавленного абзаца', async ({
  page
}) => {
  await paste(page, '<ul><li><p>Пункт</p></li></ul>');
  await expect(editor(page).locator(':scope > p')).toHaveCount(0);
  await editor(page).press('End');
  await editor(page).press('Enter');
  await editor(page).press('Enter');
  await expect(editor(page).locator(':scope > p')).toHaveCount(1);
  await page.keyboard.insertText('После списка');
  await expect(editor(page).locator(':scope > p')).toHaveText('После списка');
});

test('пустые абзацы вокруг вложенного списка удаляются без изменения пунктов', async ({
  page
}) => {
  await paste(
    page,
    '<p><br></p><ol start="2"><li><p>Первый</p><ul><li><p>Вложенный</p></li></ul></li></ol><p>&nbsp;</p>'
  );
  await expect(editor(page).locator(':scope > p')).toHaveCount(0);
  await expect(editor(page).locator(':scope > ol')).toHaveAttribute(
    'start',
    '2'
  );
  await expect(editor(page).locator('li > p')).toHaveText([
    'Первый',
    'Вложенный'
  ]);
});
