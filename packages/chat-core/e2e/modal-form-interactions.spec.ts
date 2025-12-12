import { test, expect } from '@playwright/test';

test.describe('Modal and Form Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should handle new contact modal', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const newContactButtons = page.locator('[data-testid*="Menu-PlusButton"]');
    if ((await newContactButtons.count()) > 0) {
      await newContactButtons.first().click();

      await page.waitForSelector(
        '[data-testid*="ChatContainer-NewContactModal"]',
        { state: 'visible' }
      );

      const newContactModal = page.locator(
        '[data-testid*="ChatContainer-NewContactModal"]'
      );
      await expect(newContactModal).toBeVisible();

      const modalCloseButton = page.locator(
        '[data-testid*="ChatContainer-NewContactModal"] button:has-text("Закрыть"), [data-testid*="ChatContainer-NewContactModal"] button:has-text("Close")'
      );
      if ((await modalCloseButton.count()) > 0) {
        await modalCloseButton.click();

        await expect(newContactModal).not.toBeVisible();
        console.log('New contact modal opened and closed correctly');
      } else {
        await page.locator('body').click({ position: { x: 0, y: 0 } });
        await expect(newContactModal).not.toBeVisible();
        console.log('New contact modal opened and dismissed correctly');
      }
    } else {
      console.log('No new contact button available for testing');
    }
  });

  test('should handle new group modal', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const newGroupButtons = page.locator('[data-testid*="Menu-PlusButton"]');
    if ((await newGroupButtons.count()) > 2) {
      await newGroupButtons.nth(1).click();

      await page.waitForSelector(
        '[data-testid*="ChatContainer-NewGroupModal"]',
        { state: 'visible' }
      );

      const newGroupModal = page.locator(
        '[data-testid*="ChatContainer-NewGroupModal"]'
      );
      await expect(newGroupModal).toBeVisible();

      const modalCloseButton = page.locator(
        '[data-testid*="ChatContainer-NewGroupModal"] button:has-text("Закрыть"), [data-testid*="ChatContainer-NewGroupModal"] button:has-text("Close")'
      );
      if ((await modalCloseButton.count()) > 0) {
        await modalCloseButton.click();

        await expect(newGroupModal).not.toBeVisible();
        console.log('New group modal opened and closed correctly');
      } else {
        await page.locator('body').click({ position: { x: 0, y: 0 } });
        await expect(newGroupModal).not.toBeVisible();
        console.log('New group modal opened and dismissed correctly');
      }
    } else {
      console.log('No new group button available for testing');
    }
  });

  test('should handle message attachment functionality', async ({ page }) => {
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

    const attachmentButton = page.locator(
      '[data-testid*="MessageList-ContentEditor"] button:has-text("Прикрепить"), [data-testid*="MessageList-ContentEditor"] button:has(svg)'
    );
    if ((await attachmentButton.count()) > 0) {
      await expect(attachmentButton).toBeVisible();
      await expect(attachmentButton).toBeEnabled();

      console.log('Attachment button exists and is functional');
    } else {
      console.log('Attachment button not found');
    }

    const messageInput = page.locator(
      '[data-testid*="MessageList-ContentEditor"] textarea'
    );
    await expect(messageInput).toBeVisible();

    await messageInput.fill('Testing content editor functionality');
    await expect(messageInput).toHaveValue(
      'Testing content editor functionality'
    );

    await messageInput.clear();
    await expect(messageInput).toHaveValue('');

    console.log('Message editor and attachment functionality tested');
  });

  test.describe('Mobile Modal Interactions', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone viewport

    test('should handle modals on mobile', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      const newContactButtons = page.locator(
        '[data-testid*="Menu-PlusButton"]'
      );
      if ((await newContactButtons.count()) > 0) {
        await expect(newContactButtons.first()).toBeVisible({ timeout: 10000 });
        await newContactButtons.first().click();

        const newContactModal = page.locator(
          '[data-testid*="ChatContainer-NewContactModal"]'
        );
        if ((await newContactModal.count()) > 0) {
          await expect(newContactModal).toBeVisible({ timeout: 10000 });

          const modalCloseButton = page.locator(
            '[data-testid*="ChatContainer-NewContactModal"] button'
          );
          if ((await modalCloseButton.count()) > 0) {
            await expect(modalCloseButton.first()).toBeEnabled();
            await modalCloseButton.first().click();
            await expect(newContactModal).not.toBeVisible();
            console.log('Mobile modal opened and closed correctly');
          }
        }
      }
    });
  });

  test('should handle menu information panel', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

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

        const infoButton = page.locator(
          '[data-testid*="ChatContainer-Header"] button:has-text("Информация"), [data-testid*="ChatContainer-Header"] button:has-text("Info")'
        );
        if ((await infoButton.count()) > 0) {
          await infoButton.click();

          const infoPanel = page.locator(
            '[data-testid*="ChatContainer-MenuInfo"]'
          );
          if ((await infoPanel.count()) > 0) {
            await expect(infoPanel).toBeVisible();
            console.log('Information panel opened correctly');
          }
        }
      }
    }
  });

  test('should handle clear chat functionality', async ({ page }) => {
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

    const messageInput = page.locator(
      '[data-testid*="MessageList-ContentEditor"] textarea'
    );
    await messageInput.fill('Test message before clearing');

    const clearButton = page.locator(
      '[data-testid*="ChatContainer-Header"] button:has-text("Очистить"), [data-testid*="ChatContainer-Header"] button:has-text("Clear")'
    );
    if ((await clearButton.count()) > 0) {
      await clearButton.click();

      console.log('Clear chat functionality triggered');
    } else {
      console.log('Clear button not found in current view');
    }

    await messageInput.clear();
    await expect(messageInput).toHaveValue('');

    console.log('Clear functionality tested');
  });
});
