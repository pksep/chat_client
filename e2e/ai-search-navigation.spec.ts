import { expect, test, type Page } from '@playwright/test';

const SESSION_ID = 'ai-search-navigation';
const HEADER_TEST_ID = 'ChatContainer-ChatContainer-Header-Header';

test.setTimeout(90_000);

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
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });

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
            title: 'Проверка навигации поиска',
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

const sendMessage = async (page: Page, text: string, expectedCount: number) => {
  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator('[contenteditable="true"]').fill(text);
  await editor.locator('.toolbar-button.right:visible').click();
  await expect(page.locator('[data-message-id]')).toHaveCount(expectedCount);
};

test('переходит между найденными сообщениями в AI-чате', async ({
  page
}, testInfo) => {
  let responseNumber = 0;
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    responseNumber += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        {
          type: 'text-delta',
          payload: { text: `Ответ без совпадения ${responseNumber}` }
        },
        { type: 'finish' }
      ]
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .join('')
    });
  });

  await page.goto(`/ai/${SESSION_ID}`);
  await sendMessage(page, 'Первое сообщение про отгрузку', 2);
  await sendMessage(page, 'Второе сообщение про отгрузку', 4);
  await sendMessage(page, 'Третье сообщение про отгрузку', 6);
  await page.reload();
  await expect(page.locator('[data-message-id]')).toHaveCount(6, {
    timeout: 30_000
  });

  const isMobile = testInfo.project.name === 'chromium-mobile';
  if (isMobile) {
    await page.getByTestId(`${HEADER_TEST_ID}-PopoverIcon`).click();
    await page.getByRole('button', { name: 'Поиск в чате' }).click();
  } else {
    await page.getByTestId(`${HEADER_TEST_ID}-SearchIcon`).click();
  }

  const searchTestId = isMobile ? 'MobileSearchInput' : 'SearchInput';
  const countTestId = isMobile ? 'MobileSearchCount' : 'SearchCount';
  const previousTestId = isMobile ? 'MobileSearchPrev' : 'SearchPrev';
  const nextTestId = isMobile ? 'MobileSearchNext' : 'SearchNext';
  const search = page
    .getByTestId(`${HEADER_TEST_ID}-${searchTestId}`)
    .locator('input');
  await search.fill('отгрузку');

  const count = page.getByTestId(`${HEADER_TEST_ID}-${countTestId}`);
  const previous = page.getByTestId(`${HEADER_TEST_ID}-${previousTestId}`);
  const next = page.getByTestId(`${HEADER_TEST_ID}-${nextTestId}`);

  await expect(count).toHaveText('1 из 3');
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();

  const highlightedMessage = page.locator(
    '[data-message-id].ai-assistant__message.highlighted'
  );
  await expect(highlightedMessage).toHaveCount(1);
  const firstMessageId =
    await highlightedMessage.getAttribute('data-message-id');

  await previous.click();
  await expect(count).toHaveText('2 из 3');
  await expect(highlightedMessage).not.toHaveAttribute(
    'data-message-id',
    firstMessageId || ''
  );

  await previous.click();
  await expect(count).toHaveText('3 из 3');
  await expect(previous).toBeEnabled();
  await expect(next).toBeEnabled();

  await previous.click();
  await expect(count).toHaveText('1 из 3');

  await next.click();
  await expect(count).toHaveText('3 из 3');

  await next.click();
  await expect(count).toHaveText('2 из 3');

  await search.fill('Ответ без совпадения 2');
  await expect(count).toHaveText('1 из 1');
  await expect(previous).toHaveCount(0);
  await expect(next).toHaveCount(0);
});
