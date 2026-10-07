import { expect, test } from '@playwright/test';

test('text fields, description and search expose language with native spellcheck disabled', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/native-spellcheck.html');

  for (const testid of [
    'Name-Input',
    'Description-Textarea',
    'Query-Dropdown-Input'
  ]) {
    const field = page.getByTestId(testid);
    await expect(field).toHaveAttribute('spellcheck', 'false');
    await expect(field).toHaveAttribute('lang', 'ru');
    await field.fill('Название чата');
    await expect(field).toHaveAttribute('lang', 'ru');
    await field.fill('English text');
    await expect(field).toHaveAttribute('lang', 'en');
    await field.fill('Русский and English');
    await expect(field).toHaveAttribute('lang', 'ru');
    await field.fill('');
    await expect(field).toHaveAttribute('lang', 'ru');
  }

  await expect(page.getByTestId('Address-Input')).toHaveAttribute(
    'spellcheck',
    'false'
  );
  await expect(page.getByTestId('Password-Input')).toHaveAttribute(
    'spellcheck',
    'false'
  );
  await expect(page.getByTestId('ExplicitLanguage-Input')).toHaveAttribute(
    'lang',
    'en'
  );
});

test('local dictionaries underline Russian and English errors even with native spellcheck disabled', async ({
  page
}) => {
  test.setTimeout(60000);
  await page.goto('/e2e/fixtures/native-spellcheck.html');
  for (const testid of [
    'Name-Input',
    'Description-Textarea',
    'Query-Dropdown-Input'
  ]) {
    const field = page.getByTestId(testid);
    const errors = field.locator('..').locator('.yui-spelling-error');
    await field.fill('Привет ашибка праверка hello mispelled sentense');
    await expect(errors).toHaveText(
      ['ашибка', 'праверка', 'mispelled', 'sentense'],
      { timeout: 15000 }
    );
    await expect(errors.first()).toHaveCSS('text-decoration-style', 'wavy');
    await expect(field).toHaveValue(
      'Привет ашибка праверка hello mispelled sentense'
    );
    await field.fill(
      'Привет сообщение сообщения сообщением hello message messages ок Ок ОК ok Ok OK mispelled'
    );
    await expect(errors).toHaveText(['mispelled']);
    await field.fill(
      'https://mispelled.example/ашибка test@mispelled.example @mispelled #ашибка ID123 test_id mispelled'
    );
    await expect(errors).toHaveText(['mispelled']);
    await field.fill('');
    await expect(
      field.locator('..').locator('.yui-spellcheck-mirror')
    ).toHaveText('');
  }
  for (const testid of ['Address-Input', 'Password-Input']) {
    const field = page.getByTestId(testid);
    await field.fill('ашибка mispelled');
    await expect(
      field.locator('..').locator('.yui-spellcheck-mirror')
    ).toHaveText('');
  }
});
