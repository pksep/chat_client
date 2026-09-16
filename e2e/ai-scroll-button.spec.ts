import { expect, test } from './fixtures/ai-history';

const SESSION_ID = 'ai-scroll-button-check';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(sessionId => {
    const organizationUrl = 'http://127.0.0.1:65530';
    const config = {
      CHAT_AUTH_API: organizationUrl,
      CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
      CHAT_API_DOMAIN: organizationUrl,
      CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
      CHAT_ERP_URL: 'http://127.0.0.1:5000'
    };

    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([{ url: organizationUrl, config }])
    );
    localStorage.setItem('chat_runtime_last_organization', organizationUrl);
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-ui-test',
        user: { id: 'local-ui-test-user', name: 'Тест' }
      })
    );
    localStorage.setItem(
      'sep:chat:ai-assistant:v1',
      JSON.stringify({
        sessions: [
          {
            id: sessionId,
            title: 'Проверка прокрутки',
            description: 'Тест',
            time: '10:00',
            messages: []
          }
        ],
        tasks: [],
        permissionMode: 'ask'
      })
    );
  }, SESSION_ID);
});

test('показывает кнопку перехода вниз внутри AI-чата', async (
  { page },
  testInfo
) => {
  await page.goto(`/ai/${SESSION_ID}`);
  if (testInfo.project.name === 'chromium-mobile') {
    const stayInBrowserButton = page.getByRole('button', {
      name: 'Остаться в браузере'
    });
    await expect(stayInBrowserButton).toBeVisible({ timeout: 30_000 });
    await stayInBrowserButton.click();
  }

  const conversation = page.locator('.ai-assistant__conversation');
  await expect(conversation).toBeAttached({ timeout: 30_000 });
  await conversation.evaluate(element => {
    const filler = document.createElement('div');
    filler.style.cssText = 'height:3000px;flex:0 0 3000px;width:1px';
    element.appendChild(filler);
  });

  const scrollContainer = page.locator('.ai-assistant__scroll');
  await scrollContainer.evaluate(element => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });

  const button = page.getByTestId('AI-Assistant-ScrollToBottom');
  await expect(button).toHaveCount(0);

  await scrollContainer.evaluate(element => {
    element.scrollTop = Math.max(
      0,
      element.scrollHeight - element.clientHeight - 100
    );
    element.dispatchEvent(new Event('scroll'));
  });

  await expect(button).toBeVisible();
  const [buttonBox, scrollBox] = await Promise.all([
    button.boundingBox(),
    scrollContainer.boundingBox()
  ]);

  expect(buttonBox).not.toBeNull();
  expect(scrollBox).not.toBeNull();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(scrollBox!.y);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(
    scrollBox!.y + scrollBox!.height
  );

  await button.click();
  await expect
    .poll(() =>
      scrollContainer.evaluate(
        element =>
          element.scrollHeight - element.clientHeight - element.scrollTop
      )
    )
    .toBeLessThanOrEqual(1);
});
