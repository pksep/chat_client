import { test } from '@playwright/test';

test.describe('Console Error Check', () => {
  test.beforeEach(async ({ page }) => {
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console Error: ${msg.text()}`);
      }
      if (msg.type() === 'warning') {
        console.log(`Console Warning: ${msg.text()}`);
      }
    });

    // Listen for page errors
    page.on('pageerror', error => {
      console.log(`Page Error: ${error.message}`);
    });

    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
  });

  test('check console for errors and navigate safely', async ({ page }) => {
    // Wait for the page to load and handle potential initialization errors
    await page.waitForTimeout(3000);

    // Take a screenshot to see the initial page
    await page.screenshot({ path: 'homepage.png', fullPage: true });

    // Get page title to confirm page loaded
    const title = await page.title();
    console.log(`Page title: ${title}`);

    // Get the current URL to confirm navigation
    const url = page.url();
    console.log(`Current URL: ${url}`);

    // Check for visible elements before interacting
    const aiButton = page.locator('button:has-text("AI Ассистент")');
    const channelsButton = page.locator('button:has-text("Каналы")');
    const dialogsButton = page.locator('button:has-text("Диалоги")');

    // Try clicking the AI assistant button if it's available
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

    // Try clicking the Channels button if it's available
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

    // Try clicking the Dialogs button if it's available
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

    // Look for any contacts or conversation items
    const contactItems = page.locator('.contact-list__item');
    const contactCount = await contactItems.count();
    console.log(`Found ${contactCount} contact items`);

    // Click on a few contact items if available, but don't fail if they're not visible
    for (let i = 0; i < Math.min(2, contactCount); i++) {
      try {
        const contactItem = contactItems.nth(i);
        await contactItem.waitFor({ state: 'visible', timeout: 3000 });
        await contactItem.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        console.log(`Successfully clicked contact item ${i}`);
      } catch (error) {
        console.log(`Could not click contact item ${i}: ${error.message}`);
        // Continue to next item even if one fails
      }
    }

    // Final screenshot after interactions
    await page.screenshot({ path: 'final.png', fullPage: true });

    // Wait a bit more to catch any delayed console errors
    await page.waitForTimeout(2000);
  });
});
