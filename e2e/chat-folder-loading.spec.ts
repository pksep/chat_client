import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`Скелетоны папок повторяют геометрию и тему: ${theme}`, async ({
    page,
    isMobile
  }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/e2e/fixtures/chat-folder-loading.html');
    if (theme === 'dark') await page.getByTestId('Fixture-Theme').click();

    const railSkeleton = page.getByTestId('ChatFolders-Rail-Skeleton-1');
    const rowSkeleton = page.getByTestId('ChatFolders-List-Skeleton-1');
    await expect(railSkeleton).toBeVisible();
    await expect(rowSkeleton).toBeVisible();
    await expect(page.getByTestId('ChatFolders-List-Skeleton')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expect(page.locator('[data-folder-id]')).toHaveCount(0);
    await expect(page.getByTestId('ChatFolders-Rail-All')).toBeVisible();
    await expect(page.getByTestId('ChatFolders-Rail-Manage')).toBeVisible();

    const railBox = await railSkeleton.boundingBox();
    const rowBox = await rowSkeleton.boundingBox();
    const railAvatarBox = await railSkeleton
      .locator('.chat-folder-rail__avatar')
      .boundingBox();
    const rowAvatarBox = await rowSkeleton
      .locator('.chat-folders-panel__folder-icon')
      .boundingBox();
    expect(railBox?.width).toBe(isMobile ? 84 : 70);
    expect(railBox?.height).toBe(isMobile ? 33 : 72);
    expect(rowBox?.height).toBe(isMobile ? 80 : 58);
    expect(railAvatarBox?.width).toBe(isMobile ? 14 : 38);
    expect(railAvatarBox?.height).toBe(isMobile ? 14 : 38);
    expect(rowAvatarBox?.width).toBe(isMobile ? 60 : 38);
    expect(rowAvatarBox?.height).toBe(isMobile ? 60 : 38);

    const animation = await railSkeleton
      .locator('.skeleton-block')
      .first()
      .evaluate(element => {
        const style = getComputedStyle(element);
        const animation = element
          .getAnimations()
          .find(
            item =>
              item instanceof CSSAnimation &&
              item.animationName === style.animationName
          );
        const rules = animation?.effect as KeyframeEffect;
        return {
          duration: style.animationDuration,
          colors: rules.getKeyframes().map(frame => frame.backgroundColor),
          start: style.getPropertyValue('--border-table').trim(),
          pulse: style.getPropertyValue('--action-disabled-bg').trim()
        };
      });
    expect(animation.duration).toBe('1.2s');
    expect(animation.colors[0]).toBe(animation.colors[2]);
    expect(animation.colors[0]).not.toBe(animation.colors[1]);
    expect(animation.start).toBeTruthy();
    expect(animation.pulse).toBeTruthy();

    await page.getByTestId('Fixture-Ready').click();
    await expect(railSkeleton).toHaveCount(0);
    await expect(rowSkeleton).toHaveCount(0);
    const loadedRailBox = await page
      .getByTestId('ChatFolders-Rail-Folder-folder-0')
      .boundingBox();
    if (isMobile) {
      expect(loadedRailBox?.height).toBe(railBox?.height);
      expect(loadedRailBox?.y).toBe(railBox?.y);
    } else expect(loadedRailBox).toEqual(railBox);
    expect(
      await page.getByTestId('ChatFolders-Folder-folder-0').boundingBox()
    ).toEqual(rowBox);
    expect(
      await page
        .getByTestId('ChatFolders-Folder-folder-0')
        .locator('.chat-folders-panel__folder-icon')
        .boundingBox()
    ).toEqual(rowAvatarBox);

    await page.getByTestId('Fixture-Refresh').click();
    await expect(page.locator('.skeleton-block')).toHaveCount(0);
    await expect(page.locator('[data-folder-id]')).toHaveCount(6);
    expect(errors).toEqual([]);
  });
}

test('Уменьшение анимации отключает пульсацию скелетонов', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/e2e/fixtures/chat-folder-loading.html');
  await expect(page.locator('.skeleton-block').first()).toHaveCSS(
    'animation-name',
    'none'
  );
});
