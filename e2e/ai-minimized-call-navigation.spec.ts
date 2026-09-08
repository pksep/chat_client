import { expect, test } from '@playwright/test';

const AI_SESSION_ID = 'ai-minimized-call';

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
            title: 'Разговор с ИИ',
            description: 'Тест свёрнутого звонка',
            time: '10:00',
            messages: []
          }
        ],
        tasks: [],
        permissionMode: 'ask'
      })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => new Promise<MediaStream>(() => undefined)
      }
    });
  }, AI_SESSION_ID);
});

test('показывает обычный чат при свёрнутом голосовом разговоре с ИИ', async ({
  page
}, testInfo) => {
  await page.goto(`/ai/${AI_SESSION_ID}`);

  if (testInfo.project.name === 'chromium-mobile') {
    const stayInBrowserButton = page.getByRole('button', {
      name: 'Остаться в браузере'
    });
    await expect(stayInBrowserButton).toBeVisible({ timeout: 30_000 });
    await stayInBrowserButton.click();
  }

  await page.locator('.ai-assistant__voice-trigger:visible').click();
  const voiceDialog = page.getByRole('dialog', { name: 'Голосовой режим' });
  await expect(voiceDialog).toBeVisible();
  await voiceDialog
    .getByRole('button', { name: 'Свернуть разговор' })
    .click({ force: true });
  await expect(voiceDialog).toBeHidden();
  await expect(page.locator('.chat__header-active-call')).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState({}, '', '/dialogs/ordinary-topic');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await expect(page.locator('.chat--ai-route')).toHaveCount(0);
  await expect(page.locator('.ai-assistant')).toBeHidden();
  await expect(
    page.locator('[data-testid$="-MessageList-UserMessagesWrapper"]')
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-testid$="-MessageList-ContentEditor"]')
  ).toBeVisible();
  await expect(
    page.locator('.ai-assistant__permission-control:visible')
  ).toHaveCount(0);

  await page.locator('.chat__header-active-call').click({ force: true });
  await expect(voiceDialog).toBeVisible();
  await voiceDialog
    .getByRole('button', { name: 'Закрыть голосовой режим' })
    .click({ force: true });
});
