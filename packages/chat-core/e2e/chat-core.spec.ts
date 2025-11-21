import { test, expect } from '@playwright/test';

test.describe('Chat Core E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for the server to be ready and navigate to the chat page
    await page.goto('/');
    await page.waitForLoadState('networkidle'); // Wait for all network requests to complete
  });

  test('should load the chat interface', async ({ page }) => {
    // Wait for the chat container to be visible
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    // Expect the chat container to be visible
    await expect(
      page.locator('[data-testid*="ChatContainer-Container"]')
    ).toBeVisible();

    // Check that the main chat elements are present
    await expect(
      page.locator('[data-testid*="ChatContainer-Menu"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid*="ChatContainer-Chat"]')
    ).toBeVisible();

    console.log('Chat interface loaded successfully');
  });

  test('should display the message input field', async ({ page }) => {
    // Navigate to a chat view if not already there
    await page.waitForSelector('[data-testid*="MessageList-InputContainer"]', {
      state: 'visible'
    });

    // Verify the content editor (chat input) is visible
    await expect(
      page.locator('[data-testid*="MessageList-ContentEditor"]')
    ).toBeVisible();

    console.log('Message input field is visible');
  });

  test('should handle chat interactions', async ({ page }) => {
    // Wait for the chat to be loaded
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    // Verify initial state - should have an empty chat or some default content
    const emptyChat = page.locator('[data-testid*="MessageList-EmptyChat"]');
    if (await emptyChat.isVisible()) {
      console.log('Empty chat state is displayed correctly');
    } else {
      console.log('Messages are already present in the chat');
    }

    // Test that we can interact with the content editor
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
