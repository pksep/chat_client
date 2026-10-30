import { expect, test } from '@playwright/test';

const avatarUrl =
  'https://sun9-1.userapi.com/avatar.png?signature=' + 'x'.repeat(1100);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWLsAAAAASUVORK5CYII=',
  'base64'
);

test('аватар восстанавливается после временного сбоя без изменения адреса', async ({
  page
}) => {
  let unavailable = true;
  await page.route('https://sun9-1.userapi.com/**', route =>
    unavailable
      ? route.abort('failed')
      : route.fulfill({ contentType: 'image/png', body: png })
  );
  await page.goto(
    '/e2e/fixtures/external-avatar.html?avatar=' + encodeURIComponent(avatarUrl)
  );
  await expect(
    page.locator('[data-testid="ExternalAvatar"] .avatar-yui-kit__text')
  ).toBeVisible();
  unavailable = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('[data-testid="ExternalAvatar"] img')).toHaveClass(
    /is-visible/
  );
});

test('обновление сессии сохраняет аватар, явное удаление и смена пользователя сбрасывают его', async ({
  page
}) => {
  await page.goto('/e2e/fixtures/external-avatar.html');
  const avatars = await page.evaluate(async () => {
    const path = '/src/composables/useAuth.ts';
    const { setAuthUser, getAuthUser, mergeAuthUser } = await import(
      /* @vite-ignore */ path
    );
    setAuthUser({
      id: 'avatar-owner',
      initials: 'Фото',
      avatarUrl: 'photo.png'
    });
    setAuthUser({ id: 'avatar-owner', initials: 'Фото' });
    mergeAuthUser({ avatarUrl: undefined });
    const preserved = getAuthUser().avatarUrl;
    setAuthUser({ id: 'avatar-owner', initials: 'Фото', avatarUrl: null });
    const removed = getAuthUser().avatarUrl;
    setAuthUser({ id: 'another-owner', initials: 'Другой' });
    return { preserved, removed, changed: getAuthUser().avatarUrl ?? null };
  });
  expect(avatars).toEqual({
    preserved: 'photo.png',
    removed: null,
    changed: null
  });
});

test('аватар ВК показывается, даже когда CDN запрещает загрузку через fetch', async ({
  page
}): Promise<void> => {
  const requests: string[] = [];
  await page.route('https://sun9-1.userapi.com/**', route => {
    requests.push(route.request().resourceType());
    expect(route.request().headers().authorization).toBeUndefined();

    const broken = route.request().url().includes('broken=1');

    return route.fulfill({
      status: broken ? 404 : 200,
      contentType: broken ? 'text/plain' : 'image/png',
      headers: { 'access-control-allow-origin': 'https://not-the-chat.test' },
      body: broken ? 'Изображение не найдено' : png
    });
  });
  await page.goto(
    '/e2e/fixtures/external-avatar.html?avatar=' + encodeURIComponent(avatarUrl)
  );
  const image = page.locator('[data-testid="ExternalAvatar"] img');
  await expect(image).toHaveAttribute('src', avatarUrl);
  await expect(image).toHaveClass(/is-visible/);
  expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(
    1
  );
  expect(requests.every(type => type === 'image')).toBe(true);
  const canFetch = await page.evaluate(
    async (url: string): Promise<boolean> => {
      try {
        await fetch(url, { credentials: 'include' });

        return true;
      } catch {
        return false;
      }
    },
    avatarUrl
  );
  expect(canFetch).toBe(false);
  await page.getByRole('button', { name: 'Недоступный аватар' }).click();
  await expect(
    page.locator('[data-testid="ExternalAvatar"] .avatar-yui-kit__text')
  ).toBeVisible();
  await page.getByRole('button', { name: 'Восстановить аватар' }).click();
  await expect(image).toHaveAttribute('src', avatarUrl);
  await expect(image).toHaveClass(/is-visible/);
});
