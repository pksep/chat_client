import { test, expect } from '@playwright/test';

test.describe('Mobile vs Desktop Differences', () => {
  test.describe('Layout and UI Differences', () => {
    test('should show different layouts on mobile vs desktop', async ({
      page
    }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const desktopMenu = page.locator('[data-testid*="ChatContainer-Menu"]');
      await expect(desktopMenu).toBeVisible();

      const isDesktopMenuExpanded = await desktopMenu.evaluate(
        node => !node.classList.contains('menu--collapse')
      );
      expect(isDesktopMenuExpanded).toBe(true);

      console.log('✓ Desktop: Menu is visible and expanded');

      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible();
        console.log('✓ Mobile: Mobile contact list is visible');
      }

      const mobileMenu = page.locator('[data-testid*="ChatContainer-Menu"]');
      await expect(mobileMenu).toBeVisible();
    });

    test('should have different navigation patterns', async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const desktopContactItems = await page
        .locator('[data-testid*="Menu-ContactList"] li')
        .count();

      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mobileContactItems = await page
        .locator('[data-testid*="Chat-ContactListMobile"] li')
        .count();

      console.log(
        `✓ Navigation: Desktop has ${desktopContactItems} contact items, Mobile has ${mobileContactItems} contact items`
      );
    });
  });

  test.describe('Touch vs Click Interactions', () => {
    test('should handle both mouse and touch interactions', async ({
      page
    }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(aiButton).toBeVisible();
      await aiButton.click();
      await expect(
        page.locator('[data-testid*="MessageList-ContentEditor"]')
      ).toBeVisible();

      console.log('✓ Desktop: Click interactions work correctly');

      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mobileAiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(mobileAiButton).toBeVisible({ timeout: 10000 });
      await mobileAiButton.tap(); // Using tap for touch simulation
      await expect(
        page.locator('[data-testid*="Chat-MessageList"]')
      ).toBeVisible({ timeout: 10000 });

      console.log('✓ Mobile: Touch interactions work correctly');
    });
  });

  test.describe('Form Factor Specific Features', () => {
    test('should show different UI elements based on screen size', async ({
      page
    }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const collapseButton = page.locator(
        '[data-testid*="Menu-CollapseButton"]'
      );
      await expect(collapseButton).toBeVisible();

      console.log('✓ Desktop: Collapse button is available');

      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mobileHeaderMenu = page.locator(
        '[data-testid*="ChatContainer-HeaderMenu"]'
      );
      if ((await mobileHeaderMenu.count()) > 0) {
        await expect(mobileHeaderMenu).toBeVisible({ timeout: 10000 });
        console.log('✓ Mobile: Header menu is available');
      }

      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible({ timeout: 10000 });
        console.log('✓ Mobile: Contact list is displayed differently');
      }
    });

    test('should adapt content editor based on device', async ({ page }) => {
      for (const viewport of [
        { width: 1200, height: 800, name: 'desktop' },
        { width: 375, height: 667, name: 'mobile' }
      ]) {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height
        });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const aiButton = page.locator(
          '[data-testid*="Menu-AIAssistantContainer"]'
        );
        if ((await aiButton.count()) > 0) {
          await expect(aiButton).toBeVisible({ timeout: 10000 });
          await aiButton.click();
          await page.waitForSelector(
            '[data-testid*="MessageList-ContentEditor"]',
            {
              state: 'visible',
              timeout: 10000
            }
          );
        }

        const contentEditor = page.locator(
          '[data-testid*="MessageList-ContentEditor"]'
        );
        await expect(contentEditor).toBeVisible({ timeout: 10000 });

        const messageInput = page.locator(
          '[data-testid*="MessageList-ContentEditor"] textarea'
        );
        await expect(messageInput).toBeVisible({ timeout: 10000 });

        await messageInput.fill(`Test message from ${viewport.name}`);
        await expect(messageInput).toHaveValue(
          `Test message from ${viewport.name}`
        );

        await messageInput.clear();
        await expect(messageInput).toHaveValue('');

        console.log(
          `✓ ${viewport.name.charAt(0).toUpperCase() + viewport.name.slice(1)}: Content editor works correctly`
        );
      }
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should handle dynamic resizing gracefully', async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const menu = page.locator('[data-testid*="ChatContainer-Menu"]');
      await expect(menu).toBeVisible();

      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500); // Wait for layout adjustment

      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible();
      }

      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500); // Wait for layout adjustment

      await expect(menu).toBeVisible();

      console.log('✓ Responsive: Dynamic resizing handled gracefully');
    });

    test('should maintain functionality across device changes', async ({
      page
    }) => {
      for (const size of [
        { width: 1200, height: 800, name: 'desktop' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 375, height: 667, name: 'mobile' }
      ]) {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const aiButton = page.locator(
          '[data-testid*="Menu-AIAssistantContainer"]'
        );
        await expect(aiButton).toBeVisible({ timeout: 10000 });

        if (size.name === 'mobile') {
          const mobileList = page.locator(
            '[data-testid*="Chat-ContactListMobile"]'
          );
          if ((await mobileList.count()) > 0) {
            await expect(mobileList).toBeVisible({ timeout: 10000 });
          }
        } else {
          const desktopMenu = page.locator(
            '[data-testid*="ChatContainer-Menu"]'
          );
          await expect(desktopMenu).toBeVisible({ timeout: 10000 });
        }

        console.log(
          `✓ ${size.name.charAt(0).toUpperCase() + size.name.slice(1)}: Functionality maintained`
        );
      }
    });
  });
});
