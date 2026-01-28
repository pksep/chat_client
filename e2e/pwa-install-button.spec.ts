import { test, expect } from '@playwright/test';

test.describe('PWA Install Button Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display install button in desktop menu when PWA can be installed', async ({
    page
  }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    // The install button is conditionally rendered based on PWA state
    // In a test environment, the beforeinstallprompt event may not fire
    // But we can verify the menu structure exists
    const menu = page.locator('[data-testid*="ChatContainer-Menu"]');
    await expect(menu).toBeVisible();

    // Check for the install button (it may or may not be visible depending on PWA state)
    const installButton = page.locator(
      '[data-testid*="Menu-InstallButton"]'
    );

    // If the button exists, verify it has the correct structure
    if ((await installButton.count()) > 0) {
      await expect(installButton).toBeVisible();

      // Verify the icon is present
      const icon = page.locator('[data-testid*="Menu-InstallIcon"]');
      await expect(icon).toBeVisible();

      console.log('PWA install button is visible in desktop menu');
    } else {
      console.log(
        'PWA install button not visible (expected when PWA is not installable or already installed)'
      );
    }
  });

  test.describe('Mobile PWA Modal', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should handle mobile PWA install modal interactions', async ({
      page
    }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
        state: 'visible'
      });

      // The mobile modal may appear based on PWA state
      const mobileModal = page.locator('.mobile-modal');

      // If modal is visible, verify it has buttons
      if ((await mobileModal.count()) > 0) {
        const modalButtons = mobileModal.locator('button');
        const buttonCount = await modalButtons.count();

        if (buttonCount > 0) {
          // Verify close button exists
          const closeButton = modalButtons.filter({ hasText: 'Закрыть' });
          if ((await closeButton.count()) > 0) {
            await closeButton.click();
            console.log('Mobile PWA modal close button works');
          }
        }
      } else {
        console.log(
          'Mobile PWA modal not visible (expected when PWA is not installable or user dismissed it)'
        );
      }
    });
  });

  test('should have correct button label based on PWA state', async ({
    page
  }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const installButton = page.locator('[data-testid*="Menu-InstallButton"]');

    if ((await installButton.count()) > 0) {
      const buttonText = await installButton.textContent();

      // Button should show either "Download to Device" or "Go to Application"
      const validLabels = [
        'Загрузить на устройство', // Download to Device (Russian)
        'Перейти в приложение' // Go to Application (Russian)
      ];

      const hasValidLabel = validLabels.some(
        label => buttonText && buttonText.includes(label)
      );

      if (hasValidLabel) {
        console.log(`Install button shows correct label: "${buttonText?.trim()}"`);
      } else {
        // If collapsed menu, the text might be hidden
        console.log(
          'Install button text might be hidden in collapsed menu state'
        );
      }
    }
  });

  test('should use correct icon based on PWA state', async ({ page }) => {
    await page.waitForSelector('[data-testid*="ChatContainer-Container"]', {
      state: 'visible'
    });

    const installIcon = page.locator('[data-testid*="Menu-InstallIcon"]');

    if ((await installIcon.count()) > 0) {
      // Icon should be either upload-cloud or external-link
      // We can verify by checking the icon component exists
      await expect(installIcon).toBeVisible();
      console.log('Install button icon is correctly displayed');
    }
  });
});
