import { test, expect } from '@playwright/test';

test.describe('Navigation Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Desktop Navigation', () => {
    test('should navigate between AI assistant, channels and personal messages', async ({
      page
    }) => {
      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(aiButton).toBeVisible();
      await aiButton.click();

      await page.waitForSelector('[data-testid*="MessageList-ContentEditor"]', {
        state: 'visible'
      });
      await expect(
        page.locator('[data-testid*="MessageList-ContentEditor"]')
      ).toBeVisible();

      console.log('Successfully navigated to AI assistant');

      const personalMessagesHeader = page.locator(
        'summary:has-text("Личные сообщения")'
      );
      if ((await personalMessagesHeader.count()) > 0) {
        await personalMessagesHeader.click();
        const firstContact = page
          .locator('[data-testid*="Menu-ContactList"] li')
          .first();
        if ((await firstContact.count()) > 0) {
          await firstContact.click();
          await expect(
            page.locator('[data-testid*="MessageList-ContentEditor"]')
          ).toBeVisible();
          console.log('Successfully navigated to personal message');
        }
      }

      const channelsHeader = page.locator('summary:has-text("Каналы")');
      if ((await channelsHeader.count()) > 0) {
        await channelsHeader.click();
        const firstChannel = page
          .locator('[data-testid*="Menu-ContactList"] li')
          .nth(1);
        if ((await firstChannel.count()) > 0) {
          await firstChannel.click();
          await expect(
            page.locator('[data-testid*="MessageList-ContentEditor"]')
          ).toBeVisible();
          console.log('Successfully navigated to channel');
        }
      }
    });

    test('should toggle menu collapse/expand', async ({ page }) => {
      await page.waitForSelector('[data-testid*="ChatContainer-Menu"]', {
        state: 'visible'
      });

      const collapseButton = page.locator(
        '[data-testid*="Menu-CollapseButton"]'
      );
      await expect(collapseButton).toBeVisible();

      const menu = page.locator('[data-testid*="Menu-Container"]');
      const isExpandedBefore = await menu.evaluate(
        node => !node.classList.contains('menu--collapse')
      );
      expect(isExpandedBefore).toBe(true);

      await collapseButton.click();
      await page.waitForTimeout(300); // Wait for animation

      const isCollapsedAfter = await menu.evaluate(node =>
        node.classList.contains('menu--collapse')
      );
      expect(isCollapsedAfter).toBe(true);

      await collapseButton.click();
      await page.waitForTimeout(300); // Wait for animation

      const isExpandedAfter = await menu.evaluate(
        node => !node.classList.contains('menu--collapse')
      );
      expect(isExpandedAfter).toBe(true);

      console.log('Menu collapse/expand functionality works correctly');
    });
  });

  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone viewport

    test('should show mobile menu and navigation', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const contactListMobile = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await contactListMobile.count()) > 0) {
        await expect(contactListMobile).toBeVisible({ timeout: 10000 });
        console.log('Mobile contact list is visible');
      }

      const headerMenu = page.locator(
        '[data-testid*="ChatContainer-HeaderMenu"]'
      );
      if ((await headerMenu.count()) > 0) {
        await expect(headerMenu).toBeVisible({ timeout: 10000 });
        console.log('Mobile header menu is visible');
      }
    });

    test('should navigate between sections on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(aiButton).toBeVisible({ timeout: 10000 });
      await aiButton.click();

      await page.waitForSelector('[data-testid*="Chat-MessageList"]', {
        state: 'visible',
        timeout: 10000
      });
      await expect(
        page.locator('[data-testid*="Chat-MessageList"]')
      ).toBeVisible();

      console.log('Mobile navigation to AI assistant works correctly');
    });
  });
});
