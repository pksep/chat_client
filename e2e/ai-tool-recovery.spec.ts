import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);
const unconfirmed =
  'Не удалось получить итоговый ответ. Перед повтором нужно проверить, какие действия уже выполнены.';
const error = {
  type: 'tool-error',
  payload: { toolName: 'board_projects_get', error: {} }
};

const prepare = async (page: Page, id: string) => {
  await page.addInitScript(sessionId => {
    const url = 'http://127.0.0.1:65530';
    const config = {
      CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
      CHAT_API_DOMAIN: url,
      CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
      CHAT_ERP_URL: 'http://127.0.0.1:5000'
    };
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([{ url, config }])
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
            title: 'Проверка результата',
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
};

const send = async (page: Page) => {
  const stay = page.getByRole('button', { name: 'Остаться в браузере' });
  if (await stay.isVisible().catch(() => false)) await stay.click();
  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator('[contenteditable="true"]').click();
  await page.keyboard.insertText('Создай доску основная и колонку бэклог');
  await editor.locator('.toolbar-button.right:visible').click();
};

const cases = [
  {
    name: 'не считает структурированную ошибку инструмента успешным результатом',
    events: [
      { type: 'text-delta', payload: { text: 'Создаю доску.' } },
      {
        type: 'tool-result',
        payload: { result: { isError: true, code: 'TOOL_RESULT_TOO_LARGE' } }
      },
      { type: 'finish' }
    ],
    expected: unconfirmed
  },
  {
    name: 'восстанавливается после ошибки шага и показывает итог',
    events: [
      error,
      {
        type: 'tool-result',
        payload: {
          toolName: 'board_actions_boards_create',
          result: { id: 1, title: 'основная' }
        }
      },
      {
        type: 'text-delta',
        payload: { text: 'Доска «основная» и колонка «бэклог» созданы.' }
      },
      { type: 'finish' }
    ],
    expected: 'Доска «основная» и колонка «бэклог» созданы.'
  },
  {
    name: 'показывает объяснение агента после ошибочных параметров',
    events: [
      error,
      { type: 'text-delta', payload: { text: 'Уточните название проекта.' } },
      { type: 'finish' }
    ],
    expected: 'Уточните название проекта.'
  },
  {
    name: 'не выдаёт предварительную фразу за итог после ошибки',
    events: [
      { type: 'text-delta', payload: { text: 'Создаю доску.' } },
      error,
      { type: 'finish' }
    ],
    expected: unconfirmed
  },
  {
    name: 'обрабатывает ошибку и EOF без завершающего события',
    events: [error],
    expected: unconfirmed
  },
  {
    name: 'не скрывает повторную ошибку после промежуточного текста',
    events: [
      error,
      { type: 'text-delta', payload: { text: 'Проверяю результат.' } },
      error,
      { type: 'finish' }
    ],
    expected: unconfirmed
  },
  {
    name: 'останавливает обработку после терминальной ошибки потока',
    events: [
      { type: 'error', payload: { message: 'Service unavailable' } },
      { type: 'text-delta', payload: { text: 'Поздний неверный успех.' } },
      { type: 'finish' }
    ],
    expected:
      'При обработке запроса произошла ошибка. Перед повторным действием проверьте, что уже выполнено. Если ошибка повторяется, обратитесь в поддержку.'
  }
];

for (const scenario of cases) {
  test(scenario.name, async ({ page }) => {
    const id = `ai-tool-recovery-${Date.now()}`;
    await prepare(page, id);
    await page.route('**/api/agents/generalAgent/stream*', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: scenario.events
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')
      })
    );
    await page.goto(`/ai/${id}`);
    await send(page);
    const message = page.locator(
      '.ai-assistant__message--assistant .message-content__html'
    );
    await expect(message).toHaveText(scenario.expected, { timeout: 30_000 });
    await expect(page.locator('.ai-assistant__thinking')).toBeHidden();
    await page.reload();
    await expect(message).toHaveText(scenario.expected, { timeout: 30_000 });
  });
}

test('после исправления шага сохраняет настоящее подтверждение', async ({
  page
}) => {
  const id = `ai-tool-approval-${Date.now()}`;
  await prepare(page, id);
  const events = [
    error,
    {
      type: 'tool-call-approval',
      runId: 'local-run',
      payload: {
        toolCallId: 'local-call',
        toolName: 'board_actions_boards_create',
        args: { projectId: 1, projectTitle: 'test', title: 'основная' }
      }
    },
    { type: 'finish' }
  ];
  await page.route('**/api/agents/generalAgent/stream*', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    })
  );
  await page.goto(`/ai/${id}`);
  await send(page);
  await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeVisible({
    timeout: 30_000
  });
  await expect(page.getByText(unconfirmed, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Подтвердить' })).toBeVisible({
    timeout: 30_000
  });
});
