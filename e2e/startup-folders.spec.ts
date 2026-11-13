import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const startupHtml = readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');

for (const theme of ['light', 'dark']) {
  test(`Начальный скелетон сохраняет место и геометрию папок: ${theme}`, async ({
    page,
    isMobile
  }, testInfo) => {
    await page.route('**/startup-folder-check', route =>
      route.fulfill({ contentType: 'text/html', body: startupHtml })
    );
    await page.goto('/startup-folder-check');
    await page.locator('html').evaluate((element, theme) => {
      element.classList.add(`theme-${theme}`);
    }, theme);
    const folders = page.locator('.startup-shell__folders');
    await expect(folders).toBeVisible({ visible: !isMobile });
    if (isMobile) {
      const search = (await page
        .locator('.startup-shell__search')
        .boundingBox())!;
      const filters = (await page
        .locator('.startup-shell__filters')
        .boundingBox())!;
      expect(search.y).toBe(60);
      expect(filters.y - search.y - search.height).toBe(10);
      await expect(
        page.locator('.startup-shell__folder-settings')
      ).toBeVisible();
      await expect(page.locator('.startup-shell__content')).toHaveCSS(
        'width',
        '393px'
      );
      await page.screenshot({
        path: testInfo.outputPath('startup-folders.png'),
        animations: 'disabled'
      });
      await page
        .locator('html')
        .evaluate(element =>
          element.classList.add('startup-shell-topic-route')
        );
      await expect(page.locator('.startup-shell__main')).toBeVisible();
      return;
    }
    const foldersBox = (await folders.boundingBox())!;
    const contentBox = (await page
      .locator('.startup-shell__content')
      .boundingBox())!;
    const first = page.locator('.startup-shell__folder-item').first();
    const firstBox = (await first.boundingBox())!;
    expect(contentBox.width).toBe(435);
    expect(foldersBox.x).toBe(0);
    expect(foldersBox.width).toBe(90);
    expect(firstBox.width).toBe(70);
    expect(firstBox.height).toBe(52);
    expect(firstBox.x).toBe(10);
    await expect(first.locator('.startup-shell__folder-avatar')).toHaveCSS(
      'width',
      '38px'
    );
    await expect(first.locator('.startup-shell__folder-avatar')).toHaveCSS(
      'height',
      '38px'
    );
    await expect(first.locator('.startup-shell__folder-name')).toHaveCSS(
      'height',
      '12px'
    );
    const secondBox = (await page
      .locator('.startup-shell__folder-item')
      .nth(1)
      .boundingBox())!;
    expect(secondBox.y - firstBox.y).toBe(74);
    await expect(page.locator('.startup-shell__folder-footer')).toBeVisible();
    await expect(
      page.locator('.startup-shell__folder-item--manage')
    ).toBeHidden();
    const mainBox = await page.locator('.startup-shell__main').boundingBox();
    await page.screenshot({
      path: testInfo.outputPath('startup-folders.png'),
      animations: 'disabled'
    });
    expect(mainBox?.x).toBe(435);
    expect(foldersBox.y).toBe(0);
    expect(firstBox.y).toBe(20);
    const footerBox = (await page
      .locator('.startup-shell__folder-footer')
      .boundingBox())!;
    expect(footerBox.y + footerBox.height).toBe(contentBox.height);
    const color = await folders.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    expect(color).toBe(
      theme === 'dark' ? 'rgb(38, 42, 56)' : 'rgb(255, 255, 255)'
    );
  });
}
