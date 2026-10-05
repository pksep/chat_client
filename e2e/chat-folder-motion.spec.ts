import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const area of ['rail', 'list']) {
    test(`Перемещение папок без переходов и изменения цветов: ${area}, ${theme}`, async ({
      page,
      isMobile
    }) => {
      await page.goto('/e2e/fixtures/chat-folder-loading.html');
      if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();
      await page
        .locator('body')
        .evaluate(element =>
          Promise.all(
            element.getAnimations().map(animation => animation.finished)
          )
        );
      await page.getByTestId('Fixture-Ready').click();
      const container = page.locator(
        area === 'rail'
          ? '.chat-folder-rail__items'
          : '.chat-folders-panel__list'
      );
      const items = container.locator('[data-folder-id]');
      const first = container.locator('[data-folder-id="folder-0"]');
      const avatarSelector =
        area === 'rail'
          ? '.chat-folder-rail__avatar'
          : '.chat-folders-panel__folder-icon';
      const color = await first.locator(avatarSelector).evaluate(element => ({
        background: getComputedStyle(element).backgroundColor,
        foreground: getComputedStyle(element).color
      }));
      const firstBox = (await first.boundingBox())!;
      const targetBox = (await items.last().boundingBox())!;
      const allBox = await page
        .getByTestId('ChatFolders-Rail-All')
        .boundingBox();
      const horizontal = area === 'rail' && isMobile;
      await container.evaluate(element => {
        (window as any).folderMoves = [];
        element.addEventListener('transitionrun', event => {
          const transition = event as TransitionEvent;
          if (transition.propertyName !== 'transform') return;
          const target = transition.target as Element;
          if (!target.classList.contains('chat-folder-sort-move')) return;
          const style = getComputedStyle(target);
          (window as any).folderMoves.push({
            property: style.transitionProperty,
            duration: style.transitionDuration
          });
        });
      });
      await page.mouse.move(
        firstBox.x + firstBox.width / 2,
        firstBox.y + firstBox.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        targetBox.x + targetBox.width / 2 + (horizontal ? 8 : 20),
        targetBox.y + targetBox.height / 2 + (horizontal ? 20 : 8),
        { steps: 4 }
      );
      const preview = page.locator('.chat-folder-drag-preview');
      await expect(preview).toBeVisible();
      expect(await page.evaluate(() => (window as any).folderMoves)).toEqual(
        []
      );
      await expect(first).toHaveCSS('transition-duration', '0s');
      await expect(first.locator(avatarSelector)).toHaveCSS(
        'transition-duration',
        '0s'
      );
      const previewBox = (await preview.boundingBox())!;
      expect(previewBox.width).toBeCloseTo(firstBox.width, 1);
      expect(previewBox.height).toBeCloseTo(firstBox.height, 1);
      expect(horizontal ? previewBox.y : previewBox.x).toBeCloseTo(
        horizontal ? firstBox.y : firstBox.x,
        1
      );
      await expect(preview).toHaveCSS('transition-duration', '0s');
      await expect(preview.locator(avatarSelector)).toHaveCSS(
        'background-color',
        color.background
      );
      await expect(preview.locator(avatarSelector)).toHaveCSS(
        'color',
        color.foreground
      );
      if (area === 'rail')
        await expect(first).toHaveAttribute('aria-pressed', 'true');
      expect(
        await page.getByTestId('ChatFolders-Rail-All').boundingBox()
      ).toEqual(allBox);
      expect(
        await items.evaluateAll(elements =>
          elements.map(e => e.getAttribute('data-folder-id'))
        )
      ).toEqual(['folder-1', 'folder-2', 'folder-0']);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(preview).toHaveCount(0);
      await expect(page.locator('dialog[open]')).toHaveCount(0);
    });
  }
}
