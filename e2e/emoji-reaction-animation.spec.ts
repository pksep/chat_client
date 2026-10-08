import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const animationBase = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
const staticThumbsUp = '/emoji/noto/png/128/emoji_u1f44d.png';

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

test('reaction animation plays once and quick reactions stay static', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/emoji-messages.html');
  await page.locator('input[aria-label]').fill('\u{1F642}');
  await page.locator('form button').click();
  await page.locator('nav button').nth(3).click();

  const reaction = page.locator(
    '.reaction-item__emoji img:not(.emoji-icon__preview)'
  );
  await expect(reaction).toHaveAttribute(
    'src',
    `${animationBase}1f44d/512.webp`
  );
  await expect(reaction).toHaveAttribute('src', staticThumbsUp, {
    timeout: 3000
  });

  await page.locator('nav button').nth(3).click();
  await page.locator('nav button').nth(3).click();
  await expect(
    page.locator('.reaction-item__emoji img:not(.emoji-icon__preview)')
  ).toHaveAttribute('src', staticThumbsUp);

  await page
    .getByTestId('EmojiMessage-0-MessageBubble-Container')
    .click({ button: 'right' });
  await expect(
    page.locator('.select-reactions-item img').first()
  ).not.toHaveAttribute('src', /512\.webp$/);
});
