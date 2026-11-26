import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);

const prepareAiSession = async (
  page: Page,
  sessionId: string
): Promise<void> => {
  await page.addInitScript(id => {
    const organizationUrl = 'http://127.0.0.1:65530';
    const config = {
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

  // Пользователь известен заранее. Не читаем документ из обработчика запроса:
  // обновление страницы может уничтожить его контекст во время проверки доступа.
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        erpUserId: null,
        erpRoleId: null,
        access: { client: true, ai: true },
        effective: { client: true, ai: true }
      }
    })
  );
};

const sendEditorMessage = async (page: Page, text: string): Promise<void> => {
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
  const sendButton = editor.locator(
    'button.toolbar-button.right:visible, .toolbar-button.right:visible button'
  );
  await expect(sendButton).toBeEnabled({ timeout: 30000 });
  await sendButton.click();
};

for (const scenario of [
  {
    title: 'подтверждение времени задачи',
    toolName: 'board_actions_task_time_entries_create',
    args: {
      taskId: 42,
      taskTitle: 'Проверка чертежей',
      durationMinutes: 120,
      comment: 'Проверил размеры',
      idempotencyKey: 'private-time-key'
    },
    expected:
      'Записать по задаче «Проверка чертежей» фактически затраченное время: 120 мин., комментарий: «Проверил размеры»?'
  },
  {
    title: 'подтверждение атрибутов задачи',
    toolName: 'board_actions_task_attributes_update',
    args: {
      taskId: 42,
      taskTitle: 'Проверка чертежей',
      attributes: [
        {
          id: 'private-attribute-flag',
          name: 'Проверено',
          type: 'boolean',
          value: false
        },
        {
          id: 'private-attribute-number',
          name: 'Количество',
          type: 'number',
          value: 0
        }
      ],
      idempotencyKey: 'private-attribute-key'
    },
    expected:
      'Изменить атрибуты задачи «Проверка чертежей»: «Проверено»: нет; «Количество»: 0?'
  }
]) {
  test(scenario.title, async ({ page }): Promise<void> => {
    const sessionId = `ai-task-details-${scenario.toolName.replaceAll('_', '-')}-${Date.now()}`;
    let writes = 0;
    await prepareAiSession(page, sessionId);
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          type: 'tool-call-approval',
          runId: 'task-details-run',
          payload: {
            toolCallId: 'task-details-call',
            toolName: scenario.toolName,
            args: scenario.args
          }
        })}\n\n`
      });
    });
    await page.route(
      '**/api/agents/generalAgent/approve-tool-call**',
      async route => {
        writes += 1;
        expect(route.request().postDataJSON()).toMatchObject({
          runId: 'task-details-run',
          toolCallId: 'task-details-call'
        });
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: `data: ${JSON.stringify({ type: 'text-delta', payload: { text: 'Изменения проверены в задаче.' } })}\n\ndata: ${JSON.stringify({ type: 'finish' })}\n\n`
        });
      }
    );
    await page.goto(`/ai/${sessionId}`);
    await page
      .getByRole('button', { name: 'Проверка подтверждения Тест 10:00' })
      .click();
    await expect(
      page.getByRole('button', { name: /^Проверка подтверждения Новый чат/ })
    ).toBeVisible({ timeout: 30000 });
    await sendEditorMessage(page, scenario.title);
    await expect(
      page.getByText(scenario.expected, { exact: true })
    ).toBeVisible({ timeout: 30000 });
    expect(writes).toBe(0);
    await expect(page.getByText('private-', { exact: false })).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText(scenario.expected, { exact: true })
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect(
      page
        .locator('.ai-assistant__message--assistant .message-content__html')
        .filter({ hasText: 'Изменения проверены в задаче.' })
    ).toBeVisible({ timeout: 30000 });
    expect(writes).toBe(1);
  });
}

for (const { status, code, recover, userMessage } of [
  {
    status: 409,
    code: 'AI_APPROVAL_STALE',
    recover: true,
    userMessage: 'Подтверждение больше не действует.'
  },
  {
    status: 403,
    code: 'AI_REQUEST_403',
    recover: false,
    userMessage: 'Недостаточно прав для выполнения запроса.'
  },
  {
    status: 409,
    code: 'AI_REQUEST_ALREADY_ACCEPTED',
    recover: false,
    userMessage: 'Этот запрос уже принят. Повторный запуск остановлен.'
  },
  {
    status: 409,
    code: 'AI_REQUEST_CONFLICT',
    recover: false,
    userMessage: 'Этот запрос уже принят с другим решением.'
  }
]) {
  test(`устаревшее подтверждение восстанавливается только при разрешённом ответе сервера ${code}`, async ({
    page
  }) => {
    const sessionId = `ai-stale-policy-${code}-${Date.now()}`;
    await prepareAiSession(page, sessionId);
    const requests: Array<Record<string, any>> = [];
    let approvals = 0;
    const approval = (runId: string) => ({
      type: 'tool-call-approval',
      runId,
      payload: {
        toolCallId: `${runId}-call`,
        toolName: 'erp_actions_erp_entity_editor_create',
        args: {
          type: 'detal',
          entityName: 'Проверка',
          entityDesignation: 'Т-1'
        }
      }
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify(approval(requests.length === 1 ? 'old-run' : 'new-run'))}\n\n`
      });
    });
    await page.route(
      '**/api/agents/generalAgent/approve-tool-call**',
      async route => {
        approvals += 1;
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify({
            code,
            userMessage
          })
        });
      }
    );
    await page.goto(`/ai/${sessionId}`);
    await sendEditorMessage(page, 'Создай деталь Проверка Т-1');
    await expect(
      page.getByRole('button', { name: 'Подтвердить' })
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Подтвердить' }).click();
    if (recover) {
      await expect.poll(() => requests.length).toBe(2);
      expect(JSON.stringify(requests[1])).toContain(
        'Сначала проверь фактический результат'
      );
      expect(requests[1].requestContext.approvalMode).toBe('strict');
      expect(requests[1].requestContext.requestId).toBeTruthy();
      expect(requests[1].requestContext.requestId).not.toBe(
        requests[0].requestContext.requestId
      );
      await expect(
        page.getByRole('button', { name: 'Подтвердить' })
      ).toBeVisible();
    } else {
      await expect(
        page
          .locator('.ai-assistant__message--assistant .message-content__html')
          .filter({ hasText: userMessage })
      ).toBeVisible();
      expect(requests).toHaveLength(1);
    }
    expect(approvals).toBe(1);
  });
}

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
    '.ai-assistant__message--assistant .message-content__html'
  );
  await expect(assistantMessage).toHaveText(
    'Не удалось получить итоговый ответ. Перед повтором нужно проверить, какие действия уже выполнены.'
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
    '.ai-assistant__message--assistant .message-content__html'
  );
  await expect(assistantMessage).toHaveText(
    'ИИ не вернул результат. Попробуйте повторить запрос.'
  );
  await expect(assistantMessage).not.toHaveText('');
});
