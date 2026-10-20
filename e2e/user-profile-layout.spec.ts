import { expect, test } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

test('имя в заголовке не смещается при появлении и обновлении присутствия', async ({
  page
}) => {
  await openFixture(page);
  await page.evaluate(async () => {
    const { mountUserProfileLayout } = await import(
      '/e2e/fixtures/user-profile-layout.ts'
    );
    (window as any).userProfileLayout = mountUserProfileLayout();
  });
  const title = page.locator('.chat__header-profile .user-profile__title-text');
  const status = page.locator('.chat__header-profile .user-profile__ex');
  await expect(title).toHaveText('Сотрудник');
  await expect(status).toBeEmpty();
  const original = (await title.boundingBox())!;

  for (const lastOnline of [
    null,
    new Date(Date.now() - 300_000).toISOString()
  ]) {
    await page.evaluate(lastOnline => {
      (window as any).userProfileLayout.setLastOnline(lastOnline);
    }, lastOnline);
    await expect(status).toContainText(
      lastOnline === null ? 'Онлайн' : 'назад'
    );
    const updated = (await title.boundingBox())!;
    expect({ x: updated.x, y: updated.y }).toEqual({
      x: original.x,
      y: original.y
    });
  }
});
