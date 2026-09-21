import { expect, test } from '@playwright/test';
import { openFixture, message } from './fixtures/topic-performance-page';

test('возврат активности не запускает второй HTTP из MessageList', async ({
  page
}) => {
  let visibilityUrl = '';
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/src/services/useAppVisibility.ts')
      visibilityUrl = request.url();
  });
  await page.clock.install();
  const { requests, errors } = await openFixture(page);
  await page.getByTestId('open-performance-1').click();
  await expect(message(page, 1)).toBeVisible();
  await page.waitForTimeout(500);
  expect(visibilityUrl).toBeTruthy();
  await page.evaluate(async url => {
    const visibility = await import(url);
    (window as any).testVisibility = visibility;
    visibility.ensureTauriWindowStateTracking();
  }, visibilityUrl);
  await page.clock.fastForward(121_000);
  const idle = await page.evaluate(() =>
    (window as any).testVisibility.getIsAppUserIdle()
  );
  expect(idle).toBe(true);
  const before = requests.length;
  await page.evaluate(() =>
    (window as any).testVisibility.markAppUserActivity()
  );
  await page.waitForTimeout(500);
  expect(
    requests.slice(before).filter(url => url.includes('/messages/'))
  ).toEqual([]);
  await expect(message(page, 1)).toBeVisible();
  expect(errors).toEqual([]);
});
