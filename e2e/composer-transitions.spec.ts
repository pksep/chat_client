import { expect, test } from '@playwright/test';
import { openFixture, openTopic } from './fixtures/topic-performance-page';

test('смена топика сохраняет редактор и кнопки, разделяя черновики и отмену ввода', async ({
  page
}) => {
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input .ProseMirror');
  await expect(editor).toBeVisible();
  await editor.fill('Черновик первого топика');
  await editor.press('End');
  await editor.pressSequentially(' с дополнением');
  const samples = await page.evaluate(async () => {
    const editor = document.querySelector('.chat__input .ProseMirror');
    const buttons = [
      ...document.querySelectorAll('.chat__input .toolbar button')
    ];
    const samples: {
      sameEditor: boolean;
      buttonsVisible: boolean;
      booting: boolean;
    }[] = [];
    (window as any).topicPerformance.navigate('performance-1');
    for (let index = 0; index < 20; index++) {
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      samples.push({
        sameEditor:
          editor === document.querySelector('.chat__input .ProseMirror'),
        buttonsVisible: buttons.every(
          button =>
            button.isConnected &&
            getComputedStyle(button).visibility !== 'hidden'
        ),
        booting: !!document.querySelector('.chat__input--booting')
      });
    }
    return samples;
  });
  expect(
    samples.every(
      sample => sample.sameEditor && sample.buttonsVisible && !sample.booting
    )
  ).toBe(true);
  await expect(editor).toHaveText('');
  await editor.fill('Второй черновик');
  await editor.press('ControlOrMeta+z');
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Черновик первого топика');
  await openTopic(page, 0);
  await expect(editor).toHaveText('Черновик первого топика с дополнением');
  await openTopic(page, 1);
  await editor.press('ControlOrMeta+z');
  await expect(editor).not.toContainText('Черновик первого топика');
  expect(errors).toEqual([]);
});

test('вложения сохраняются только в черновике своего топика', async ({
  page
}) => {
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  const fileInput = page
    .locator('.chat__input input[type="file"]:not([accept])')
    .first();
  const modal = page.locator('dialog.attach-modal-container');
  await fileInput.setInputFiles({
    name: 'первый-топик.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Первое вложение')
  });
  await expect(modal).toBeVisible();
  await page.evaluate(() =>
    (window as any).topicPerformance.navigate('performance-1')
  );
  await expect(modal).toHaveCount(0);
  await fileInput.setInputFiles({
    name: 'второй-топик.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Второе вложение')
  });
  await expect(modal).toBeVisible();
  for (const index of [0, 1]) {
    await page.evaluate(
      index =>
        (window as any).topicPerformance.navigate(`performance-${index}`),
      index
    );
    await expect(modal).toBeVisible();
    await expect(
      modal.getByText(index === 0 ? 'первый-топик.txt' : 'второй-топик.txt', {
        exact: true
      })
    ).toBeVisible();
    await expect(
      modal.getByText(index === 0 ? 'второй-топик.txt' : 'первый-топик.txt', {
        exact: true
      })
    ).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('категории эмодзи сохраняют позиции и вкладка стикеров остаётся готовой между открытиями', async ({
  page
}) => {
  const { errors } = await openFixture(page, { shell: true, count: 2 });
  await openTopic(page, 0);
  await expect(page.locator('.chat__input .ProseMirror')).toBeVisible();
  const smile = page.locator('.chat__input .smile-button:visible');
  await smile.click();
  const groups = page.locator('.emoji-picker--open .v3-groups');
  await expect(groups.locator('.sticker-picker__tab')).toBeVisible();
  const positions = await groups.evaluate(element => {
    const origin = element.getBoundingClientRect().x;
    return [...element.querySelectorAll('button')].map(button => ({
      label:
        button.getAttribute('aria-label') ||
        button.querySelector('[title]')?.getAttribute('title'),
      x: Math.round(button.getBoundingClientRect().x - origin)
    }));
  });
  const visualOrder = [...positions].sort(
    (first, second) => first.x - second.x
  );
  expect(visualOrder[0].label).toBe('Недавние');
  expect(visualOrder[1].label).toBe('Стикеры');
  await smile.click();
  await expect(page.locator('.chat__input .sticker-picker__tab')).toHaveCount(
    1
  );
  for (let index = 0; index < 3; index++) {
    await smile.click();
    await expect(groups).toBeVisible();
    expect(
      await groups.evaluate(element => {
        const origin = element.getBoundingClientRect().x;
        return [...element.querySelectorAll('button')].map(button => ({
          label:
            button.getAttribute('aria-label') ||
            button.querySelector('[title]')?.getAttribute('title'),
          x: Math.round(button.getBoundingClientRect().x - origin)
        }));
      })
    ).toEqual(positions);
    await smile.click();
  }
  expect(errors).toEqual([]);
});
