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
    await expect(folders).toBeVisible();
    const foldersBox = (await folders.boundingBox())!;
    const contentBox = (await page
      .locator('.startup-shell__content')
      .boundingBox())!;
    const first = page.locator('.startup-shell__folder-item').first();
    const firstBox = (await first.boundingBox())!;
    expect(contentBox.width).toBe(isMobile ? 393 : 435);
    expect(foldersBox.x).toBe(0);
    expect(foldersBox.width).toBe(isMobile ? 393 : 90);
    expect(firstBox.width).toBe(70);
    expect(firstBox.height).toBe(isMobile ? 72 : 52);
    expect(firstBox.x).toBe(isMobile ? 16 : 10);
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
    expect(isMobile ? secondBox.x - firstBox.x : secondBox.y - firstBox.y).toBe(
      isMobile ? 90 : 74
    );
    await expect(page.locator('.startup-shell__folder-footer')).toBeVisible({
      visible: !isMobile
    });
    await expect(
      page.locator('.startup-shell__folder-item--manage')
    ).toBeVisible({ visible: isMobile });
    const mainBox = await page.locator('.startup-shell__main').boundingBox();
    await page.screenshot({
      path: testInfo.outputPath('startup-folders.png'),
      animations: 'disabled'
    });
    if (!isMobile) {
      expect(mainBox?.x).toBe(435);
      expect(foldersBox.y).toBe(0);
      expect(firstBox.y).toBe(20);
      const footerBox = (await page
        .locator('.startup-shell__folder-footer')
        .boundingBox())!;
      expect(footerBox.y + footerBox.height).toBe(contentBox.height);
    } else {
      expect(mainBox).toBeNull();
      const searchBox = (await page
        .locator('.startup-shell__search')
        .boundingBox())!;
      expect(foldersBox.y).toBe(60);
      expect(searchBox.y - foldersBox.y - foldersBox.height).toBe(10);
      await expect(page.locator('.startup-shell__filters')).toBeVisible();
      await page
        .locator('html')
        .evaluate(element =>
          element.classList.add('startup-shell-topic-route')
        );
      await expect(folders).toBeHidden();
      await expect(page.locator('.startup-shell__main')).toBeVisible();
    }
    const color = await folders.evaluate(
      element => getComputedStyle(element).backgroundColor
    );
    expect(color).toBe(
      theme === 'dark' ? 'rgb(38, 42, 56)' : 'rgb(255, 255, 255)'
    );
  });
}
