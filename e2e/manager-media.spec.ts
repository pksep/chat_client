import { expect, test } from '@playwright/test';

const webp = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'base64'
);

test('входящее фото открывается в просмотрщике без публичного запроса', async ({
  page
}) => {
  const unauthorized: string[] = [];

  await page.route('**/media/object/manager-private/**', async route => {
    const token = route.request().headers().authorization;
    if (token !== 'Bearer fixture-manager') {
      unauthorized.push(route.request().url());
      await route.fulfill({
        status: 401,
        json: { error: 'Нужна авторизация' }
      });
      return;
    }

    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);
  await thumbnail.click();
  const image = page.locator('.slider-modal__image');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);
  expect(unauthorized).toEqual([]);
  const downloadEvent = page.waitForEvent('download');
  await page
    .locator('.slider-modal__sub-nav:last-child .slider-modal__side-button')
    .first()
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Фото.webp');
  expect(await download.failure()).toBeNull();
});

test('отказ доступа не открывает сохранённое фото в просмотрщике', async ({
  page
}) => {
  let allowed = true;
  let denied = 0;
  await page.route('**/media/object/manager-private/**', async route => {
    if (!allowed) {
      denied++;
      await route.fulfill({ status: 403 });
      return;
    }
    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  allowed = false;
  await thumbnail.click();
  await expect.poll(() => denied).toBe(1);
  await expect(thumbnail).not.toHaveAttribute('src', /^blob:/);
  await expect(page.locator('.slider-modal__image')).toHaveCount(0);
});

test('временный сбой не удаляет показанное фото, повторное открытие восстанавливается', async ({
  page
}) => {
  let unavailable = false;
  await page.route('**/media/object/manager-private/**', async route => {
    await route.fulfill(
      unavailable ? { status: 503 } : { contentType: 'image/webp', body: webp }
    );
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  const originalUrl = await thumbnail.getAttribute('src');
  unavailable = true;
  await page.getByRole('button', { name: 'Прогреть', exact: true }).click();
  await expect(page.getByTestId('warm-count')).toHaveText('1');
  await expect(thumbnail).toHaveAttribute('src', originalUrl!);
  unavailable = false;
  await thumbnail.click();
  await expect(page.locator('.slider-modal__image')).toHaveAttribute(
    'src',
    originalUrl!
  );
});

test('обновление токена восстанавливает фото без перезахода в чат', async ({
  page
}) => {
  const tokens: string[] = [];
  await page.route('**/media/object/manager-private/**', async route => {
    tokens.push(route.request().headers().authorization || '');
    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  const firstUrl = await thumbnail.getAttribute('src');
  await page.evaluate(async () => {
    const { setAuthToken } = await import('/src/composables/useLogin.ts');
    setAuthToken('fixture-manager');
  });
  await expect(thumbnail).toHaveAttribute('src', firstUrl!);
  await thumbnail.click();
  await expect(page.locator('.slider-modal__image')).toHaveAttribute(
    'src',
    firstUrl!
  );
  await page.evaluate(async () => {
    const { setAuthToken } = await import('/src/composables/useLogin.ts');
    setAuthToken('fixture-refreshed');
  });
  await expect
    .poll(() => tokens.includes('Bearer fixture-refreshed'))
    .toBe(true);
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  expect(await thumbnail.getAttribute('src')).not.toBe(firstUrl);
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1);
  await expect(page.locator('.slider-modal__image')).toHaveAttribute(
    'src',
    (await thumbnail.getAttribute('src'))!
  );
});

test('фото не сохраняется на диск и не переходит в другую учётную запись', async ({
  page
}) => {
  await page.route('**/media/object/manager-private/**', async route => {
    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  const previousUrl = await thumbnail.getAttribute('src');
  const stored = await page.evaluate(async () => {
    const cache = await import('/src/services/useMediaBlobCache.ts');
    return cache.loadCachedMediaObjectUrl(
      'manager-private/66aef580-b856-48b3-8636-68ac07cb2cbd'
    );
  });
  expect(stored).toBeNull();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(thumbnail).not.toHaveAttribute('src', /^blob:/);
  expect(
    await page.evaluate(async url => {
      return fetch(url!).then(
        () => true,
        () => false
      );
    }, previousUrl)
  ).toBe(false);
  await page.getByRole('button', { name: 'Другой пользователь' }).click();
  await page.getByRole('button', { name: 'Обновить историю' }).click();
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  expect(await thumbnail.getAttribute('src')).not.toBe(previousUrl);
});

test('поздняя загрузка после выхода не возвращает приватное фото', async ({
  page
}) => {
  let release: () => void = (): void => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  let started = false;
  await page.route('**/media/object/manager-private/**', async route => {
    started = true;
    await gate;
    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html', {
    waitUntil: 'domcontentloaded'
  });
  await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  const finished = page.waitForResponse('**/media/object/manager-private/**');
  release();
  await finished;
  await page.getByRole('button', { name: 'Прогреть', exact: true }).click();
  await expect(page.getByTestId('warm-count')).toHaveText('1');
  await expect(
    page.getByTestId('ManagerIncomingPhoto-Article').locator('img')
  ).not.toHaveAttribute('src', /^blob:/);
});

test('прогрев и обновление истории не отзывают используемый адрес фото', async ({
  page
}) => {
  let requests = 0;
  await page.route('**/media/object/manager-private/**', async route => {
    if (route.request().headers().authorization !== 'Bearer fixture-manager') {
      await route.fulfill({ status: 401 });
      return;
    }
    requests++;
    await route.fulfill({ contentType: 'image/webp', body: webp });
  });
  await page.goto('/e2e/fixtures/manager-media.html');
  const thumbnail = page
    .getByTestId('ManagerIncomingPhoto-Article')
    .locator('img');
  await expect(thumbnail).toHaveAttribute('src', /^blob:/);
  const firstUrl = await thumbnail.getAttribute('src');
  const initialRequests = requests;
  await page.clock.install();
  await page.getByRole('button', { name: 'Прогреть', exact: true }).click();
  await expect(page.getByTestId('warm-count')).toHaveText('1');
  expect(requests - initialRequests).toBe(1);
  await page.clock.fastForward(61000);
  expect(
    await page.evaluate(async url => {
      const image = new Image();
      image.src = url!;
      return image.decode().then(
        () => image.naturalWidth,
        () => 0
      );
    }, firstUrl)
  ).toBe(1);
  await page.getByRole('button', { name: 'Обновить историю' }).click();
  await expect(thumbnail).toHaveAttribute('src', firstUrl!);
});
