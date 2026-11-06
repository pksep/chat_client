import { expect, test } from '@playwright/test';

test.setTimeout(90_000);

for (const outgoing of [true, false]) {
  test(`Неотвеченный звонок: ${outgoing ? 'нет ответа у звонившего' : 'пропущенный у получателя'}`, async ({
    page
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname))
        return route.abort();
      if (url.pathname === '/call-history-api/messages/calls/history') {
        return route.fulfill({
          json: {
            data: [
              {
                id: 'unanswered',
                topicId: 'call-peer',
                topicType: 'DM',
                topicName: 'Иванов И.И.',
                senderUserId: 'call-history-user',
                text: '',
                ex: {
                  type: 'call',
                  call: {
                    event: 'end',
                    creatorId: outgoing ? 'call-history-user' : 'other-user',
                    wasAnswered: false,
                    direction: 'missed',
                    durationSec: 30
                  }
                },
                createdAt: new Date().toISOString()
              }
            ],
            meta: { currentPage: 1, totalItems: 1, totalPages: 1 }
          }
        });
      }
      if (url.pathname.startsWith('/call-history-api/')) {
        return route.fulfill({
          json: {
            data: [],
            meta: { currentPage: 1, totalItems: 0, totalPages: 1 }
          }
        });
      }
      return route.continue();
    });
    await page.goto('/e2e/fixtures/unanswered-call.html', {
      waitUntil: 'domcontentloaded'
    });
    await expect
      .poll(
        () =>
          page.evaluate(() => Boolean((window as any).unansweredCallFixture)),
        { timeout: 60_000 }
      )
      .toBe(true);
    const row = page.getByTestId('History-Item-unanswered');
    await expect(row).toBeVisible();
    await expect(row.locator('.calls-page__status')).toHaveText(
      outgoing ? 'Исходящий' : 'Пропущенный'
    );
    const bubble = page.getByTestId('CallBubble-Content');
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.message-call__title')).toHaveText(
      outgoing ? 'Исходящий' : 'Пропущенный'
    );
    const noAnswer = row.locator('.calls-page__no-answer');
    if (outgoing) {
      await expect(noAnswer).toHaveText('(нет ответа)');
      await expect(page.getByTestId('CallBubble-CallNoAnswer')).toHaveText(
        'Нет ответа'
      );
      await expect(row.locator('.message-call__icon--outgoing')).toBeVisible();
      await expect(row.locator('.message-call__icon--missed')).toHaveCount(0);
      const errorColor = await noAnswer.evaluate(element => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--error-color)';
        element.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      await expect(noAnswer).toHaveCSS('color', errorColor);
    } else {
      await expect(noAnswer).toHaveCount(0);
      await expect(row.locator('.message-call__icon--missed')).toBeVisible();
      await expect(page.getByTestId('CallBubble-CallNoAnswer')).toHaveCount(0);
    }
    await expect(page.getByTestId('CallBubble-CallDuration')).toHaveCount(0);
    const callsButton = page.getByTestId('CallNav-MenuBottomNav-Calls');
    await expect(callsButton).toBeVisible();
    const badge = callsButton.locator('.menu-bottom-nav__unread-count');
    if (outgoing) await expect(badge).toHaveCount(0);
    else await expect(badge).toHaveText('1');
    await row.screenshot({
      path: testInfo.outputPath(
        outgoing ? 'outgoing-no-answer.png' : 'incoming-missed.png'
      )
    });
    expect(errors).toEqual([]);
  });
}
