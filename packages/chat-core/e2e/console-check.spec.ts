import { test } from '@playwright/test';

test.describe('Console Error Check', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console Error: ${msg.text()}`);
      }
      if (msg.type() === 'warning') {
        console.log(`Console Warning: ${msg.text()}`);
      }
    });

    page.on('pageerror', error => {
      console.log(`Page Error: ${error.message}`);
    });

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test('check console for errors and navigate safely', async ({ page }) => {
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'homepage.png', fullPage: true });

    const title = await page.title();
    console.log(`Page title: ${title}`);

    const url = page.url();
    console.log(`Current URL: ${url}`);

    const aiButton = page.locator('button:has-text("AI Ассистент")');
    const channelsButton = page.locator('button:has-text("Каналы")');
    const dialogsButton = page.locator('button:has-text("Диалоги")');

    if ((await aiButton.count()) > 0) {
      try {
        await aiButton.waitFor({ state: 'visible', timeout: 5000 });
        await aiButton.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        console.log('Successfully clicked AI assistant button');
      } catch (error) {
        console.log(`Could not click AI assistant button: ${error.message}`);
      }
    }

    if ((await channelsButton.count()) > 0) {
      try {
        await channelsButton.waitFor({ state: 'visible', timeout: 5000 });
        await channelsButton.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        console.log('Successfully clicked Channels button');
      } catch (error) {
        console.log(`Could not click Channels button: ${error.message}`);
      }
    }

    if ((await dialogsButton.count()) > 0) {
      try {
        await dialogsButton.waitFor({ state: 'visible', timeout: 5000 });
        await dialogsButton.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        console.log('Successfully clicked Dialogs button');
      } catch (error) {
        console.log(`Could not click Dialogs button: ${error.message}`);
      }
    }

    const contactItems = page.locator('.contact-list__item');
    const contactCount = await contactItems.count();
    console.log(`Found ${contactCount} contact items`);

    for (let i = 0; i < Math.min(2, contactCount); i++) {
      try {
        const contactItem = contactItems.nth(i);
        await contactItem.waitFor({ state: 'visible', timeout: 3000 });
        await contactItem.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        console.log(`Successfully clicked contact item ${i}`);
      } catch (error) {
        console.log(`Could not click contact item ${i}: ${error.message}`);
      }
    }

    await page.screenshot({ path: 'final.png', fullPage: true });

    await page.waitForTimeout(2000);
  });
});
