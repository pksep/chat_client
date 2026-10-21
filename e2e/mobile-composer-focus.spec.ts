import { expect, test } from '@playwright/test';
import {
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

test('нажатия на сообщения сохраняют фокус, текст и курсор мобильного редактора', async ({
  page,
  isMobile
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input [contenteditable="true"]');
  await editor.fill('Черновик сообщения');
  await editor.evaluate(element => {
    window.getSelection()!.collapse(element.querySelector('p')!.firstChild, 3);
  });
  const caret = () =>
    editor.evaluate(() => {
      const selection = window.getSelection()!;
      return [
        selection.anchorNode?.textContent,
        selection.anchorOffset,
        selection.focusOffset
      ];
    });
  const originalCaret = await caret();
  const text = message(page, 0).locator('.message-content__html');

  if (isMobile) await text.tap();
  else await text.click();

  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Черновик сообщения');
  expect(await caret()).toEqual(originalCaret);
  await page.keyboard.insertText('!');
  await expect(editor).toHaveText('Чер!новик сообщения');
  expect(errors).toEqual([]);
});

test('действия сообщений работают при открытом мобильном редакторе', async ({
  page
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { requests, errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input [contenteditable="true"]');
  await editor.fill('Черновик');
  await message(page, 0).locator('.message-content__html').dblclick();
  await expect
    .poll(() => requests.filter(request => request.endsWith('/reactions')))
    .toHaveLength(1);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveText('Черновик');

  // После явного закрытия редактора сообщения не должны возвращать фокус.
  await editor.evaluate(element => (element as HTMLElement).blur());
  await message(page, 0).locator('.message-content__html').click();
  await expect(editor).not.toBeFocused();
  expect(errors).toEqual([]);
});

test('фокус мобильного редактора сохраняется внутри Shadow DOM', async ({
  page,
  isMobile
}) => {
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    document
      .querySelectorAll('style, link[rel="stylesheet"]')
      .forEach(style => {
        root.append(style.cloneNode(true));
      });
    root.append(document.querySelector('#app')!);
  });
  const editor = page.locator('.chat__input [contenteditable="true"]');
  await editor.fill('Черновик');
  const text = message(page, 0).locator('.message-content__html');
  if (isMobile) await text.tap();
  else await text.click();
  await expect(editor).toBeFocused();
  expect(errors).toEqual([]);
});

test('мобильная прокрутка сообщений сохраняет фокус редактора', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка настоящих touch-событий Chromium');
  await page.setViewportSize({ width: 392, height: 832 });
  const { errors } = await openFixture(page, { shell: true, count: 100 });
  await openTopic(page, 0);
  const wrapper = page.locator('.chat__message-wrapper');
  const editor = page.locator('.chat__input [contenteditable="true"]');
  await editor.fill('Черновик');
  const scrollTop = await wrapper.evaluate(element => element.scrollTop);
  const box = (await wrapper.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 3);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }]
  });
  for (const distance of [30, 70, 120, 180]) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + distance }]
    });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await expect
    .poll(() => wrapper.evaluate(element => element.scrollTop))
    .toBeLessThan(scrollTop - 30);
  await expect(editor).toBeFocused();
  expect(errors).toEqual([]);
});

test('на компьютере нажатие на сообщение снимает фокус как обычно', async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { errors } = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  const editor = page.locator('.chat__input [contenteditable="true"]');
  await editor.fill('Черновик');
  await message(page, 0).locator('.message-content__html').click();
  await expect(editor).not.toBeFocused();
  expect(errors).toEqual([]);
});
