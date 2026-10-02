import { expect, test, type Locator } from '@playwright/test';
import { chatFolderIcons } from '../src/services/useChatSDK/chat-folder';

const resolveColors = (locator: Locator, tokens: Record<string, string>) =>
  locator.evaluate((element, tokens) => {
    const probe = document.createElement('span');
    element.appendChild(probe);
    const colors = Object.fromEntries(
      Object.entries(tokens).map(([name, token]) => {
        probe.style.color = `var(${token})`;
        return [name, getComputedStyle(probe).color];
      })
    );
    probe.remove();
    return colors;
  }, tokens);

for (const theme of ['light', 'dark']) {
  test(`Все иконки папок видны, сохраняют размер и цвет темы: ${theme}`, async ({
    page
  }, testInfo) => {
    await page.goto('/e2e/fixtures/chat-folder-loading.html?icons');
    if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
    const gallery = page.getByTestId('Fixture-Icons');
    await expect(gallery.locator('svg')).toHaveCount(63);
    const expectedColors = await resolveColors(gallery, {
      normal: '--action-primary-bg',
      active: '--chat-folder-rail-active-icon'
    });
    for (const name of chatFolderIcons) {
      const card = page.getByTestId(`Fixture-Icon-${name}`);
      await expect(card).toBeVisible();
      const icons = card.locator('svg');
      await expect(icons.nth(0)).toHaveCSS('width', '40px');
      await expect(icons.nth(0)).toHaveCSS('height', '40px');
      for (const index of [1, 2]) {
        await expect(icons.nth(index)).toHaveCSS('width', '24px');
        await expect(icons.nth(index)).toHaveCSS('height', '24px');
      }
      const painted = await icons.first().evaluate(element => {
        const box = (element as SVGSVGElement).getBBox();
        return { width: box.width, height: box.height, x: box.x, y: box.y };
      });
      expect(painted.width).toBeGreaterThan(10);
      expect(painted.height).toBeGreaterThan(10);
      expect(painted.width).toBeLessThanOrEqual(40);
      expect(painted.height).toBeLessThanOrEqual(40);
      expect(painted.x).toBeGreaterThanOrEqual(0);
      expect(painted.y).toBeGreaterThanOrEqual(0);
      await expect(icons.nth(1)).toHaveCSS('color', expectedColors.normal);
      await expect(icons.nth(2)).toHaveCSS('color', expectedColors.active);
      await expect(
        card.locator('.chat-folder-rail__item--active > span')
      ).toHaveCSS('background-color', expectedColors.normal);
      expect(expectedColors.normal).not.toBe('rgb(0, 0, 0)');
      expect(expectedColors.active).not.toBe('rgb(0, 0, 0)');
    }
    await gallery.screenshot({ path: testInfo.outputPath('folder-icons.png') });
  });

  test(`Палитра иконок в настоящей модалке совпадает с сеткой Figma: ${theme}`, async ({
    page
  }, testInfo) => {
    await page.goto('/e2e/fixtures/chat-folder-loading.html');
    if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
    await page.getByTestId('Fixture-Ready').click();
    await page.getByTestId('ChatFolders-Folder-folder-1').click();
    const iconButton = page.getByTestId('ChatFolders-IconButton');
    await expect(iconButton.locator('svg').first()).toHaveCSS('width', '54px');
    await iconButton.click();
    const picker = page.getByTestId('ChatFolders-IconPicker');
    await expect(picker.locator('button')).toHaveCount(21);
    await expect(picker).toHaveCSS('width', '340px');
    await expect(picker).toHaveCSS('height', '170px');
    const pickerBox = (await picker.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(pickerBox.x).toBeGreaterThanOrEqual(0);
    expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(viewport.width);
    const expectedColors = await resolveColors(picker, {
      normal: '--text-secondary',
      active: '--action-primary-bg',
      background: '--surface-overlay'
    });
    await expect(picker).toHaveCSS(
      'background-color',
      expectedColors.background
    );
    const firstBox = (await page
      .getByTestId('ChatFolders-Icon-folder')
      .boundingBox())!;
    for (const [index, name] of chatFolderIcons.entries()) {
      const button = page.getByTestId(`ChatFolders-Icon-${name}`);
      await expect(button).toHaveAttribute(
        'aria-pressed',
        String(name === 'settings')
      );
      await expect(button).toHaveCSS(
        'color',
        name === 'settings' ? expectedColors.active : expectedColors.normal
      );
      await expect(button.locator('svg')).toHaveCSS('width', '40px');
      await expect(button.locator('svg')).toHaveCSS('height', '40px');
      const box = (await button.boundingBox())!;
      expect(box.x - firstBox.x).toBe((index % 7) * 45);
      expect(box.y - firstBox.y).toBe(Math.floor(index / 7) * 50);
    }
    await picker.screenshot({
      path: testInfo.outputPath('folder-icon-picker.png')
    });
    await page.getByTestId('ChatFolders-Icon-folder').hover();
    await expect(page.getByTestId('ChatFolders-Icon-folder')).toHaveCSS(
      'color',
      expectedColors.active
    );
  });
}
