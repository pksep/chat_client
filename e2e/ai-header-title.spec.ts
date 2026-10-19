import { expect, test, type Locator } from './fixtures/ai-history';

const FITTING_SESSION_ID = 'ai-title-fitting';
const OVERFLOWING_SESSION_ID = 'ai-title-overflowing';
const FITTING_TITLE = 'Commercial proposal';
const OVERFLOWING_TITLE = 'Very long AI chat title '.repeat(30).trim();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({
      fittingSessionId,
      fittingTitle,
      overflowingSessionId,
      overflowingTitle
    }) => {
      const organizationUrl = 'http://127.0.0.1:65530';
      const config = {
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
          user: { id: 'local-ui-test-user', name: 'Test' }
        })
      );
      localStorage.setItem(
        'sep:chat:ai-assistant:v1',
        JSON.stringify({
          sessions: [
            {
              id: fittingSessionId,
              title: fittingTitle,
              description: 'Test',
              time: '10:00',
              messages: []
            },
            {
              id: overflowingSessionId,
              title: overflowingTitle,
              description: 'Test',
              time: '10:00',
              messages: []
            }
          ],
          tasks: [],
          permissionMode: 'ask'
        })
      );
    },
    {
      fittingSessionId: FITTING_SESSION_ID,
      fittingTitle: FITTING_TITLE,
      overflowingSessionId: OVERFLOWING_SESSION_ID,
      overflowingTitle: OVERFLOWING_TITLE
    }
  );
});

const getOverflowState = async (title: Locator): Promise<boolean> =>
  title.evaluate((element: HTMLElement) => {
    const text = element.querySelector<HTMLElement>('.user-profile__title-text');
    return Boolean(
      element.scrollWidth > element.clientWidth + 1 ||
        (text && text.scrollWidth > text.clientWidth + 1)
    );
  });

test('показывает полное название или тултип только при переполнении', async ({
  page
}, testInfo) => {
  const dismissMobileDownloadModal = async (): Promise<void> => {
    if (testInfo.project.name !== 'chromium-mobile') return;

    const stayInBrowserButton = page.getByRole('button', {
      name: 'Остаться в браузере'
    });
    await expect(stayInBrowserButton).toBeVisible({ timeout: 30_000 });
    await stayInBrowserButton.click();
  };
  const titleTestId =
    'ChatContainer-ChatContainer-Header-Header-AIAssistantTitle';

  await page.goto(`/ai/${FITTING_SESSION_ID}`);
  await dismissMobileDownloadModal();
  const fittingTitle = page.getByTestId(titleTestId);
  await expect(fittingTitle).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => getOverflowState(fittingTitle)).toBe(false);
  await fittingTitle.hover();
  await expect(page.locator('.tooltip-yui-kit__hint_show')).toHaveCount(0);

  await page.goto(`/ai/${OVERFLOWING_SESSION_ID}`);
  await dismissMobileDownloadModal();
  const overflowingTitle = page.getByTestId(titleTestId);
  await expect(overflowingTitle).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => getOverflowState(overflowingTitle)).toBe(true);
  await overflowingTitle.hover();
  await expect(page.locator('.tooltip-yui-kit__hint_show')).toHaveText(
    OVERFLOWING_TITLE
  );
});
