import { expect, test } from '@playwright/test';

const SESSION_ID = 'ai-attachment-check';

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
    if (!localStorage.getItem('sep:chat:ai-assistant:v1')) {
      localStorage.setItem(
        'sep:chat:ai-assistant:v1',
        JSON.stringify({
          sessions: [
            {
              id: sessionId,
              title: 'Проверка вложения',
              description: 'Тест',
              time: '10:00',
              messages: []
            }
          ],
          tasks: [],
          permissionMode: 'ask'
        })
      );
    }
  }, SESSION_ID);
});

test('передаёт прикреплённый документ AI-агенту', async ({ page }) => {
  const uploadTargetPayloads: unknown[] = [];
  const uploadedBodies: Buffer[] = [];
  const completePayloads: unknown[] = [];
  const mastraPayloads: any[] = [];
  const attachmentReference = {
    name: 'ai-document.txt',
    size: 5,
    contentType: 'text/plain',
    transferToken: 'a'.repeat(64),
    expiresAt: Date.now() + 600_000
  };

  await page.route(
    'http://127.0.0.1:65530/media/ai-attachments/upload-target',
    async route => {
      uploadTargetPayloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uploadUrl:
            'http://chat-server:3000/media/encrypted-upload/ai-attachments/document.txt?expires=2000000000&signature=test',
          attachmentToken: 'stage-token'
        })
      });
    }
  );
  await page.route(
    'http://127.0.0.1:65530/media/encrypted-upload/ai-attachments/document.txt?expires=2000000000&signature=test',
    async route => {
      uploadedBodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0));
      await route.fulfill({ status: 200, body: '' });
    }
  );
  await page.route(
    'http://127.0.0.1:65530/media/ai-attachments/complete',
    async route => {
      completePayloads.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(attachmentReference)
      });
    }
  );
  await page.route('**/api/agents/generalAgent/stream*', route => {
    mastraPayloads.push(route.request().postDataJSON());
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"finish"}\n\n'
    });
  });

  await page.goto(`/ai/${SESSION_ID}`);

  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });

  const documentInput = editor.locator('input[type="file"]:not([accept])');
  await expect(documentInput).toHaveCount(1);
  await documentInput.setInputFiles({
    name: 'ai-document.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello', 'utf8')
  });

  await expect(
    editor.getByText('ai-document.txt', { exact: false })
  ).toBeVisible();
  await expect(editor.getByText('5 B', { exact: true })).toBeVisible();

  const attachModal = page.locator('dialog.attach-modal-container');
  const modalBoxBeforeEmoji = await attachModal.boundingBox();
  await attachModal.locator('.smile-button').click();

  const emojiPicker = attachModal.locator('.emoji-picker:visible');
  await expect(emojiPicker).toBeVisible();
  await expect(emojiPicker).toHaveClass(/attach-modal__emoji-picker-overlay/);
  await expect(emojiPicker).toHaveCSS('position', 'absolute');

  const [modalBoxWithEmoji, emojiPickerBox] = await Promise.all([
    attachModal.boundingBox(),
    emojiPicker.boundingBox()
  ]);
  expect(modalBoxBeforeEmoji).not.toBeNull();
  expect(modalBoxWithEmoji).not.toBeNull();
  expect(emojiPickerBox).not.toBeNull();
  expect(Math.abs(modalBoxWithEmoji!.x - modalBoxBeforeEmoji!.x)).toBeLessThan(
    1
  );
  expect(Math.abs(modalBoxWithEmoji!.y - modalBoxBeforeEmoji!.y)).toBeLessThan(
    1
  );
  expect(emojiPickerBox!.x).toBeGreaterThanOrEqual(0);
  expect(emojiPickerBox!.y).toBeGreaterThanOrEqual(0);
  expect(emojiPickerBox!.x + emojiPickerBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  expect(emojiPickerBox!.y + emojiPickerBox!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height
  );

  await attachModal.click({ position: { x: 8, y: 8 } });
  await expect(emojiPicker).toBeHidden();

  await page.locator('.attach-modal button.primary-yui-kit.right').click();
  await expect.poll(() => mastraPayloads.length).toBe(1);

  expect(uploadTargetPayloads).toEqual([
    {
      originName: 'ai-document.txt',
      size: 5,
      contentType: 'text/plain',
      isMedia: false
    }
  ]);
  expect(uploadedBodies.map(body => body.toString('utf8'))).toEqual(['hello']);
  expect(completePayloads).toEqual([{ attachmentToken: 'stage-token' }]);

  const mastraPayload = mastraPayloads[0];
  expect(mastraPayload.memory).toEqual({
    thread: SESSION_ID,
    resource: 'local-ui-test-user'
  });
  expect(mastraPayload.requestContext.attachments).toEqual([
    {
      name: attachmentReference.name,
      size: attachmentReference.size,
      contentType: attachmentReference.contentType,
      transferToken: attachmentReference.transferToken
    }
  ]);
  expect(mastraPayload.messages[0].content).toContain(
    'Проанализируй содержимое прикреплённого файла'
  );

  await expect(
    page.locator('.ai-assistant__message--assistant').last()
  ).toBeVisible();
  await page.reload();

  const restoredEditor = page.locator('.ai-assistant__editor');
  await expect(restoredEditor).toBeVisible({ timeout: 30_000 });
  const stayInBrowserButton = page.getByRole('button', {
    name: 'Остаться в браузере'
  });
  if (await stayInBrowserButton.isVisible()) await stayInBrowserButton.click();
  const restoredInput = restoredEditor.locator('[contenteditable="true"]');
  await restoredInput.click();
  await page.keyboard.insertText('Теперь кратко опиши таблицу');
  const restoredSendButton = restoredEditor.locator(
    '.toolbar-button.right:visible'
  );
  await expect(restoredSendButton).toHaveCount(1);
  await restoredSendButton.click();
  await expect.poll(() => mastraPayloads.length).toBe(2);
  const restoredPayload = mastraPayloads[1];

  expect(restoredPayload.requestContext.attachments).toEqual([
    {
      name: attachmentReference.name,
      size: attachmentReference.size,
      contentType: attachmentReference.contentType,
      transferToken: attachmentReference.transferToken
    }
  ]);
  expect(restoredPayload.messages.at(-1).content).toContain(
    'Доступные вложения текущего запроса'
  );
  expect(uploadTargetPayloads).toHaveLength(1);
  expect(completePayloads).toHaveLength(1);
});

test('renders and restores an AI-generated file as a standard chat attachment', async ({
  page
}) => {
  const outputAttachment = {
    id: 'generated-deficit-report',
    name: 'deficit-detal-not-ordered.xlsx',
    size: 12_345,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    path: 'media/generated/deficit-detal-not-ordered.xlsx',
    thumbnailPath: null
  };

  await page.route('**/api/agents/generalAgent/stream*', route => {
    const events = [
      {
        type: 'tool-result',
        payload: {
          toolName: 'erp_erp_deficit_excel_export',
          result: { chatAttachments: [outputAttachment] }
        }
      },
      {
        type: 'text-delta',
        payload: { text: 'The report is attached.' }
      },
      { type: 'finish' }
    ];

    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
    });
  });

  await page.goto(`/ai/${SESSION_ID}`);

  const editor = page.locator('.ai-assistant__editor');
  await expect(editor).toBeVisible({ timeout: 30_000 });
  const input = editor.locator('[contenteditable="true"]');
  await input.click();
  await page.keyboard.insertText('Create the deficit report');
  await editor.locator('.toolbar-button.right:visible').click();

  const generatedFile = page
    .locator('.ai-assistant__message-files')
    .filter({ hasText: outputAttachment.name });
  await expect(generatedFile).toBeVisible();
  await expect(
    generatedFile.locator('[data-testid$="-FileContainer"]')
  ).toBeVisible();
  await expect(generatedFile).toContainText('12.1 KB');
  await expect(generatedFile).toContainText('The report is attached.');
  await expect(page.locator('.ai-assistant__thinking')).toBeHidden();
  await expect
    .poll(
      () =>
        page.evaluate(async sessionId => {
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('chat-messages-db', 2);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const record = await new Promise<any>((resolve, reject) => {
            const transaction = db.transaction('messages', 'readonly');
            const request = transaction.objectStore('messages').get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          db.close();
          const messages = Array.isArray(record?.messages)
            ? record.messages
            : [];
          const assistant = messages.at(-1);
          return {
            fileName: assistant?.outputAttachments?.[0]?.name || null,
            loading: assistant?.loading
          };
        }, SESSION_ID),
      { timeout: 30_000 }
    )
    .toEqual({ fileName: outputAttachment.name, loading: false });

  await page.reload();

  const restoredFile = page
    .locator('.ai-assistant__message-files')
    .filter({ hasText: outputAttachment.name });
  await expect(restoredFile).toBeVisible({ timeout: 30_000 });
  await expect(
    restoredFile.locator('[data-testid$="-FileContainer"]')
  ).toBeVisible();
});
