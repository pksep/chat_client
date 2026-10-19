import { expect, test } from './fixtures/ai-history';

test.setTimeout(90_000);

for (const lateError of [false, true]) {
  test(`очистка во время ответа не портит следующий диалог, поздняя ошибка: ${lateError}`, async ({
    page
  }) => {
    const id = `qa-history-clear-${Date.now()}`;
    await page.addInitScript(sessionId => {
      const url = 'http://127.0.0.1:65530';
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: true
      });
      localStorage.setItem(
        'chat_runtime_organizations',
        JSON.stringify([
          {
            url,
            config: {
              CHAT_API_DOMAIN: url,
              CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
              CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
              CHAT_ERP_URL: 'http://127.0.0.1:5000'
            }
          }
        ])
      );
      localStorage.setItem('chat_runtime_last_organization', url);
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
              title: 'История ответов',
              description: 'Тест',
              time: '10:00',
              messages: []
            }
          ],
          tasks: [],
          permissionMode: 'ask'
        })
      );
    }, id);
    await page.route('**/automations', route =>
      route.fulfill({ json: { automations: [] } })
    );
    await page.route('**/action-tasks/**', route =>
      route.fulfill({ json: { tasks: [] } })
    );
    let releaseOld!: () => void;
    let releaseNew!: () => void;
    const oldGate = new Promise<void>(resolve => {
      releaseOld = resolve;
    });
    const newGate = new Promise<void>(resolve => {
      releaseNew = resolve;
    });
    let requests = 0;
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      const current = ++requests;
      await (current === 1 ? oldGate : newGate);
      try {
        if (current === 1 && lateError) {
          await route.fulfill({
            status: 503,
            json: { userMessage: 'Запоздавшая ошибка прежнего запроса.' }
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'text/event-stream',
            body: [
              {
                type: 'text-delta',
                payload: {
                  text:
                    current === 1
                      ? 'Запоздавший старый ответ'
                      : 'Ответ на новый вопрос'
                }
              },
              { type: 'finish' }
            ]
              .map(event => `data: ${JSON.stringify(event)}\n\n`)
              .join('')
          });
        }
      } catch {
        /* Очистка штатно прерывает первый HTTP-запрос. */
      }
    });
    await page.goto(`/ai/${id}`);
    const editor = page.locator('.ai-assistant__editor');
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.locator('[contenteditable="true"]').fill('Старый вопрос');
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => requests).toBe(1);
    await page.locator('.chat__header__icon--more').click();
    await page
      .getByTestId(
        'ChatContainer-ChatContainer-Header-Header-ContextMenu-Очистить чат'
      )
      .click();
    await expect(page.locator('.ai-assistant__message--user')).toHaveCount(0);
    await editor.locator('[contenteditable="true"]').fill('Новый вопрос');
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => requests).toBe(2);
    releaseOld();
    releaseNew();
    await expect(
      page.locator('.ai-assistant__message .message-content__html')
    ).toHaveText(['Новый вопрос', 'Ответ на новый вопрос']);
    await page.reload();
    await expect(
      page.locator('.ai-assistant__message .message-content__html')
    ).toHaveText(['Новый вопрос', 'Ответ на новый вопрос']);
    expect(requests).toBe(2);
  });
}
