import { expect, test } from '@playwright/test';

const SESSION_ID = 'ai-attachment-check';

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
  }, SESSION_ID);
});

test('передаёт прикреплённый документ AI-агенту', async ({ page }) => {
  const uploadTargetPayloads: unknown[] = [];
  const uploadedBodies: Buffer[] = [];
  const completePayloads: unknown[] = [];
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
          uploadUrl: 'http://127.0.0.1:65530/temporary-ai-attachment',
          attachmentToken: 'stage-token'
        })
      });
    }
  );
  await page.route(
    'http://127.0.0.1:65530/temporary-ai-attachment',
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
  await page.route(
    'http://127.0.0.1:4111/api/agents/generalAgent/stream',
    route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Остановка после проверки запроса' })
      })
  );

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

  await expect(editor.getByText('ai-document.txt', { exact: false })).toBeVisible();
  await expect(editor.getByText('5 B', { exact: true })).toBeVisible();

  const mastraRequestPromise = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      request.url() ===
        'http://127.0.0.1:4111/api/agents/generalAgent/stream'
  );
  await page.locator('.attach-modal button.primary-yui-kit.right').click();
  const mastraRequest = await mastraRequestPromise;

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

  const mastraPayload = mastraRequest.postDataJSON();
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
});
