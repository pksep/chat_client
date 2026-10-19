import { expect, test, type Page } from './fixtures/ai-history';

const sessionId = 'ai-attachment-limits';
const limitMessage =
  'В одном сообщении можно прикрепить не более 10 файлов. Выбрано: 11. Уберите лишние файлы и отправьте сообщение снова.';
test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(id => {
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
            id,
            title: 'Проверка вложений',
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
});

const openEditor = async (page: Page) => {
  await page.goto(`/ai/${sessionId}`);
  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  return editor;
};

const files = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, index) => ({
    name: `test-${index + offset}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('x')
  }));

test('11 файлов блокируются до загрузки, текст не теряется', async ({
  page
}) => {
  let uploads = 0,
    requests = 0;
  await page.route('**/media/ai-attachments/**', route => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/agents/generalAgent/stream*', route => {
    requests++;
    return route.abort();
  });
  const editor = await openEditor(page);
  await editor
    .locator('[contenteditable="true"]')
    .fill('Создай деталь Дрон вымышленный');
  await editor
    .locator('input[type="file"]:not([accept])')
    .setInputFiles(files(11));
  await expect(page.getByText(limitMessage, { exact: true })).toBeVisible();
  await expect(editor.locator('[contenteditable="true"]')).toHaveText(
    'Создай деталь Дрон вымышленный'
  );
  expect(uploads).toBe(0);
  expect(requests).toBe(0);
  await expect(page.locator('.ai-assistant__message--assistant')).toHaveCount(
    0
  );
});

test('сумма нескольких выборов также проверяется до загрузки', async ({
  page
}) => {
  let uploads = 0,
    requests = 0;
  await page.route('**/media/ai-attachments/**', route => {
    uploads++;
    return route.abort();
  });
  await page.route('**/api/agents/generalAgent/stream*', route => {
    requests++;
    return route.abort();
  });
  const editor = await openEditor(page);
  const input = editor.locator('input[type="file"]:not([accept])');
  await input.setInputFiles(files(6));
  await input.setInputFiles(files(5, 6));
  await page.locator('.attach-modal button.primary-yui-kit.right').click();
  await expect(page.getByText(limitMessage, { exact: true })).toBeVisible();
  expect(uploads).toBe(0);
  expect(requests).toBe(0);
});

test('10 файлов отправляются целиком', async ({ page }) => {
  const targets = new Map<string, any>();
  let uploaded = 0;
  let submitted: any;
  await page.route('**/media/ai-attachments/upload-target', route => {
    const payload = route.request().postDataJSON();
    const token = `stage-${targets.size}`;
    targets.set(token, payload);
    return route.fulfill({
      json: {
        uploadUrl: `http://127.0.0.1:65530/media/encrypted-upload/ai-attachments/${token}`,
        attachmentToken: token
      }
    });
  });
  await page.route('**/media/encrypted-upload/**', route => {
    uploaded++;
    return route.fulfill({ status: 200, body: '' });
  });
  await page.route('**/media/ai-attachments/complete', route => {
    const item = targets.get(route.request().postDataJSON().attachmentToken);
    return route.fulfill({
      json: {
        name: item.originName,
        size: item.size,
        contentType: item.contentType,
        transferToken: 'x'.repeat(64),
        expiresAt: Date.now() + 600_000
      }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Получено 10 файлов."}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  const editor = await openEditor(page);
  await editor
    .locator('input[type="file"]:not([accept])')
    .setInputFiles(files(10));
  await page.locator('.attach-modal button.primary-yui-kit.right').click();
  await expect(
    page
      .locator('.ai-assistant__message--assistant')
      .getByText('Получено 10 файлов.', { exact: true })
  ).toBeVisible();
  expect(uploaded).toBe(10);
  expect(
    submitted.requestContext.attachments.map((item: any) => item.name)
  ).toEqual(files(10).map(file => file.name));
});

test('сохраняет семь вложений после уточнения и каждого подтверждения, включая перезагрузку', async ({
  page
}) => {
  const selected = files(7).map((file, index) => ({
    ...file,
    ...(index === 0 ? { name: 'Снимок.PNG', mimeType: 'image/png' } : {})
  }));
  const targets = new Map<string, any>();
  const approved: any[] = [];
  let streamCalls = 0;
  const streamBody = (...events: unknown[]) =>
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  const approval = (index: number) => ({
    type: 'tool-call-approval',
    runId: 'detail-seven-files',
    payload: {
      toolCallId: `file-${index}`,
      toolName: 'erp_actions_erp_attachment_upload_and_attach',
      args: {
        attachmentNumber: index + 1,
        attachmentName: selected[index].name,
        entityType: 'detal',
        entityId: 123,
        entityName: 'Дрон вымышленный',
        entityDesignation: '123-321',
        makeMain: index === 0
      }
    }
  });
  await page.route('**/media/ai-attachments/upload-target', route => {
    const token = `seven-${targets.size}`;
    targets.set(token, route.request().postDataJSON());
    return route.fulfill({
      json: {
        uploadUrl: `http://127.0.0.1:65530/media/encrypted-upload/ai-attachments/${token}`,
        attachmentToken: token
      }
    });
  });
  await page.route('**/media/encrypted-upload/**', route =>
    route.fulfill({ status: 200 })
  );
  await page.route('**/media/ai-attachments/complete', route => {
    const item = targets.get(route.request().postDataJSON().attachmentToken);
    return route.fulfill({
      json: {
        name: item.originName,
        size: item.size,
        contentType: item.contentType,
        transferToken: item.originName + 'x'.repeat(64),
        expiresAt: Date.now() + 600_000
      }
    });
  });
  await page.route('**/api/agents/generalAgent/stream*', route => {
    streamCalls++;
    const body = route.request().postDataJSON();
    expect(
      body.requestContext.attachments.map((file: any) => file.name)
    ).toEqual(selected.map(file => file.name));
    return route.fulfill({
      contentType: 'text/event-stream',
      body:
        streamCalls === 1
          ? streamBody(
              {
                type: 'text-delta',
                payload: { text: 'Укажите обозначение детали.' }
              },
              { type: 'finish' }
            )
          : streamBody({
              type: 'tool-call-approval',
              runId: 'detail-seven-files',
              payload: {
                toolCallId: 'create-detail',
                toolName: 'erp_actions_erp_entity_editor_create',
                args: {
                  type: 'detal',
                  entityName: 'Дрон вымышленный',
                  entityDesignation: '123-321'
                }
              }
            })
    });
  });
  await page.route('**/api/agents/generalAgent/approve-tool-call**', route => {
    const body = route.request().postDataJSON();
    approved.push(body);
    expect(
      body.requestContext.attachments.map((file: any) => file.name)
    ).toEqual(selected.map(file => file.name));
    const completed = approved.length - 2;
    const result = {
      type: 'tool-result',
      payload: {
        toolName:
          completed < 0
            ? 'erp_actions_erp_entity_editor_create'
            : 'erp_actions_erp_attachment_upload_and_attach',
        result: { success: true }
      }
    };
    return route.fulfill({
      contentType: 'text/event-stream',
      body:
        completed < 6
          ? streamBody(result, approval(completed + 1))
          : streamBody(
              result,
              {
                type: 'text-delta',
                payload: {
                  text: 'Деталь создана. Прикреплено 7 файлов, Снимок.PNG — основной.'
                }
              },
              { type: 'finish' }
            )
    });
  });
  const editor = await openEditor(page);
  await editor
    .locator('[contenteditable="true"]')
    .fill(
      'Создай деталь Дрон вымышленный и прикрепи все файлы, PNG сделай основной'
    );
  await editor
    .locator('input[type="file"]:not([accept])')
    .setInputFiles(selected);
  await page.locator('.attach-modal button.primary-yui-kit.right').click();
  await expect(
    page.locator('.ai-assistant__message--assistant').last()
  ).toContainText('Укажите обозначение');
  await editor.locator('[contenteditable="true"]').fill('123-321');
  await editor.locator('.toolbar-button.right:visible').click();
  for (let index = 0; index < 8; index++) {
    await expect(
      page.getByRole('button', { name: 'Подтвердить', exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Подтвердить', exact: true })
      .click();
    await expect.poll(() => approved.length).toBe(index + 1);
    if (index === 1) {
      await expect(
        page.getByRole('button', { name: 'Подтвердить', exact: true })
      ).toBeVisible();
      await page.reload();
    }
  }
  await expect(
    page.locator('.ai-assistant__message--assistant').last()
  ).toContainText('Прикреплено 7 файлов');
  expect(streamCalls).toBe(2);
  expect(approved.map(item => item.toolCallId)).toEqual([
    'create-detail',
    ...selected.map((_, index) => `file-${index}`)
  ]);
});

for (const [status, code, userMessage] of [
  [400, 'AI_ATTACHMENT_COUNT_LIMIT', limitMessage],
  [
    410,
    'AI_ATTACHMENT_EXPIRED',
    'Срок доступа к вложению истёк. Прикрепите файл заново и повторите запрос.'
  ],
  [
    403,
    'AI_ATTACHMENT_ACCESS_DENIED',
    'Нет доступа к этому вложению. Прикрепите файл из своего сообщения заново.'
  ],
  [
    503,
    'AI_REQUEST_503',
    'Не удалось связаться с ИИ. Попробуйте позже; если ошибка повторяется, обратитесь к администратору.'
  ]
] as const) {
  test(`показывает объяснение сервера ${code}, не JSON и не общую ошибку`, async ({
    page
  }) => {
    await page.route('**/api/agents/generalAgent/stream*', route =>
      route.fulfill({
        status,
        json: { code, userMessage, message: userMessage }
      })
    );
    const editor = await openEditor(page);
    await editor.locator('[contenteditable="true"]').fill('Проверь запрос');
    await editor.locator('.toolbar-button.right:visible').click();
    const answer = page.locator('.ai-assistant__message--assistant').last();
    await expect(answer).toContainText(userMessage);
    await expect(answer).not.toContainText('HTTP error');
    await expect(answer).not.toContainText('Сервис временно недоступен');
    await expect(answer).not.toContainText(code);
    await page.reload();
    await expect(
      page.locator('.ai-assistant__message--assistant').last()
    ).toContainText(userMessage);
  });
}
