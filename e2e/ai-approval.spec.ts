import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

const prepareAiSession = async (page: Page, sessionId: string) => {
  await page.addInitScript(id => {
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
            id,
            title: 'Проверка подтверждения',
            description: 'Тест',
            time: '10:00',
            messages: []
          }
        ],
        tasks: [],
        permissionMode: 'ask'
      })
    );
  }, sessionId);
};

const sendEditorMessage = async (page: Page, text: string) => {
  const stayInBrowser = page.getByRole('button', {
    name: 'Остаться в браузере'
  });
  if (await stayInBrowser.isVisible().catch(() => false)) {
    await stayInBrowser.click();
  }

  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator('[contenteditable="true"]').click();
  await page.keyboard.insertText(text);
  await editor.locator('.toolbar-button.right:visible').click();
};

test('восстанавливает подтверждение и принимает короткое «да»', async ({
  page
}) => {
  const sessionId = `ai-approval-restore-${Date.now()}`;
  const approvalRequests: unknown[] = [];
  let streamRequests = 0;
  await prepareAiSession(page, sessionId);

  await page.route('**/api/agents/generalAgent/stream*', async route => {
    streamRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        {
          type: 'tool-call-approval',
          runId: 'automation-run',
          payload: {
            toolCallId: 'automation-tool-call',
            toolName: 'automation_schedule_create',
            args: {
              title: 'Ежедневная сводка по задачам доски',
              task: 'Сформировать сводку по задачам всех доступных досок',
              recurrence: { kind: 'daily', times: ['08:00'] },
              timezone: 'Europe/Moscow'
            }
          }
        }
      ]
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .join('')
    });
  });
  await page.route(
    '**/api/agents/generalAgent/approve-tool-call**',
    async route => {
      approvalRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          { type: 'text-delta', payload: { text: 'Автоматизация настроена.' } },
          { type: 'finish' }
        ]
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')
      });
    }
  );

  await page.goto(`/ai/${sessionId}`);
  await sendEditorMessage(
    page,
    'Настрой ежедневную сводку по задачам доски в 8:00'
  );

  await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeVisible({
    timeout: 30_000
  });
  await expect(page.locator('.ai-assistant__thinking')).toBeHidden({
    timeout: 30_000
  });

  await sendEditorMessage(page, 'да');

  await expect.poll(() => approvalRequests.length, { timeout: 30_000 }).toBe(1);
  await expect(
    page.getByText('Автоматизация настроена.', { exact: true })
  ).toBeVisible({ timeout: 30_000 });
  expect(streamRequests).toBe(1);
  expect(approvalRequests).toHaveLength(1);
  expect(approvalRequests[0]).toMatchObject({
    runId: 'automation-run',
    toolCallId: 'automation-tool-call',
    requestContext: { responseMode: 'quick' }
  });
});

test('показывает ошибку инструмента вместо пустого сообщения', async ({
  page
}) => {
  const sessionId = `ai-tool-error-${Date.now()}`;
  await prepareAiSession(page, sessionId);

  await page.route('**/api/agents/generalAgent/stream*', async route => {
    const events = [
      {
        type: 'tool-error',
        payload: {
          toolName: 'automation_schedule_create',
          error: { message: 'Tool execution failed' }
        }
      },
      { type: 'finish' }
    ];
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    });
  });

  await page.goto(`/ai/${sessionId}`);
  await sendEditorMessage(page, 'Настрой ежедневную сводку');

  const assistantMessage = page.locator(
    '.ai-assistant__message--assistant .ai-assistant__message-body p'
  );
  await expect(assistantMessage).toHaveText(
    'Не удалось выполнить действие. Попробуйте ещё раз.'
  );
  await expect(assistantMessage).not.toHaveText('');
});

test('заменяет пустой завершённый поток понятным сообщением', async ({
  page
}) => {
  const sessionId = `ai-empty-finish-${Date.now()}`;
  await prepareAiSession(page, sessionId);

  await page.route('**/api/agents/generalAgent/stream*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"finish"}\n\n'
    });
  });

  await page.goto(`/ai/${sessionId}`);
  await sendEditorMessage(page, 'Покажи результат');

  const assistantMessage = page.locator(
    '.ai-assistant__message--assistant .ai-assistant__message-body p'
  );
  await expect(assistantMessage).toHaveText(
    'ИИ не вернул результат. Попробуйте повторить запрос.'
  );
  await expect(assistantMessage).not.toHaveText('');
});
