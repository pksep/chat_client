import { test, expect } from '@playwright/test';

test.describe('Chat Core E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle'); // Wait for all network requests to complete
  });

  test('should load the chat interface', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    await expect(
      page.locator('[data-testid*="ChatContainer-Container"]')
    ).toBeVisible();

    await expect(
      page.locator('[data-testid*="ChatContainer-Menu"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid*="ChatContainer-Chat"]')
    ).toBeVisible();

    console.log('Chat interface loaded successfully');
  });

  test('should display the message input field', async ({ page }) => {
    await page.waitForSelector('[data-testid*="MessageList-InputContainer"]', {
      state: 'visible'
    });

    await expect(
      page.locator('[data-testid*="MessageList-ContentEditor"]')
    ).toBeVisible();

    console.log('Message input field is visible');
  });

  test('should handle chat interactions', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const emptyChat = page.locator('[data-testid*="MessageList-EmptyChat"]');
    if (await emptyChat.isVisible()) {
      console.log('Empty chat state is displayed correctly');
    } else {
      console.log('Messages are already present in the chat');
    }

    const contentEditor = page
      .locator('[data-testid*="MessageList-ContentEditor"]')
      .locator('textarea');
    if (await contentEditor.isVisible()) {
      await contentEditor.fill('Hello, this is a test message!');
      await expect(contentEditor).toHaveValue('Hello, this is a test message!');
      console.log('Message input functionality works');
    } else {
      console.log('Content editor not available in current view');
    }
  });
});
