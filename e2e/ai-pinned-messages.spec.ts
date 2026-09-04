import { expect, test, type Locator, type Page } from '@playwright/test';

const SESSION_ID = 'ai-pinned-messages';
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
            title: 'Проверка закреплённых сообщений',
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

const pinMessage = async (page: Page, message: Locator) => {
  await message.click({ button: 'right' });
  const pinButton = page.getByRole('button', {
    name: 'Закрепить',
    exact: true
  });
  await expect(pinButton).toBeVisible();
  await pinButton.click();
};

const confirmUnpin = async (page: Page) => {
  await expect(
    page.getByText('Открепить сообщение', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Да', exact: true }).click();
};

test('показывает закреп и позволяет переходить между закреплёнными AI-сообщениями', async ({
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
          payload: { text: `Ответ ${responseNumber}` }
        },
        { type: 'finish' }
      ]
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .join('')
    });
  });

  await page.goto(`/ai/${SESSION_ID}`);
  await sendMessage(page, 'Первое важное сообщение', 2);
  await sendMessage(page, 'Второе обычное сообщение', 4);
  await sendMessage(page, 'Третье важное сообщение', 6);

  const userMessages = page.locator('.ai-assistant__message--user');
  const firstMessage = userMessages.nth(0);
  const thirdMessage = userMessages.nth(2);
  const pinnedPanel = page.getByTestId('AI-Assistant-PinnedMessage');

  await pinMessage(page, firstMessage);
  await expect(pinnedPanel).toContainText('Первое важное сообщение');
  await expect(
    firstMessage.locator('.ai-assistant__message-pin')
  ).toBeVisible();

  await pinMessage(page, thirdMessage);
  await expect(pinnedPanel).toContainText('Третье важное сообщение');
  await expect(
    thirdMessage.locator('.ai-assistant__message-pin')
  ).toBeVisible();

  await pinnedPanel.click();
  await expect(thirdMessage).toHaveClass(/highlighted/);
  await expect(pinnedPanel).toContainText('Первое важное сообщение');

  await pinnedPanel.click();
  await expect(firstMessage).toHaveClass(/highlighted/);
  await expect(pinnedPanel).toContainText('Третье важное сообщение');

  const isMobile = testInfo.project.name === 'chromium-mobile';
  if (isMobile) {
    await page.getByTestId(`${HEADER_TEST_ID}-PopoverIcon`).click();
    await page.getByRole('button', { name: 'Поиск в чате' }).click();
  } else {
    await page.getByTestId(`${HEADER_TEST_ID}-SearchIcon`).click();
  }

  const searchInputTestId = isMobile ? 'MobileSearchInput' : 'SearchInput';
  const searchCountTestId = isMobile ? 'MobileSearchCount' : 'SearchCount';
  const searchPreviousTestId = isMobile ? 'MobileSearchPrev' : 'SearchPrev';
  await page
    .getByTestId(`${HEADER_TEST_ID}-${searchInputTestId}`)
    .locator('input')
    .fill('важное');
  await expect(
    page.getByTestId(`${HEADER_TEST_ID}-${searchCountTestId}`)
  ).toHaveText('1 из 2');
  await page.getByTestId(`${HEADER_TEST_ID}-${searchPreviousTestId}`).click();
  await expect(firstMessage).toHaveClass(/highlighted/);

  await page.getByTestId('AI-Assistant-PinnedMessage-CloseButton').click();
  await confirmUnpin(page);
  await expect(pinnedPanel).toContainText('Первое важное сообщение');
  await expect(thirdMessage.locator('.ai-assistant__message-pin')).toHaveCount(
    0
  );

  await page.reload();
  await expect(pinnedPanel).toContainText('Первое важное сообщение', {
    timeout: 30_000
  });
  await expect(
    page
      .locator('.ai-assistant__message--user')
      .nth(0)
      .locator('.ai-assistant__message-pin')
  ).toBeVisible();

  await page.getByTestId('AI-Assistant-PinnedMessage-CloseButton').click();
  await confirmUnpin(page);
  await expect(pinnedPanel).toHaveCount(0);
});
