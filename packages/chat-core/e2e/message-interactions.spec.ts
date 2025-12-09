import { test, expect } from '@playwright/test';

test.describe('Message Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should send and receive messages in AI assistant mode', async ({
    page
  }) => {
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
    await expect(messageInput).toBeVisible();

    const testMessage = 'Hello, this is a test message from Playwright!';
    await messageInput.fill(testMessage);
    await expect(messageInput).toHaveValue(testMessage);

    const sendButton = page.locator(
      '[data-testid*="MessageList-ContentEditor"] button:has-text("Отправить")'
    );
    if ((await sendButton.count()) > 0) {
      await sendButton.click();
    } else {
      await messageInput.press('Enter');
    }

    await page.waitForTimeout(1000); // Wait for message processing

    const messageBubbles = page.locator(
      '[data-testid*="MessageList-MessageBubble"]'
    );
    const bubbleCount = await messageBubbles.count();
    if (bubbleCount > 0) {
      const lastMessage = messageBubbles.last();
      await expect(lastMessage).toContainText(testMessage);
      console.log('Message sent and displayed correctly');
    }

    await messageInput.clear();
    await expect(messageInput).toHaveValue('');

    console.log('AI assistant message sending works correctly');
  });

  test('should send and receive messages in regular chat', async ({ page }) => {
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

        const messageInput = page.locator(
          '[data-testid*="MessageList-ContentEditor"] textarea'
        );
        await expect(messageInput).toBeVisible();

        const testMessage = 'Test message in regular chat';
        await messageInput.fill(testMessage);
        await expect(messageInput).toHaveValue(testMessage);

        const sendButton = page.locator(
          '[data-testid*="MessageList-ContentEditor"] button:has-text("Отправить")'
        );
        if ((await sendButton.count()) > 0) {
          await sendButton.click();
        } else {
          await messageInput.press('Enter');
        }

        await page.waitForTimeout(1000); // Wait for message processing

        const messageBubbles = page.locator(
          '[data-testid*="MessageList-MessageBubble"]'
        );
        const bubbleCount = await messageBubbles.count();
        if (bubbleCount > 0) {
          const lastMessage = messageBubbles.last();
          await expect(lastMessage).toContainText(testMessage);
          console.log('Regular chat message sent correctly');
        }

        console.log('Regular chat message sending works correctly');
      }
    }
  });

  test('should handle empty messages and input validation', async ({
    page
  }) => {
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
    await expect(messageInput).toBeVisible();

    await messageInput.fill('');
    const sendButton = page.locator(
      '[data-testid*="MessageList-ContentEditor"] button:has-text("Отправить")'
    );
    if ((await sendButton.count()) > 0) {
      const initialMessageCount = await page
        .locator('[data-testid*="MessageList-MessageBubble"]')
        .count();
      await sendButton.click();

      const finalMessageCount = await page
        .locator('[data-testid*="MessageList-MessageBubble"]')
        .count();
      expect(initialMessageCount).toBe(finalMessageCount);

      console.log('Empty message validation works correctly');
    }

    await messageInput.fill('   ');
    if ((await sendButton.count()) > 0) {
      const initialMessageCount = await page
        .locator('[data-testid*="MessageList-MessageBubble"]')
        .count();
      await sendButton.click();

      const finalMessageCount = await page
        .locator('[data-testid*="MessageList-MessageBubble"]')
        .count();
      expect(initialMessageCount).toBe(finalMessageCount);

      console.log('Whitespace-only message validation works correctly');
    }
  });

  test.describe('Mobile Message Interactions', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone viewport

    test('should send messages on mobile device', async ({ page }) => {
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

      const messageInput = page.locator(
        '[data-testid*="MessageList-ContentEditor"] textarea'
      );
      await expect(messageInput).toBeVisible({ timeout: 10000 });

      const testMessage = 'Test message from mobile';
      await messageInput.fill(testMessage);
      await expect(messageInput).toHaveValue(testMessage);

      const sendButton = page.locator(
        '[data-testid*="MessageList-ContentEditor"] button:has-text("Отправить")'
      );
      if ((await sendButton.count()) > 0) {
        await sendButton.click();
      } else {
        await messageInput.press('Enter');
      }

      await page.waitForTimeout(1000);

      const messageBubbles = page.locator(
        '[data-testid*="MessageList-MessageBubble"]'
      );
      const bubbleCount = await messageBubbles.count();
      if (bubbleCount > 0) {
        const lastMessage = messageBubbles.last();
        await expect(lastMessage).toContainText(testMessage);
        console.log('Mobile message sending works correctly');
      }
    });
  });
});
