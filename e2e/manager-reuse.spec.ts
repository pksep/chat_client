import { expect, test } from '@playwright/test';

test('shared message surfaces preserve chat DOM, file actions and media loading', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/e2e/fixtures/manager-reuse.html', {
    waitUntil: 'domcontentloaded'
  });
  for (const kind of ['Text', 'File', 'Media']) {
    const article = page.getByTestId(`Manager${kind}-Article`);
    await expect(article).toBeVisible();
    expect(await article.evaluate(el => el.tagName)).toBe('ARTICLE');
    await expect(article).not.toHaveClass(/chat-message-surface/);
  }
  await expect(page.getByTestId('ManagerText-MessageText')).toContainText(
    'Текст сообщения'
  );
  await expect(
    page.getByTestId('ManagerText-MessageText').locator('strong')
  ).toHaveText('сообщения');
  await expect(page.getByTestId('ManagerFile-FileInfo')).toBeVisible();
  await expect(page.getByTestId('ManagerFile-FileName')).toContainText(
    'Требования'
  );
  await expect(page.getByTestId('ManagerFile-FileSize')).toHaveText('1.0 KB');
  await page.getByTestId('ManagerFile-FileContainer').click();
  await expect(page.getByTestId('file-open-count')).toHaveText('1');
  await expect(
    page.getByTestId('ManagerMedia-Article').locator('img').first()
  ).toBeVisible();
  const editor = page
    .getByTestId('default-editor')
    .locator('.editor-content .tiptap');
  await editor.fill('Проверка Enter');
  await editor.press('Enter');
  await expect(page.getByTestId('send-count')).toHaveText('1');
  await page
    .getByTestId('default-editor')
    .locator('.toolbar .attach-file-button')
    .click();
  const choosing = page.waitForEvent('filechooser');
  await page.getByText('Файл', { exact: true }).last().click();
  await (
    await choosing
  ).setFiles({
    name: 'Прежний предпросмотр.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Предпросмотр обычного чата сохраняется')
  });
  await expect(page.locator('.attach-modal-container')).toBeVisible();
  await expect(page.getByTestId('send-count')).toHaveText('1');
  await page.locator('.attach-modal__toolbar .right').click();
  await expect(page.getByTestId('send-count')).toHaveText('2');
  await page.setViewportSize({ width: 418, height: 900 });
  await editor.fill('Перенос на узком экране');
  await editor.press('Enter');
  await expect(editor.locator('p')).toHaveCount(2);
  await expect(page.getByTestId('send-count')).toHaveText('2');
  expect(errors).toEqual([]);
});
