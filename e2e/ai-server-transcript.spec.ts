import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);
const seed = async (page: Page, id: string) => {
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
            title: 'Серверная переписка',
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
const file = {
  id: 'qa-report',
  name: 'Проверочный отчёт.xlsx',
  size: 20,
  contentType: 'application/octet-stream',
  path: 'qa/report.xlsx'
};
const message = (id: string, role: string, content: string) => ({
  id,
  requestId: 'original-request',
  role,
  content,
  timestamp: Date.now(),
  attachments: [],
  outputAttachments: [],
  pendingToolApprovals: []
});
const snapshot = (messages: unknown[], tasks: unknown[] = []) => ({
  protocol: 1,
  generation: 0,
  messages,
  tasks,
  incompleteMessages: [],
  nextCursor: null
});
const answer = (page: Page, text: string) =>
  page
    .locator(
      '[data-testid^="AI-Assistant-Message-"][data-testid$="-MessageText"]'
    )
    .filter({ hasText: text });

test('ошибки трёх запросов остаются после своих вопросов при обновлении истории и перезагрузке', async ({
  page
}) => {
  const id = `qa-failed-message-order-${Date.now()}`;
  await seed(page, id);
  const stored: ReturnType<typeof message>[] = [];
  let runs = 0;

  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'local-ui-test-user',
        erpUserId: null,
        erpRoleId: null,
        access: { client: false, ai: true },
        effective: { client: false, ai: true }
      }
    })
  );
  await page.route('**/conversations/**', async route => {
    const path = new URL(route.request().url()).pathname;

    return route.fulfill({
      json: path.endsWith('/messages')
        ? snapshot(stored)
        : { generation: 0, deleted: false, protocol: 1 }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    const body = route.request().postDataJSON();
    const input = body.messages.at(-1);

    expect(input.role).toBe('user');
    expect(typeof body.requestContext.requestId).toBe('string');
    const requestId = body.requestContext.requestId;

    // Повтор транспорта не создаёт второй вопрос с тем же ID запроса.
    if (!stored.some(item => item.requestId === requestId)) {
      stored.push({
        ...message(`saved-user-${runs}`, 'user', input.content),
        requestId
      });
      runs += 1;
    }

    return route.fulfill({
      status: 500,
      json: { error: 'QA provider failure' }
    });
  });
  await page.goto(`/ai/${id}`);
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  const editor = page.locator('.ai-assistant__editor');
  const bubbles = page.locator('.ai-assistant__message');
  const questions = ['Первый вопрос', 'Второй вопрос', 'Третий вопрос'];

  for (const [index, question] of questions.entries()) {
    await editor.locator('[contenteditable="true"]').fill(question);
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => runs).toBe(index + 1);
    await expect(bubbles).toHaveCount((index + 1) * 2, { timeout: 15_000 });

    for (let position = 0; position <= index; position += 1) {
      await expect(bubbles.nth(position * 2)).toContainText(
        questions[position]
      );
      await expect(bubbles.nth(position * 2 + 1)).toContainText(
        'При обработке запроса произошла ошибка'
      );
    }
  }

  await page.reload();
  await expect(bubbles).toHaveCount(6);

  for (const [index, question] of questions.entries()) {
    await expect(bubbles.nth(index * 2)).toContainText(question);
    await expect(bubbles.nth(index * 2 + 1)).toContainText(
      'При обработке запроса произошла ошибка'
    );
  }

  expect(runs).toBe(3);
});

for (const localProtocol of [0, 1] as const) {
  test(`переход истории сохраняет прежние сообщения и файлы при отказе второй страницы, старый протокол ${localProtocol}`, async ({
    page
  }) => {
    const id = `qa-history-transition-${localProtocol}-${Date.now()}`;
    await seed(page, id);
    let generation = 0,
      recover = false,
      failures = 0,
      runs = 0;
    const quote = { role: 'assistant', content: 'Сохранённая цитата' };
    await page.route('**/conversations/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/messages')) {
        if (
          generation === 1 &&
          url.searchParams.get('after') === '42' &&
          !recover
        ) {
          failures++;
          return route.fulfill({
            status: 503,
            json: {
              code: 'AI_CONVERSATION_UNAVAILABLE',
              userMessage: 'Не удалось загрузить следующую часть переписки.'
            }
          });
        }
        const secondPage = url.searchParams.get('after') === '42';
        return route.fulfill({
          json: {
            ...snapshot(
              secondPage
                ? [
                    message(
                      'new-answer',
                      'assistant',
                      'Полностью восстановленный ответ'
                    )
                  ]
                : [
                    {
                      ...message(
                        generation ? 'new-user' : 'old-user',
                        'user',
                        generation ? 'Новый вопрос' : 'Сохранённый вопрос'
                      ),
                      presentationVersion: 1,
                      replyTo: quote
                    },
                    {
                      ...message(
                        generation ? 'new-file' : 'old-answer',
                        'assistant',
                        generation ? 'Файл новой истории' : 'Сохранённый ответ'
                      ),
                      outputAttachments: [file]
                    }
                  ]
            ),
            generation,
            nextCursor: generation === 1 && !secondPage ? 42 : null
          }
        });
      }
      return route.fulfill({
        json: { generation, deleted: false, protocol: 1 }
      });
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      runs++;
      await route.fulfill({
        status: 500,
        body: 'Запрос не должен запускаться до загрузки истории'
      });
    });
    await page.goto(`/ai/${id}`);
    await expect(answer(page, 'Сохранённый ответ')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    const readCache = () =>
      page.evaluate(
        sessionId =>
          new Promise<any>((resolve, reject) => {
            const request = indexedDB.open('chat-messages-db', 2);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction('messages', 'readonly');
              const entry = tx.objectStore('messages').get(sessionId);
              entry.onsuccess = () => resolve(entry.result);
              entry.onerror = () => reject(entry.error);
              tx.oncomplete = () => db.close();
            };
          }),
        id
      );
    await expect
      .poll(async () => (await readCache())?.messages?.length)
      .toBe(2);
    await page.evaluate(
      ({ sessionId, protocol }) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('chat-messages-db', 2);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            const entry = store.get(sessionId);
            entry.onsuccess = () =>
              store.put({ ...entry.result, conversationProtocol: protocol });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
          };
        }),
      { sessionId: id, protocol: localProtocol }
    );
    const before = await readCache();
    generation = 1;
    await page.reload();
    await expect.poll(() => failures).toBeGreaterThan(0);
    await expect(answer(page, 'Сохранённый ответ')).toBeVisible();
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    await expect(page.locator('.ai-assistant__message-reply')).toContainText(
      quote.content
    );
    expect(await readCache()).toEqual(before);
    const editor = page.locator('.ai-assistant__editor');
    await editor
      .locator('[contenteditable="true"]')
      .fill('Запрос при отказе истории');
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => failures).toBeGreaterThan(1);
    expect(runs).toBe(0);
    expect(await readCache()).toEqual(before);
    recover = true;
    await page.reload();
    await expect(answer(page, 'Полностью восстановленный ответ')).toBeVisible({
      timeout: 30_000
    });
    await expect(answer(page, 'Сохранённый ответ')).toHaveCount(0);
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await readCache())?.conversationGeneration)
      .toBe(1);
    expect((await readCache()).conversationProtocol).toBe(1);
    expect(runs).toBe(0);
  });
}

test('цитата сохраняется после отправки, перезагрузки и редактирования обычного сообщения', async ({
  page
}, testInfo) => {
  const id = `qa-server-quote-${Date.now()}`;
  await seed(page, id);
  const quote = { role: 'assistant', content: 'Фрагмент для ответа' };
  let generation = 0,
    currentText = '',
    requestId = '',
    runs = 0;
  await page.route('**/conversations/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/messages/mutate')) {
      const body = route.request().postDataJSON();
      expect(body.text).toBe('Исправленный ответ с цитатой');
      expect(body.messagePresentation).toEqual({
        displayText: body.text,
        replyTo: quote
      });
      currentText = body.text;
      requestId = body.operationId;
      generation = 1;
      return route.fulfill({
        json: { generation, deleted: false, protocol: 1 }
      });
    }
    if (path.endsWith('/messages'))
      return route.fulfill({
        json: {
          ...snapshot([
            {
              ...message('quote-source', 'assistant', quote.content),
              requestId: 'source-request'
            },
            ...(currentText
              ? [
                  {
                    ...message('quoted-user', 'user', currentText),
                    requestId,
                    presentationVersion: 1,
                    replyTo: quote
                  }
                ]
              : [])
          ]),
          generation
        }
      });
    return route.fulfill({ json: { generation, deleted: false, protocol: 1 } });
  });
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    const body = route.request().postDataJSON();
    const expected = runs ? 'Исправленный ответ с цитатой' : 'Ответ с цитатой';
    expect(body.messages).toEqual([{ role: 'user', content: expected }]);
    expect(body.requestContext.messagePresentation).toEqual({
      displayText: expected,
      replyTo: quote
    });
    if (runs) expect(body.requestContext.requestId).toBe(requestId);
    currentText = expected;
    requestId = body.requestContext.requestId;
    runs++;
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Принято"}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  await page.goto(`/ai/${id}`);
  await expect(answer(page, quote.content)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await page
    .locator('.ai-assistant__message--assistant')
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
  const editor = page.locator('.ai-assistant__editor');
  await editor.locator('[contenteditable="true"]').fill('Ответ с цитатой');
  await editor.locator('.toolbar-button.right:visible').click();
  const reference = page.locator(
    '.ai-assistant__message--user .ai-assistant__message-reply'
  );
  await expect(reference).toContainText(quote.content);
  await expect.poll(() => runs).toBe(1);
  await page.reload();
  await expect(reference).toContainText(quote.content, { timeout: 30_000 });
  await expect(answer(page, 'Ответ с цитатой')).not.toContainText(
    'Контекст ответа:'
  );
  await page.locator('.ai-assistant__message--user').click({ button: 'right' });
  await page
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click();
  await editor
    .locator('[contenteditable="true"]')
    .fill('Исправленный ответ с цитатой');
  await editor.locator('.toolbar-button.right:visible').click();
  await expect.poll(() => runs).toBe(2);
  await page.reload();
  await expect(answer(page, 'Исправленный ответ с цитатой')).toBeVisible({
    timeout: 30_000
  });
  await expect(reference).toHaveCount(1);
  await expect(reference).toContainText(quote.content);
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await page.screenshot({
    path: testInfo.outputPath('server-message-quote.png'),
    fullPage: true
  });
});

for (const failSave of [false, true]) {
  test(`редактирование сохраняет запрос до запуска ИИ, отказ записи: ${failSave}`, async ({
    page
  }) => {
    const id = `qa-server-edit-${Date.now()}`;
    await seed(page, id);
    let generation = 0,
      requestId = '',
      writes = 0,
      runs = 0,
      answered = false;
    await page.route('**/conversations/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/messages/mutate')) {
        writes++;
        const body = route.request().postDataJSON();
        expect(body).toMatchObject({
          generation: 0,
          action: 'edit',
          messageId: 'native-user',
          text: 'Исправленный вопрос',
          attachments: []
        });
        expect(runs).toBe(0);
        if (failSave)
          return route.fulfill({
            status: 503,
            json: {
              code: 'AI_HISTORY_MUTATION_INCOMPLETE',
              userMessage:
                'Исправление не сохранено. Прежний запрос остался в чате.'
            }
          });
        requestId = body.operationId;
        generation = 1;
        return route.fulfill({
          json: { generation, deleted: false, protocol: 1 }
        });
      }
      if (path.endsWith('/messages'))
        return route.fulfill({
          json: {
            ...snapshot(
              generation === 0
                ? [
                    message('native-user', 'user', 'Старый вопрос'),
                    message('native-answer', 'assistant', 'Прежний ответ')
                  ]
                : [
                    {
                      ...message('edited-user', 'user', 'Исправленный вопрос'),
                      requestId
                    },
                    ...(answered
                      ? [
                          {
                            ...message(
                              'edited-answer',
                              'assistant',
                              'Ответ на исправление'
                            ),
                            requestId
                          }
                        ]
                      : [])
                  ]
            ),
            generation
          }
        });
      return route.fulfill({
        json: { generation, deleted: false, protocol: 1 }
      });
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      const body = route.request().postDataJSON();
      expect(generation).toBe(1);
      expect(body.messages).toEqual([
        { role: 'user', content: 'Исправленный вопрос' }
      ]);
      expect(body.requestContext.requestId).toBe(requestId);
      expect(body.requestContext.conversationGeneration).toBe(1);
      runs++;
      answered = true;
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"type":"text-delta","payload":{"text":"Ответ на исправление"}}\n\ndata: {"type":"finish"}\n\n'
      });
    });
    await page.goto(`/ai/${id}`);
    await expect(answer(page, 'Старый вопрос')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    await page
      .locator('.ai-assistant__message--user')
      .click({ button: 'right' });
    await page
      .getByRole('button', { name: 'Редактировать', exact: true })
      .click();
    const editor = page.locator('.ai-assistant__editor');
    await editor
      .locator('[contenteditable="true"]')
      .fill('Исправленный вопрос');
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => writes).toBe(1);
    if (failSave) {
      await expect(
        page.getByText(
          'Исправление не сохранено. Прежний запрос остался в чате.',
          { exact: true }
        )
      ).toBeVisible();
      await expect(answer(page, 'Старый вопрос')).toBeVisible();
      await expect(answer(page, 'Прежний ответ')).toBeVisible();
      expect(runs).toBe(0);
    } else {
      await expect(answer(page, 'Ответ на исправление')).toBeVisible();
      await expect(answer(page, 'Старый вопрос')).toHaveCount(0);
      await expect(answer(page, 'Прежний ответ')).toHaveCount(0);
      await page.reload();
      await expect(answer(page, 'Ответ на исправление')).toBeVisible({
        timeout: 30_000
      });
      await expect(answer(page, 'Исправленный вопрос')).toHaveCount(1);
      expect(runs).toBe(1);
    }
  });
}

for (const failFirstRead of [false, true]) {
  test(`удаление через сервер сохраняет оставшийся ответ и файл после reload, отказ чтения: ${failFirstRead}`, async ({
    page
  }) => {
    const id = `qa-server-delete-${Date.now()}`;
    await seed(page, id);
    let generation = 0,
      failedRead = false;
    const operations: unknown[] = [];
    await page.route('**/conversations/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/messages/mutate')) {
        const input = route.request().postDataJSON();
        expect(input).toMatchObject({
          generation: 0,
          action: 'delete',
          messageIds: ['native-user']
        });
        expect(input.operationId).toMatch(/^[a-f0-9-]{36}$/);
        expect(route.request().headers().authorization).toBe(
          'Bearer local-ui-test'
        );
        if (operations.length) expect(input).toEqual(operations[0]);
        operations.push(input);
        generation = 1;
        return route.fulfill({
          json: { generation, deleted: false, protocol: 1 }
        });
      }
      if (path.endsWith('/messages')) {
        if (generation === 1 && failFirstRead && !failedRead) {
          failedRead = true;
          return route.fulfill({
            status: 503,
            json: {
              code: 'AI_CONVERSATION_UNAVAILABLE',
              userMessage: 'Не удалось загрузить обновлённую переписку.'
            }
          });
        }
        return route.fulfill({
          json: {
            ...snapshot([
              ...(generation === 0
                ? [message('native-user', 'user', 'Удаляемый вопрос')]
                : []),
              {
                ...message(
                  generation === 0 ? 'native-answer' : 'copied-answer',
                  'assistant',
                  'Оставшийся ответ'
                ),
                outputAttachments: [file]
              }
            ]),
            generation
          }
        });
      }
      return route.fulfill({
        json: { generation, deleted: false, protocol: 1 }
      });
    });
    await page.goto(`/ai/${id}`);
    await expect(answer(page, 'Удаляемый вопрос')).toBeVisible({
      timeout: 30_000
    });
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    const remove = async () => {
      await page
        .locator('.ai-assistant__message--user')
        .click({ button: 'right' });
      await page.getByRole('button', { name: 'Удалить', exact: true }).click();
      await expect(
        page.getByText('Удалить выбранные сообщения из истории AI-чата?', {
          exact: true
        })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Да', exact: true }).click();
    };
    await remove();
    if (failFirstRead) {
      await expect.poll(() => failedRead).toBe(true);
      await expect(
        page.getByText('Не удалось загрузить обновлённую переписку.', {
          exact: true
        })
      ).toBeVisible();
      await expect(answer(page, 'Удаляемый вопрос')).toBeVisible();
      await expect(answer(page, 'Оставшийся ответ')).toBeVisible();
      await remove();
    }
    await expect(answer(page, 'Удаляемый вопрос')).toHaveCount(0);
    await expect(answer(page, 'Оставшийся ответ')).toBeVisible();
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    await page.reload();
    await expect(answer(page, 'Оставшийся ответ')).toBeVisible({
      timeout: 30_000
    });
    await expect(answer(page, 'Удаляемый вопрос')).toHaveCount(0);
    await expect(page.getByText(file.name, { exact: true })).toBeVisible();
    expect(operations.length).toBe(failFirstRead ? 2 : 1);
  });
}

test('пустой браузер и перезагрузка восстанавливают обычное сообщение с файлом и шагами', async ({
  page
}) => {
  const id = `qa-server-history-${Date.now()}`;
  await seed(page, id);
  const task = {
    id: 'task',
    requestId: 'original-request',
    title: 'Проверка',
    revision: 1,
    version: 1,
    digest: 'a'.repeat(64),
    approved: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completed: 1,
    status: 'completed',
    steps: [
      {
        key: 'verify',
        title: 'Проверить сохранённую деталь',
        status: 'completed',
        dependencies: [],
        details: { toolName: 'qa_read', input: {} }
      }
    ]
  };
  const data = snapshot(
    [
      message('server-user', 'user', 'Исходный вопрос'),
      {
        ...message('server-answer', 'assistant', 'Восстановленный ответ'),
        outputAttachments: [file]
      }
    ],
    [task]
  );
  let reads = 0;
  await page.route('**/conversations/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/messages')) {
      reads++;
      return route.fulfill({ json: data });
    }
    return route.fulfill({
      json: { generation: 0, deleted: false, protocol: 1 }
    });
  });
  await page.goto(`/ai/${id}`);
  await expect(answer(page, 'Восстановленный ответ')).toBeVisible({
    timeout: 30_000
  });
  await expect(page.getByText(file.name, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Проверить сохранённую деталь', { exact: true })
  ).toBeVisible();
  const before = reads;
  await page.reload();
  await expect(answer(page, 'Восстановленный ответ')).toBeVisible({
    timeout: 30_000
  });
  await expect(page.getByText(file.name, { exact: true })).toBeVisible();
  await expect(
    page.getByText('Проверить сохранённую деталь', { exact: true })
  ).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(answer(page, 'Восстановленный ответ')).toHaveCount(1);
});

test('восстановленное подтверждение продолжает исходный запрос, старое решение после reload не возвращается', async ({
  page
}) => {
  const id = `qa-server-approval-${Date.now()}`;
  await seed(page, id);
  const approval = {
    runId: 'saved-run',
    toolCallId: 'saved-call',
    toolName: 'qa_write',
    args: { title: 'Деталь' }
  };
  let accepted = false;
  await page.route('**/conversations/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/messages'))
      return route.fulfill({
        json: snapshot([
          message('native-input', 'user', 'Создай деталь'),
          {
            ...message(
              'native-approval',
              'assistant',
              accepted ? 'Деталь создана' : ''
            ),
            pendingToolApprovals: accepted ? [] : [approval]
          }
        ])
      });
    return route.fulfill({
      json: { generation: 0, deleted: false, protocol: 1 }
    });
  });
  let calls = 0;
  await page.route(
    '**/api/agents/generalAgent/approve-tool-call',
    async route => {
      calls++;
      const body = route.request().postDataJSON();
      expect(body.runId).toBe(approval.runId);
      expect(body.requestContext.requestId).toBe('original-request');
      accepted = true;
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"type":"text-delta","payload":{"text":"Деталь создана"}}\n\ndata: {"type":"finish"}\n\n'
      });
    }
  );
  await page.goto(`/ai/${id}`);
  await expect(
    page.getByRole('button', { name: 'Подтвердить', exact: true })
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
  await expect(answer(page, 'Деталь создана')).toBeVisible();
  await page.reload();
  await expect(answer(page, 'Деталь создана')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Подтвердить', exact: true })
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test('закрепление и открепление сохраняются через сервер и переживают перезагрузку', async ({
  page
}, testInfo) => {
  const id = `qa-server-pin-${Date.now()}`;
  await seed(page, id);
  let pinned = false,
    pinVersion = 0,
    writes = 0;
  await page.route('**/conversations/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/messages/pin')) {
      const input = route.request().postDataJSON();
      expect(input).toEqual({
        generation: 0,
        id: 'native-answer',
        pinned: !pinned,
        expectedVersion: pinVersion
      });
      expect(route.request().headers().authorization).toBe(
        'Bearer local-ui-test'
      );
      pinned = input.pinned;
      pinVersion++;
      writes++;
      return route.fulfill({
        json: { id: 'native-answer', pinned, pinVersion }
      });
    }
    if (path.endsWith('/messages'))
      return route.fulfill({
        json: snapshot([
          {
            ...message('native-answer', 'assistant', 'Важный ответ'),
            pinned,
            pinVersion
          }
        ])
      });
    return route.fulfill({
      json: { generation: 0, deleted: false, protocol: 1 }
    });
  });
  await page.goto(`/ai/${id}`);
  await expect(answer(page, 'Важный ответ')).toBeVisible({ timeout: 30_000 });
  await page
    .locator('.ai-assistant__message--assistant')
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Закрепить', exact: true }).click();
  const panel = page.getByTestId('AI-Assistant-PinnedMessage');
  await expect(panel).toContainText('Важный ответ');
  await page.reload();
  await expect(panel).toContainText('Важный ответ', { timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await page.screenshot({
    path: testInfo.outputPath('server-pinned-message.png'),
    fullPage: true
  });
  await page
    .locator('.ai-assistant__message--assistant')
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Открепить', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(answer(page, 'Важный ответ')).toBeVisible({ timeout: 30_000 });
  await expect(panel).toHaveCount(0);
  expect(writes).toBe(2);
});
