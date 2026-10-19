import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);
const first = 'qa-unsent-first',
  second = 'qa-unsent-second';
const quote = 'Предыдущий ответ для цитаты';
const editor = (page: Page) =>
  page.locator('.ai-assistant__editor [contenteditable="true"]:visible');
const navigate = (page: Page, sessionId: string) =>
  page.evaluate(async id => {
    const path = '/src/composables/useAiAssistant.ts';
    (await import(path)).useAiAssistant().selectSession(id);
  }, sessionId);
const textMessage = (id: string, content: string, role = 'assistant') => ({
  id,
  requestId: id,
  role,
  content,
  timestamp: Date.now(),
  attachments: [],
  outputAttachments: [],
  pendingToolApprovals: []
});
const snapshot = (messages: unknown[]) => ({
  protocol: 1,
  generation: 0,
  messages,
  tasks: [],
  incompleteMessages: [],
  nextCursor: null
});
const hold = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

for (const keyed of [false, true]) {
  test(`штатный редактор: изоляция вложений включается только явным ключом ${keyed}`, async ({
    page
  }) => {
    await page.goto(
      `/e2e/fixtures/content-editor-drafts.html?keyed=${Number(keyed)}`
    );
    await expect(page.locator('#one')).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'native-draft.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello')
    });
    await expect(page.locator('dialog.attach-modal-container')).toBeVisible();
    // Это публичные кнопки самого проверочного потребителя, не доступ к внутреннему состоянию Vue.
    await page
      .locator('#two')
      .evaluate((button: HTMLButtonElement) => button.click());
    if (keyed)
      await expect(page.locator('dialog.attach-modal-container')).toHaveCount(
        0
      );
    else
      await expect(page.locator('dialog.attach-modal-container')).toBeVisible();
    await page
      .locator('#one')
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(page.locator('dialog.attach-modal-container')).toBeVisible();
    await page.locator('.attach-modal button.primary-yui-kit.right').click();
    await expect(page.locator('#sent')).toHaveText('native-draft.txt');
    await expect(page.locator('dialog.attach-modal-container')).toHaveCount(0);
    await page.locator('#two').click();
    await page.locator('#one').click();
    await expect(page.locator('dialog.attach-modal-container')).toHaveCount(0);
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ first, second }) => {
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
          sessions: [first, second].map((id, index) => ({
            id,
            title: index ? 'Другой чат' : 'Исходный чат',
            description: 'Тест',
            time: '10:00',
            messages: []
          })),
          tasks: [],
          permissionMode: 'ask'
        })
      );
    },
    { first, second }
  );
});

async function open(page: Page) {
  await page.goto(`/ai/${first}`);
  await expect(
    page.locator('.ai-assistant__message--assistant').filter({ hasText: quote })
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
}
async function reply(page: Page) {
  await page
    .locator('.ai-assistant__message--assistant')
    .filter({ hasText: quote })
    .click({ button: 'right' });
  await page.getByRole('button', { name: 'Ответить', exact: true }).click();
}

test('отказ до отправки сохраняет новый ввод и цитату, голосовой вызов не получает старый ответ', async ({
  page
}) => {
  let unavailable = false,
    reads = 0,
    runs = 0;
  const delayed = hold();
  await page.route('**/conversations/**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/messages')) {
      if (unavailable) {
        reads++;
        await delayed.promise;
        return route.fulfill({
          status: 503,
          json: {
            code: 'AI_CONVERSATION_UNAVAILABLE',
            userMessage: 'Не удалось загрузить переписку.'
          }
        });
      }
      return route.fulfill({
        json: snapshot([textMessage('old-answer', quote)])
      });
    }
    return route.fulfill({
      json: { generation: 0, deleted: false, protocol: 1 }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    runs++;
    await route.abort();
  });
  await open(page);
  await reply(page);
  await editor(page).fill('Неотправленный текст');
  unavailable = true;
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect.poll(() => reads).toBe(1);
  await expect(editor(page)).toHaveText('Неотправленный текст');
  await editor(page).fill('Новый черновик во время ожидания');
  delayed.resolve();
  await expect(
    page.getByText('Не удалось загрузить переписку.', { exact: true }).first()
  ).toBeVisible();
  await expect(editor(page)).toHaveText('Новый черновик во время ожидания');
  await expect(
    page.locator('.ai-assistant__editor .chat__input__action')
  ).toContainText(quote);
  const result = await page.evaluate(async () => {
    const path = '/src/composables/useAiAssistant.ts';
    return (await import(path))
      .useAiAssistant()
      .sendMessage('Голосовой запрос при отказе');
  });
  expect(result).toBeNull();
  expect(runs).toBe(0);
  await expect(page.locator('.ai-assistant__message--user')).toHaveCount(0);
});

test('отложенный автофокус не снимает выделение пользователя при редактировании', async ({
  page
}) => {
  await page.route('**/conversations/**', route =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/messages')
        ? snapshot([
            textMessage('editable-user', 'Редактируемый текст', 'user'),
            textMessage('old-answer', quote)
          ])
        : { generation: 0, deleted: false, protocol: 1 }
    })
  );
  await open(page);
  await page.locator('.ai-assistant__message--user').click({ button: 'right' });
  await page.evaluate(() => {
    const schedule = window.requestAnimationFrame.bind(window);
    const cancel = window.cancelAnimationFrame.bind(window);
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = -1;
    window.requestAnimationFrame = callback => {
      const id = sequence--;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = id => {
      if (!frames.delete(id)) cancel(id);
    };
    Object.assign(window, {
      releaseQaFocusFrames: () => {
        window.requestAnimationFrame = schedule;
        window.cancelAnimationFrame = cancel;
        for (const callback of frames.values()) callback(performance.now());
        frames.clear();
      }
    });
  });
  // Кнопка уже видна в открытом меню; намеренно удерживаем браузерные кадры автофокуса.
  await page
    .getByRole('button', { name: 'Редактировать', exact: true })
    .click({ force: true });
  await expect(editor(page)).toHaveText('Редактируемый текст');
  await editor(page).focus();
  await page.keyboard.press('ControlOrMeta+A');
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('Редактируемый текст');
  await page.evaluate(() => {
    (
      window as unknown as { releaseQaFocusFrames: () => void }
    ).releaseQaFocusFrames();
  });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe('Редактируемый текст');
  await page.keyboard.insertText('Только новый текст');
  await expect(editor(page)).toHaveText('Только новый текст');
});

test('откат первой записи сохраняет черновик и не оставляет дубль при повторной отправке', async ({
  page
}) => {
  let runs = 0;
  await page.route('**/api/agents/generalAgent/stream*', route => {
    runs++;
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Ответ после восстановления записи"}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  await page.goto(`/ai/${first}`);
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await editor(page).fill('Запрос с отказом записи');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let aborted = false;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      const value = args[0];
      if (
        value.messages?.some(
          (message: { content: string }) =>
            message.content === 'Запрос с отказом записи'
        )
      ) {
        document.documentElement.dataset.qaSubmissionWrites = String(++writes);
        if (!aborted) {
          aborted = true;
          const transaction = this.transaction;
          request.addEventListener('success', () => transaction.abort(), {
            once: true
          });
        }
      }
      return request;
    };
  });
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect(
    page
      .getByText('Не удалось сохранить историю чата.', { exact: true })
      .first()
  ).toBeVisible();
  await expect(editor(page)).toHaveText('Запрос с отказом записи');
  await expect(page.locator('.ai-assistant__message--user')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute(
    'data-qa-submission-writes',
    '1'
  );
  expect(runs).toBe(0);
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect(
    page
      .locator('.ai-assistant__message--assistant')
      .filter({ hasText: 'Ответ после восстановления записи' })
  ).toBeVisible();
  await expect(editor(page)).toHaveText('');
  await expect(page.locator('.ai-assistant__message--user')).toHaveCount(1);
  expect(runs).toBe(1);
});

test('принятое сообщение очищает редактор до ответа, поздний ответ не стирает следующий черновик', async ({
  page
}) => {
  const delayed = hold();
  let runs = 0;
  const saved = [textMessage('old-answer', quote)];
  await page.route('**/conversations/**', route =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/messages')
        ? snapshot(saved)
        : { generation: 0, deleted: false, protocol: 1 }
    })
  );
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    runs++;
    const body = route.request().postDataJSON();
    expect(body.messages).toEqual([
      { role: 'user', content: 'Отправляемый текст' }
    ]);
    await delayed.promise;
    saved.push({
      ...textMessage('new-user', 'Отправляемый текст', 'user'),
      requestId: body.requestContext.requestId
    });
    saved.push({
      ...textMessage('new-answer', 'Ответ текущего запроса'),
      requestId: body.requestContext.requestId
    });
    await route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Ответ текущего запроса"}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  await open(page);
  await editor(page).fill('Отправляемый текст');
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect.poll(() => runs).toBe(1);
  await expect(editor(page)).toHaveText('');
  await editor(page).fill('Следующий черновик');
  delayed.resolve();
  await expect(
    page
      .locator('.ai-assistant__message--assistant')
      .filter({ hasText: 'Ответ текущего запроса' })
  ).toBeVisible();
  await expect(editor(page)).toHaveText('Следующий черновик');
  expect(runs).toBe(1);
});

for (const kind of ['chat', 'task'] as const) {
  test(`первое сообщение создаёт ${kind} без потери следующего черновика и смены раздела`, async ({
    page
  }) => {
    const delayed = hold();
    let runs = 0;
    let submittedThread = '';
    const initialized = new Set([first, second]);
    let initializations = 0;
    const saved = new Map<string, ReturnType<typeof textMessage>[]>([
      [first, [textMessage('old-answer', quote)]]
    ]);
    await page.route('**/conversations/**', route => {
      const path = new URL(route.request().url()).pathname.split('/');
      const id = decodeURIComponent(path[path.indexOf('conversations') + 1]);
      if (path.at(-1) === 'initialize') {
        expect(route.request().method()).toBe('POST');
        expect(route.request().postDataJSON()).toEqual({ generation: 0 });
        expect([first, second]).not.toContain(id);
        initialized.add(id);
        initializations++;
        return route.fulfill({
          json: { generation: 0, deleted: false, protocol: 1 }
        });
      }
      return route.fulfill({
        json:
          path.at(-1) === 'messages'
            ? snapshot(saved.get(id) ?? [])
            : {
                generation: 0,
                deleted: false,
                protocol: initialized.has(id) ? 1 : 0
              }
      });
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      runs++;
      const body = route.request().postDataJSON();
      submittedThread = body.memory.thread;
      expect(initializations).toBe(1);
      expect(body.requestContext.conversationProtocol).toBe(1);
      expect(body.messages).toEqual([
        { role: 'user', content: 'Первое поручение' }
      ]);
      await delayed.promise;
      saved.set(submittedThread, [
        {
          ...textMessage('created-user', 'Первое поручение', 'user'),
          requestId: body.requestContext.requestId
        },
        {
          ...textMessage('created-answer', 'Ответ нового диалога'),
          requestId: body.requestContext.requestId
        }
      ]);
      await route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"type":"text-delta","payload":{"text":"Ответ нового диалога"}}\n\ndata: {"type":"finish"}\n\n'
      });
    });
    await open(page);
    await page.evaluate(async value => {
      const path = '/src/composables/useAiAssistant.ts';
      const api = (await import(path)).useAiAssistant();
      if (value === 'task') api.startNewTask();
      else api.startNewSession();
    }, kind);
    await editor(page).fill('Первое поручение');
    await page
      .locator('.ai-assistant__editor .toolbar-button.right:visible')
      .click();
    await expect.poll(() => runs).toBe(1);
    expect(submittedThread).not.toBe(first);
    expect(submittedThread).not.toBe(second);
    expect(submittedThread).not.toBe('');
    await expect(editor(page)).toHaveText('');
    await editor(page).fill('Следующий черновик нового диалога');
    delayed.resolve();
    await expect(
      page
        .locator('.ai-assistant__message--assistant')
        .filter({ hasText: 'Ответ нового диалога' })
    ).toBeVisible();
    await navigate(page, second);
    await expect(editor(page)).toHaveText('');
    await navigate(page, submittedThread);
    await expect(editor(page)).toHaveText('Следующий черновик нового диалога');
    const context = await page.evaluate(async () => {
      const path = '/src/composables/useAiAssistant.ts';
      const api = (await import(path)).useAiAssistant();
      return { tab: api.activeTab.value, kind: api.activeSession.value?.kind };
    });
    expect(context).toEqual({ tab: kind === 'task' ? 'tasks' : 'chats', kind });
    expect(runs).toBe(1);
  });
}

test('отказ начала нового чата сохраняет черновик и запрещает отправку по старому протоколу', async ({
  page
}) => {
  let available = false,
    runs = 0,
    initializations = 0;
  const initialized = new Set([first, second]);
  await page.route('**/conversations/**', route => {
    const path = new URL(route.request().url()).pathname.split('/');
    const id = path[path.indexOf('conversations') + 1];
    if (path.at(-1) === 'initialize') {
      initializations++;
      if (!available)
        return route.fulfill({
          status: 503,
          json: {
            code: 'AI_CONVERSATION_UNAVAILABLE',
            userMessage:
              'Не удалось начать сохранение переписки. Попробуйте позже.'
          }
        });
      initialized.add(id);
    }
    return route.fulfill({
      json:
        path.at(-1) === 'messages'
          ? snapshot(id === first ? [textMessage('old-answer', quote)] : [])
          : {
              generation: 0,
              deleted: false,
              protocol: initialized.has(id) ? 1 : 0
            }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', route => {
    runs++;
    expect(
      route.request().postDataJSON().requestContext.conversationProtocol
    ).toBe(1);
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Ответ после восстановления"}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  await open(page);
  await page.evaluate(async () => {
    const path = '/src/composables/useAiAssistant.ts';
    (await import(path)).useAiAssistant().startNewSession();
  });
  await editor(page).fill('Не потерять первое сообщение');
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect(
    page
      .getByText('Не удалось начать сохранение переписки. Попробуйте позже.', {
        exact: true
      })
      .first()
  ).toBeVisible();
  expect(initializations).toBeGreaterThan(0);
  expect(runs).toBe(0);
  await expect(editor(page)).toHaveText('Не потерять первое сообщение');
  available = true;
  await page
    .locator('.ai-assistant__editor .toolbar-button.right:visible')
    .click();
  await expect.poll(() => runs).toBe(1);
  await expect(editor(page)).toHaveText('');
});

for (const networkFailure of [false, true]) {
  test(`отказ загрузки сохраняет файл в исходном черновике, сетевой отказ: ${networkFailure}`, async ({
    page
  }) => {
    const delayed = hold();
    let targets = 0,
      runs = 0,
      uploadAllowed = false;
    const attachment = {
      attachmentId: crypto.randomUUID(),
      contentHash: 'a'.repeat(64),
      name: 'неотправленный.txt',
      size: 5,
      contentType: 'text/plain',
      transferToken: 't'.repeat(80),
      expiresAt: Date.now() + 600_000
    };
    const saved = [textMessage('old-answer', quote)];
    await page.route('**/conversations/**', route =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/messages')
          ? snapshot(saved)
          : { generation: 0, deleted: false, protocol: 1 }
      })
    );
    await page.route('**/media/ai-attachments/upload-target', async route => {
      targets++;
      if (!uploadAllowed) {
        await delayed.promise;
        if (networkFailure) return route.abort('connectionrefused');
        return route.fulfill({
          status: 503,
          json: { message: 'Не удалось подготовить загрузку файла.' }
        });
      }
      return route.fulfill({
        json: {
          uploadUrl: 'http://127.0.0.1:65530/media/encrypted-upload/qa-draft',
          attachmentToken: 'qa-stage'
        }
      });
    });
    await page.route('**/media/encrypted-upload/qa-draft', route =>
      route.fulfill({ status: 200, body: '' })
    );
    await page.route('**/media/ai-attachments/complete', route =>
      route.fulfill({ json: attachment })
    );
    await page.route('**/media/ai-attachments/refresh', route =>
      route.fulfill({ json: { attachments: [attachment] } })
    );
    await page.route('**/api/agents/generalAgent/stream*', route => {
      runs++;
      const body = route.request().postDataJSON();
      expect(body.memory.thread).toBe(first);
      expect(body.requestContext.attachments).toHaveLength(1);
      expect(body.requestContext.attachments[0].name).toBe(attachment.name);
      expect(body.requestContext.messagePresentation.replyTo.content).toBe(
        quote
      );
      return route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"type":"text-delta","payload":{"text":"Файл принят"}}\n\ndata: {"type":"finish"}\n\n'
      });
    });
    await open(page);
    await reply(page);
    await editor(page).fill('Текст с файлом');
    await page
      .locator('.ai-assistant__editor input[type="file"]:not([accept])')
      .setInputFiles({
        name: attachment.name,
        mimeType: 'text/plain',
        buffer: Buffer.from('hello')
      });
    await page.locator('.attach-modal button.primary-yui-kit.right').click();
    await expect.poll(() => targets).toBe(1);
    await navigate(page, second);
    await expect(editor(page)).toHaveText('');
    await editor(page).fill('Черновик другого чата');
    delayed.resolve();
    await expect(
      page
        .getByText(
          networkFailure
            ? 'Не удалось связаться с сервером файлов. Проверьте соединение и повторите отправку.'
            : 'Не удалось подготовить загрузку файла.',
          { exact: true }
        )
        .first()
    ).toBeVisible();
    await expect(editor(page)).toHaveText('Черновик другого чата');
    await expect(page.locator('dialog.attach-modal-container')).toHaveCount(0);
    await navigate(page, first);
    await expect(page.locator('dialog.attach-modal-container')).toBeVisible();
    await expect(
      page.locator('.attach-modal').getByText(attachment.name, { exact: true })
    ).toBeVisible();
    await expect(editor(page)).toHaveText('Текст с файлом');
    await navigate(page, second);
    await expect(page.locator('dialog.attach-modal-container')).toHaveCount(0);
    await expect(editor(page)).toHaveText('Черновик другого чата');
    await navigate(page, first);
    await expect(page.locator('dialog.attach-modal-container')).toBeVisible();
    uploadAllowed = true;
    await page.locator('.attach-modal button.primary-yui-kit.right').click();
    await expect.poll(() => runs).toBe(1);
    await expect(editor(page)).toHaveText('');
    expect(targets).toBe(2);
  });
}
