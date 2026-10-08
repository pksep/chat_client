import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const animationBase = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
const animationImage = (page: import('@playwright/test').Page, index = 0) =>
  page
    .getByTestId(`EmojiMessage-${index}-Emoji`)
    .locator('img:not(.emoji-icon__preview)');

test.beforeEach(async ({ page }) => {
  await page.route(`${animationBase}**/512.webp`, async route => {
    const codepoint = route
      .request()
      .url()
      .slice(animationBase.length)
      .split('/')[0];
    const body = await readFile(
      new URL(`./fixtures/noto-animation/${codepoint}.webp`, import.meta.url)
    );
    await route.fulfill({ contentType: 'image/webp', body });
  });
});

const send = async (page: import('@playwright/test').Page, message: string) => {
  await page
    .getByRole('textbox', { name: 'Сообщение', exact: true })
    .fill(message);
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
};

test('один эмодзи постоянно анимирован, доставка и смена темы не перезапускают изображение', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/emoji-messages.html');
  await send(page, '🙂');
  const image = animationImage(page);
  const wrapper = image.locator('..');
  await expect(wrapper).toHaveAttribute('data-emoji-loaded', 'true');
  await expect(wrapper).toHaveAttribute('data-emoji-animated', 'true');
  await expect(image).toHaveAttribute('src', `${animationBase}1f642/512.webp`);
  const node = await image.elementHandle();
  const size = await wrapper.evaluate(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height };
  });
  for (const theme of ['Тёмная тема', 'Светлая тема']) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    await page
      .getByRole('button', { name: 'Подтвердить доставку', exact: true })
      .click();
    expect(await node!.evaluate(element => element.isConnected)).toBe(true);
    expect(
      await wrapper.evaluate(element => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      })
    ).toEqual(size);
    await expect(page.getByTestId('EmojiMessage-0-TimeText')).toHaveText(
      '12:30'
    );
  }
  await page
    .getByRole('button', { name: 'Переключить реакции', exact: true })
    .click();
  await expect(page.locator('.reaction')).toHaveCount(1);
  expect(await node!.evaluate(element => element.isConnected)).toBe(true);
  await page.waitForTimeout(6000);
  const frame = await image.screenshot();
  await expect
    .poll(async () => (await image.screenshot()).equals(frame), {
      timeout: 3000
    })
    .toBe(false);
  await image.click({ force: true });
  await expect(image).toHaveAttribute('src', `${animationBase}1f642/512.webp`);
  await expect(page.locator('dialog:visible')).toHaveCount(0);
});

test('до загрузки анимации виден PNG и размер сообщения сохраняется', async ({
  page
}) => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(`${animationBase}1f642/512.webp`, async route => {
    await ready;
    await route.fallback();
  });
  try {
    await page.goto('/e2e/fixtures/emoji-messages.html');
    await send(page, '🙂');
    const image = animationImage(page);
    const wrapper = image.locator('..');
    const preview = wrapper.locator('.emoji-icon__preview');
    await expect(preview).toHaveClass(/--loaded/);
    await expect(preview).toHaveCSS('opacity', '1');
    await expect(image).toHaveCSS('opacity', '0');
    const before = await page
      .getByTestId('EmojiMessage-0-Article')
      .boundingBox();
    release();
    await expect(wrapper).toHaveAttribute('data-emoji-loaded', 'true');
    await expect(wrapper).toHaveAttribute('data-emoji-animated', 'true');
    await expect(preview).toHaveCount(0);
    expect(
      await page.getByTestId('EmojiMessage-0-Article').boundingBox()
    ).toEqual(before);
  } finally {
    release();
  }
});

test('сердце с селектором и эмодзи с оттенком кожи используют нужную анимацию', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/emoji-messages.html');
  for (const [index, emoji, codepoint] of [
    [0, '❤️', '2764_fe0f'],
    [1, '👍🏽', '1f44d_1f3fd']
  ] as const) {
    await send(page, emoji);
    await expect(animationImage(page, index)).toHaveAttribute(
      'src',
      `${animationBase}${codepoint}/512.webp`
    );
    await expect(animationImage(page, index).locator('..')).toHaveAttribute(
      'data-emoji-loaded',
      'true'
    );
  }
});

test('текст, несколько эмодзи и неподдерживаемая анимация сохраняют обычное отображение', async ({
  page
}) => {
  const animationRequests: string[] = [];
  page.on('request', request => {
    if (request.url().startsWith(animationBase))
      animationRequests.push(request.url());
  });
  await page.goto('/e2e/fixtures/emoji-messages.html');
  for (const message of ['Текст 🙂', '🙂🙂', '🧱']) await send(page, message);
  // Для кирпича в официальном каталоге нет анимации.
  await expect(page.locator('.message__article--emoji')).toHaveCount(1);
  await expect(animationImage(page, 2)).toHaveAttribute(
    'src',
    '/emoji/noto/png/128/emoji_u1f9f1.png'
  );
  await expect(animationImage(page, 2).locator('..')).toHaveAttribute(
    'data-emoji-loaded',
    'true'
  );
  expect(animationRequests).toEqual([]);
});

test('при недоступном CDN выбирается PNG, последующие сообщения не повторяют ошибочный запрос', async ({
  page
}) => {
  let requests = 0;
  await page.route(`${animationBase}1f642/512.webp`, route => {
    requests += 1;
    return route.abort();
  });
  await page.goto('/e2e/fixtures/emoji-messages.html');
  await send(page, '🙂');
  await expect(animationImage(page)).toHaveAttribute(
    'src',
    '/emoji/noto/png/128/emoji_u1f642.png'
  );
  await expect(animationImage(page).locator('..')).toHaveAttribute(
    'data-emoji-loaded',
    'true'
  );
  const failedRequests = requests;
  await send(page, '🙂');
  await expect(animationImage(page, 1)).toHaveAttribute(
    'src',
    '/emoji/noto/png/128/emoji_u1f642.png'
  );
  await expect(animationImage(page, 1).locator('..')).toHaveAttribute(
    'data-emoji-loaded',
    'true'
  );
  expect(requests).toBe(failedRequests);
});
