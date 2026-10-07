import { expect, test, type Page } from '@playwright/test';

const triggerSelector = '.attach-file-button:visible';
const menuSelector = '.attach-file-popover .popover-yui-kit__content:visible';

const measureClosing = (page: Page, label: string) =>
  page.evaluate(
    value =>
      new Promise<{ startY: number; positions: number[] }>(resolve => {
        const menu = [
          ...document.querySelectorAll(
            '.attach-file-popover .popover-yui-kit__content'
          )
        ].find(element => getComputedStyle(element).display !== 'none')!;
        const option = [
          ...menu.querySelectorAll('.popover-yui-kit__options__item')
        ].find(element => element.textContent?.trim() === value)!;
        const startY = menu.getBoundingClientRect().y;
        option.addEventListener(
          'click',
          () => {
            const positions: number[] = [];
            const started = performance.now();
            const record = (time: number) => {
              const style = getComputedStyle(menu);
              if (style.display !== 'none' && Number(style.opacity) > 0) {
                positions.push(menu.getBoundingClientRect().y);
              }
              if (time - started < 350) requestAnimationFrame(record);
              else resolve({ startY, positions });
            };
            requestAnimationFrame(record);
          },
          { once: true }
        );
      }),
    label
  );

const openAndMeasure = async (page: Page) => {
  await page.evaluate(async () => {
    const menu = document.querySelector(
      '.attach-file-popover .popover-yui-kit__content'
    )!;
    const style = getComputedStyle(menu);
    await document.fonts.load(
      `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
      'Фото или видео Файл'
    );
    await document.fonts.ready;
  });
  const positions = page.evaluate(
    () =>
      new Promise<{ x: number; y: number; width: number; height: number }[]>(
        resolve => {
          const button = [
            ...document.querySelectorAll('.attach-file-button')
          ].find(element => element.getClientRects().length > 0)!;
          button.addEventListener(
            'click',
            () => {
              const samples: {
                x: number;
                y: number;
                width: number;
                height: number;
              }[] = [];
              const started = performance.now();
              const record = (time: number) => {
                const menu = button
                  .closest('.popover-yui-kit')!
                  .querySelector('.popover-yui-kit__content')!;
                if (getComputedStyle(menu).display !== 'none') {
                  const { x, y, width, height } = menu.getBoundingClientRect();
                  samples.push({ x, y, width, height });
                }
                if (time - started < 400) requestAnimationFrame(record);
                else resolve(samples);
              };
              // Первый замер — после кадра, в котором меню появилось.
              requestAnimationFrame(() => requestAnimationFrame(record));
            },
            { once: true }
          );
        }
      )
  );
  await page.locator(triggerSelector).click();
  const samples = await positions;
  expect(samples.length).toBeGreaterThan(3);
  const settled = samples.at(-1)!;
  for (const sample of samples) {
    expect(Math.abs(sample.x - settled.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(sample.y - settled.y)).toBeLessThanOrEqual(0.5);
    expect(sample.width).toBe(settled.width);
    expect(sample.height).toBe(settled.height);
  }
  await expect(page.locator(menuSelector)).toBeVisible();
  return settled;
};

for (const anchor of ['bottom', 'top']) {
  test(`меню вложений открывается без смещения, редактор ${anchor}`, async ({
    page
  }) => {
    await page.goto(
      `/e2e/fixtures/content-editor-attachments.html?anchor=${anchor}`
    );
    await expect(page.locator('.tiptap')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const menu = await openAndMeasure(page);
      const button = await page.locator(triggerSelector).boundingBox();
      if (anchor === 'bottom')
        expect(menu.y + menu.height).toBeLessThan(button!.y);
      else expect(menu.y).toBeGreaterThan(button!.y + button!.height);
      await page.locator(triggerSelector).click();
      await expect(page.locator(menuSelector)).toHaveCount(0);
    }
  });
}

test('пункты вложений открывают выбор фото и файлов без изменения черновика', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/content-editor-attachments.html');
  const editor = page.locator('.tiptap');
  await editor.fill('Черновик сообщения');
  for (const label of ['Фото или видео', 'Файл']) {
    await openAndMeasure(page);
    const picker = page.waitForEvent('filechooser');
    const closing = measureClosing(page, label);
    await page.locator(menuSelector).getByText(label, { exact: true }).click();
    const chooser = await picker;
    const { startY, positions } = await closing;
    expect(positions.length).toBeGreaterThan(0);
    for (const y of positions) {
      expect(Math.abs(y - startY)).toBeLessThanOrEqual(0.5);
    }
    expect(chooser.isMultiple()).toBe(true);
    expect(await chooser.element().getAttribute('accept')).toBe(
      label === 'Фото или видео' ? 'image/*,video/*' : null
    );
    await chooser.setFiles([]);
    await expect(page.locator(menuSelector)).toHaveCount(0);
    await expect(editor).toHaveText('Черновик сообщения');
  }
});

test('меню в предпросмотре вложения закрывается без смещения', async ({
  page
}) => {
  test.skip(
    test.info().project.name.includes('mobile'),
    'На телефоне файлы добавляются напрямую'
  );
  await page.goto('/e2e/fixtures/content-editor-attachments.html');
  await openAndMeasure(page);
  const picker = page.waitForEvent('filechooser');
  await page.locator(menuSelector).getByText('Файл', { exact: true }).click();
  await (
    await picker
  ).setFiles({
    name: 'проверка.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Вложение для проверки')
  });
  await expect(page.locator('.attach-modal')).toBeVisible();
  await openAndMeasure(page);
  const extraPicker = page.waitForEvent('filechooser');
  const closing = measureClosing(page, 'Фото или видео');
  await page
    .locator(menuSelector)
    .getByText('Фото или видео', { exact: true })
    .click();
  await (await extraPicker).setFiles([]);
  const { startY, positions } = await closing;
  expect(positions.length).toBeGreaterThan(0);
  for (const y of positions) {
    expect(Math.abs(y - startY)).toBeLessThanOrEqual(0.5);
  }
  await expect(page.locator('.attach-modal')).toBeVisible();
  await expect(page.getByText('проверка', { exact: true })).toBeVisible();
});
