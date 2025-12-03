import { test, expect } from '@playwright/test';

test.describe('Comprehensive Mobile and Desktop Interactions', () => {
  test.describe('Desktop Full Workflow', () => {
    test('full desktop workflow with all interactions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });
      await expect(
        page.locator('[data-testid*="ChatContainer-Container"]')
      ).toBeVisible();

      console.log('✓ Desktop: App loaded successfully');

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(aiButton).toBeVisible();
      await aiButton.click();
      await expect(
        page.locator('[data-testid*="MessageList-ContentEditor"]')
      ).toBeVisible();

      console.log('✓ Desktop: Navigated to AI assistant');

      const messageInput = page.locator(
        '[data-testid*="MessageList-ContentEditor"] textarea'
      );
      await expect(messageInput).toBeVisible();

      const testMessage = 'Hello from comprehensive desktop test!';
      await messageInput.fill(testMessage);
      await expect(messageInput).toHaveValue(testMessage);

      const sendButton = page
        .locator('[data-testid*="MessageList-ContentEditor"] button')
        .last();
      if ((await sendButton.count()) > 0) {
        await sendButton.click();
      } else {
        await messageInput.press('Enter');
      }

      console.log('✓ Desktop: Message sent in AI assistant');

      const collapseButton = page.locator(
        '[data-testid*="Menu-CollapseButton"]'
      );
      await expect(collapseButton).toBeVisible();

      await collapseButton.click();
      await page.waitForTimeout(300);
      const menu = page.locator('[data-testid*="Menu-Container"]');
      const isCollapsed = await menu.evaluate(node =>
        node.classList.contains('menu--collapse')
      );
      expect(isCollapsed).toBe(true);

      console.log('✓ Desktop: Menu collapsed successfully');

      await collapseButton.click();
      await page.waitForTimeout(300);
      const isExpanded = await menu.evaluate(
        node => !node.classList.contains('menu--collapse')
      );
      expect(isExpanded).toBe(true);

      console.log('✓ Desktop: Menu expanded successfully');

      const personalMessagesHeader = page.locator(
        'summary:has-text("Личные сообщения")'
      );
      if ((await personalMessagesHeader.count()) > 0) {
        await personalMessagesHeader.click();
        await page.waitForTimeout(500);

        const firstContact = page
          .locator('[data-testid*="Menu-ContactList"] li')
          .first();
        if ((await firstContact.count()) > 0) {
          await firstContact.click();
          await page.waitForSelector(
            '[data-testid*="MessageList-ContentEditor"]',
            { state: 'visible' }
          );

          console.log('✓ Desktop: Navigated to personal message');

          await messageInput.fill('Message in personal chat');
          if ((await sendButton.count()) > 0) {
            await sendButton.click();
          } else {
            await messageInput.press('Enter');
          }

          console.log('✓ Desktop: Message sent in personal chat');
        }
      }

      console.log('✓ Desktop: Full workflow completed successfully');
    });
  });

  test.describe('Mobile Full Workflow', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone viewport

    test('full mobile workflow with all interactions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });
      await expect(
        page.locator('[data-testid*="ChatContainer-Container"]')
      ).toBeVisible();

      console.log('✓ Mobile: App loaded successfully');

      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible({ timeout: 10000 });
        console.log('✓ Mobile: Mobile contact list is visible');
      }

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

      console.log('✓ Mobile: Navigated to AI assistant');

      const messageInput = page.locator(
        '[data-testid*="MessageList-ContentEditor"] textarea'
      );
      await expect(messageInput).toBeVisible({ timeout: 10000 });

      const testMessage = 'Hello from comprehensive mobile test!';
      await messageInput.fill(testMessage);
      await expect(messageInput).toHaveValue(testMessage);

      const sendButton = page
        .locator('[data-testid*="MessageList-ContentEditor"] button')
        .last();
      if ((await sendButton.count()) > 0) {
        await sendButton.click();
      } else {
        await messageInput.press('Enter');
      }

      console.log('✓ Mobile: Message sent in AI assistant');

      const headerMenu = page.locator(
        '[data-testid*="ChatContainer-HeaderMenu"]'
      );
      if ((await headerMenu.count()) > 0) {
        await expect(headerMenu).toBeVisible({ timeout: 10000 });
        await headerMenu.click();
        console.log('✓ Mobile: Navigated using header menu');
      }

      const mobileContactItems = page.locator(
        '[data-testid*="Chat-ContactListMobile"] li'
      );
      const contactCount = await mobileContactItems.count();

      if (contactCount > 0) {
        const firstContact = mobileContactItems.first();
        await expect(firstContact).toBeVisible({ timeout: 10000 });
        await firstContact.click();

        await page.waitForSelector('[data-testid*="Chat-MessageList"]', {
          state: 'visible',
          timeout: 10000
        });
        console.log('✓ Mobile: Selected contact and loaded chat');
      }

      console.log('✓ Mobile: Full workflow completed successfully');
    });
  });

  test.describe('Cross-Device Consistency', () => {
    test('ensure similar functionality works on both devices', async ({
      page
    }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const desktopAiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      const desktopMenu = page.locator('[data-testid*="ChatContainer-Menu"]');

      await expect(desktopAiButton).toBeVisible();
      await expect(desktopMenu).toBeVisible();

      console.log('✓ Cross-device: Core desktop elements are visible');

      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const mobileAiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      const mobileMessageEditor = page.locator(
        '[data-testid*="Chat-MessageList"]'
      );

      await expect(mobileAiButton).toBeVisible({ timeout: 10000 });
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible({ timeout: 10000 });
      }

      console.log('✓ Cross-device: Core mobile elements are visible');

      await mobileAiButton.click();
      await page.waitForSelector('[data-testid*="Chat-MessageList"]', {
        state: 'visible',
        timeout: 10000
      });
      await expect(mobileMessageEditor).toBeVisible();

      console.log(
        '✓ Cross-device: AI assistant accessible on both device types'
      );
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test('should handle rapid navigation without errors', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      const personalMessagesHeader = page.locator(
        'summary:has-text("Личные сообщения")'
      );

      if ((await aiButton.count()) > 0) {
        await aiButton.click();
        await page.waitForTimeout(200);

        if ((await personalMessagesHeader.count()) > 0) {
          await personalMessagesHeader.click();
          await page.waitForTimeout(200);

          const firstContact = page
            .locator('[data-testid*="Menu-ContactList"] li')
            .first();
          if ((await firstContact.count()) > 0) {
            await firstContact.click();
            await page.waitForTimeout(200);
          }
        }

        await aiButton.click();
        await page.waitForTimeout(200);
      }

      const messageInput = page.locator(
        '[data-testid*="MessageList-ContentEditor"] textarea'
      );
      await expect(messageInput).toBeVisible({ timeout: 10000 });
      await messageInput.fill('Test after rapid navigation');
      await expect(messageInput).toHaveValue('Test after rapid navigation');

      console.log('✓ Error handling: Rapid navigation handled without errors');
    });

    test('should handle window resize smoothly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500);

      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(500);

      await page.setViewportSize({ width: 1200, height: 800 });
      await page.waitForTimeout(500);

      const aiButton = page.locator(
        '[data-testid*="Menu-AIAssistantContainer"]'
      );
      await expect(aiButton).toBeVisible({ timeout: 10000 });

      console.log('✓ Error handling: Window resize handled smoothly');
    });
  });
});
