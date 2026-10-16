import { expect, test } from '@playwright/test';
import {
  hasExternalMessageChannel,
  latestManagerReplyContext,
  managerMessageChannel
} from '../src/utils/managerMessageChannel';

test('канал ответа определяется сообщением клиента, в том числе для Telegram и MAX', () => {
  for (const channel of ['telegram', 'max'] as const) {
    const ex = JSON.stringify({
      managerChannel: channel,
      managerReplyRouteId: `${channel}-route`
    });

    expect(managerMessageChannel(ex)).toBe(channel);
    expect(hasExternalMessageChannel(ex)).toBe(true);
    expect(
      latestManagerReplyContext(
        [
          {
            senderUserId: 'guest',
            ex: { managerChannel: 'widget', managerReplyRouteId: 'site-route' }
          },
          { senderUserId: 'guest', ex },
          {
            senderUserId: 'operator',
            ex: { managerChannel: 'vk', managerReplyRouteId: 'wrong-route' }
          }
        ],
        'guest'
      )
    ).toEqual({ routeId: `${channel}-route`, channel });
  }

  expect(managerMessageChannel({ managerChannel: 'unknown' })).toBe('');
  expect(hasExternalMessageChannel({ managerChannel: 'widget' })).toBe(false);
  expect(hasExternalMessageChannel({ managerChannel: 'vk' })).toBe(true);
  expect(hasExternalMessageChannel({ managerChannel: 'avito' })).toBe(true);
});

test('названия и значки ботов видимы на широком и узком экране', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/e2e/fixtures/manager-reuse.html', {
    waitUntil: 'domcontentloaded'
  });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });

    for (const channel of ['Telegram', 'MAX']) {
      const row = page.getByTestId(`bot-channel-${channel}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(channel);
      await expect(row.locator('svg, img')).toBeVisible();

      if (channel === 'MAX') {
        const icon = row.locator('img');

        await expect(icon).toHaveAttribute('src', /max-icon.*\.svg/);
        await expect(icon).toHaveJSProperty('complete', true);
        await expect(icon).toHaveJSProperty('naturalWidth', 100);
        await expect(icon).toHaveCSS('width', '24px');
        await expect(icon).toHaveCSS('height', '24px');
      }
    }

    await page.getByTestId('bot-channels').screenshot({
      path: testInfo.outputPath(`bot-channel-icons-${width}.png`)
    });
  }

  expect(errors).toEqual([]);
});
