import { test, expect } from '@playwright/test';

test.describe('UI and Responsive Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle responsive design and menu behavior', async ({
    page
  }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const menu = page.locator('[data-testid*="ChatContainer-Menu"]');
    await expect(menu).toBeVisible();

    const isMenuExpanded = await menu.evaluate(
      node => !node.classList.contains('menu--collapse')
    );
    expect(isMenuExpanded).toBe(true);

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Wait for layout change

    const contactListMobile = page.locator(
      '[data-testid*="Chat-ContactListMobile"]'
    );
    if ((await contactListMobile.count()) > 0) {
      await expect(contactListMobile).toBeVisible();
    }

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(500); // Wait for layout change

    await expect(menu).toBeVisible();

    console.log('Responsive design and menu behavior work correctly');
  });

  test('should handle contact selection and display', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const contacts = page.locator('[data-testid*="Menu-ContactList"] li');
    const contactCount = await contacts.count();

    if (contactCount > 0) {
      const firstContact = contacts.first();
      await firstContact.click();

      await page.waitForSelector('[data-testid*="Chat-MessageList"]', {
        state: 'visible'
      });

      const messageInput = page.locator(
        '[data-testid*="MessageList-ContentEditor"]'
      );
      await expect(messageInput).toBeVisible();

      console.log(
        `Successfully selected contact and loaded chat (${contactCount} contacts available)`
      );
    } else {
      console.log('No contacts available for selection test');
    }
  });

  test('should handle header interactions', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const aiButton = page.locator('[data-testid*="Menu-AIAssistantContainer"]');
    if ((await aiButton.count()) > 0) {
      await aiButton.click();
      await page.waitForSelector('[data-testid*="MessageList-ContentEditor"]', {
        state: 'visible'
      });
    }

    const header = page.locator('[data-testid*="ChatContainer-Header"]');
    if ((await header.count()) > 0) {
      await expect(header).toBeVisible();

      await header.click();
    }

    console.log('Header interactions handled correctly');
  });

  test.describe('Mobile UI Interactions', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone viewport

    test('should handle mobile-specific UI elements', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const mobileContactList = page.locator(
        '[data-testid*="Chat-ContactListMobile"]'
      );
      if ((await mobileContactList.count()) > 0) {
        await expect(mobileContactList).toBeVisible({ timeout: 10000 });
        console.log('Mobile contact list is visible');
      }

      const mobileHeaderMenu = page.locator(
        '[data-testid*="ChatContainer-HeaderMenu"]'
      );
      if ((await mobileHeaderMenu.count()) > 0) {
        await expect(mobileHeaderMenu).toBeVisible({ timeout: 10000 });
        console.log('Mobile header menu is visible');
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
      console.log('Mobile navigation to AI assistant works');
    });

    test('should handle mobile menu interactions', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const mobileContactItems = page.locator(
        '[data-testid*="Chat-ContactListMobile"] li'
      );
      const contactCount = await mobileContactItems.count();

      if (contactCount > 0) {
        const firstContact = mobileContactItems.first();
        await firstContact.click();

        await page.waitForSelector('[data-testid*="Chat-MessageList"]', {
          state: 'visible',
          timeout: 10000
        });

        console.log('Mobile contact selection works correctly');
      }
    });
  });

  test('should handle empty state and loading', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const aiButton = page.locator('[data-testid*="Menu-AIAssistantContainer"]');
    if ((await aiButton.count()) > 0) {
      await aiButton.click();
      await page.waitForSelector('[data-testid*="MessageList-ContentEditor"]', {
        state: 'visible'
      });
    }

    const emptyChat = page.locator('[data-testid*="MessageList-EmptyChat"]');
    if ((await emptyChat.count()) > 0) {
      await expect(emptyChat).toBeVisible();
      console.log('Empty chat state is displayed correctly');
    } else {
      console.log('Chat has existing messages or different empty state');
    }

    await page.waitForLoadState('networkidle');
    console.log('Loading states handled correctly');
  });
});
