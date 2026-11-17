import { expect, test, type Page } from '@playwright/test';
import {
  makeMessages,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

const bulletList =
  '<ul><li><p>Первый</p></li><li><p>Второй</p><ul><li><p>Вложенный</p><ul><li><p>Глубже</p><ul><li><p>Последний</p></li></ul></li></ul></li></ul></li></ul>';
const numberedList =
  '<ol><li><p>Первый</p><ol start="2"><li><p>Второй</p><ol start="3"><li><p>Третий</p><ol start="4"><li><p>Четвёртый</p></li></ol></li></ol></li></ol></li></ol>';
const editor = (page: Page) =>
  page.locator('.chat__input .ProseMirror[contenteditable="true"]');

test.beforeEach(async ({ page }) => {
  await openFixture(page, { count: 0, topicCount: 1 });
  await openTopic(page, 0);
  await expect(editor(page)).toBeVisible();
  await expect(
    page.getByText('Сообщений пока нет', { exact: true })
  ).toBeVisible();
});

test('вложенные списки сохраняют точки и начальные номера каждого уровня', async ({
  page
}) => {
  const rows = makeMessages('performance-0', 3).map((row, index) => ({
    ...row,
    text: [
      bulletList,
      numberedList,
      '<ol start="7"><li><p>Седьмой</p></li><li><p>Восьмой</p></li></ol><p>Между списками</p><ol><li><p>Снова первый</p></li></ol>'
    ][index]
  }));
  await page.evaluate(
    rows => (window as any).topicPerformance.seed('performance-0', rows),
    rows
  );
  const html = page.locator('.message-content__html');
  await expect(html).toHaveCount(3);
  for (const list of await html.locator('ul, ol').all()) {
    await expect(list).toHaveCSS('display', 'block');
    await expect(list).toHaveCSS(
      'list-style-type',
      (await list.evaluate(element => element.tagName)) === 'UL'
        ? 'disc'
        : 'decimal'
    );
  }
  await expect(html.nth(1).locator('ol')).toHaveCount(4);
  expect(
    await html
      .nth(1)
      .locator('ol')
      .evaluateAll(lists => lists.map(list => (list as HTMLOListElement).start))
  ).toEqual([1, 2, 3, 4]);
  expect(
    await html
      .nth(2)
      .locator('ol')
      .evaluateAll(lists => lists.map(list => (list as HTMLOListElement).start))
  ).toEqual([7, 1]);
  for (const item of await html.locator('li').all()) {
    await expect(item).toHaveCSS('display', 'list-item');
  }
  const accessibility = await page.context().newCDPSession(page);
  const { nodes } = await accessibility.send('Accessibility.getFullAXTree');
  const nodesById = new Map(nodes.map(node => [node.nodeId, node]));
  const markers = (nodeId: string): string[] => {
    const node = nodesById.get(nodeId)!;
    return [
      ...(node.role?.value === 'ListMarker' ? [node.name?.value?.trim()] : []),
      ...(node.childIds || []).flatMap(markers)
    ];
  };
  expect(markers(nodes[0].nodeId)).toEqual([
    '•',
    '•',
    '•',
    '•',
    '•',
    '1.',
    '2.',
    '3.',
    '4.',
    '7.',
    '8.',
    '1.'
  ]);
  await accessibility.detach();
  await page.screenshot({ path: test.info().outputPath('message-lists.png') });
});

test('редактор не добавляет пустые строки вокруг вложенных списков и сохраняет курсор при вводе', async ({
  page
}) => {
  await editor(page).focus();
  await editor(page).evaluate((element, html) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', html);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData,
        bubbles: true,
        cancelable: true
      })
    );
  }, `<p>До списка</p>${bulletList}<p>После списка</p>`);
  const paragraphs = editor(page).locator('p');
  await expect(paragraphs).toHaveCount(7);
  const boxes = await paragraphs.evaluateAll(elements =>
    elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    })
  );
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index].top - boxes[index - 1].bottom).toBeLessThanOrEqual(4);
    expect(boxes[index].height).toBeGreaterThan(14);
  }
  const last = paragraphs.nth(5);
  const bounds = await last.boundingBox();
  expect(bounds).not.toBeNull();
  await last.click({ position: { x: 2, y: bounds!.height / 2 } });
  await editor(page).press('Home');
  await page.keyboard.insertText('Начало ');
  await expect(last).toHaveText('Начало Последний');
  await editor(page).press('End');
  await page.keyboard.insertText(' конец');
  await expect(last).toHaveText('Начало Последний конец');
  await expect(editor(page).locator('ul')).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath('editor-lists.png') });
});
