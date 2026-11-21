import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);

const prepareAiSession = async (page: Page, sessionId: string) => {
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
    if (!localStorage.getItem('sep:chat:ai-assistant:v1')) {
      localStorage.setItem(
        'sep:chat:ai-assistant:v1',
        JSON.stringify({
          sessions: [
            {
              id,
              title: 'Выбор режима ответа',
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
  }, sessionId);
};

for (const theme of ['theme-light', 'theme-dark']) {
  test(`выбирает модель по режиму ответа и сохраняет выбор (${theme})`, async ({
    page
  }, testInfo) => {
    const isMobile = testInfo.project.name === 'chromium-mobile';
    const sessionId = `ai-response-mode-${Date.now()}`;
    const requests: Array<Record<string, unknown>> = [];
    await prepareAiSession(page, sessionId);
    await page.addInitScript(value => {
      localStorage.setItem('erp-theme-color-scheme', value);
    }, theme);

    let releaseFirstReply!: () => void;
    const firstReplyReady = new Promise<void>(resolve => {
      releaseFirstReply = resolve;
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) await firstReplyReady;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          { type: 'text-delta', payload: { text: 'Готово.' } },
          { type: 'finish' }
        ]
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')
      });
    });

    await page.goto(`/ai/${sessionId}`);

    const quickModeButton = page.getByRole('button', {
      name: 'Быстрый ответ',
      exact: true
    });
    await expect(quickModeButton).toBeVisible({ timeout: 30_000 });
    await expect(quickModeButton).toBeEnabled({ timeout: 30_000 });
    await expect(quickModeButton.locator('svg')).toBeVisible();
    const triggerWidth = await quickModeButton.evaluate(
      element => element.getBoundingClientRect().width
    );
    const assertSendGap = async () => {
      const mode = await page
        .locator('.ai-assistant__response-trigger:visible')
        .boundingBox();
      const send = await page
        .locator('.ai-assistant__editor .toolbar-button.right:visible')
        .boundingBox();
      expect(mode).not.toBeNull();
      expect(send).not.toBeNull();
      expect(send!.x - mode!.x - mode!.width).toBeCloseTo(8, 1);
    };
    if (!isMobile) await assertSendGap();
    await quickModeButton.click();
    const advancedModeOption = page.getByRole('menuitemradio', {
      name: 'Продуманный ответ'
    });
    await expect(advancedModeOption.locator('svg')).toBeVisible();
    await advancedModeOption.click();

    const advancedModeButton = page.getByRole('button', {
      name: 'Продуманный ответ',
      exact: true
    });
    await expect(advancedModeButton).toBeVisible();
    await expect(advancedModeButton.locator('svg')).toBeVisible();
    if (!isMobile) {
      await expect
        .poll(() =>
          advancedModeButton.evaluate(
            element => element.getBoundingClientRect().width
          )
        )
        .toBeGreaterThan(triggerWidth);
      await assertSendGap();
    }

    const editor = page.locator('.ai-assistant__editor');
    await testInfo.attach(`response-toolbar-${theme}`, {
      body: await editor.screenshot(),
      contentType: 'image/png'
    });
    await editor.locator('[contenteditable="true"]').click();
    await page.keyboard.insertText('Подготовь подробный ответ');
    await editor.locator('.toolbar-button.right:visible').click();

    await expect(page.locator('.ai-assistant__thinking')).toBeVisible();
    await expect(advancedModeButton).toBeEnabled();
    await expect(advancedModeButton).toContainText('Продуманный ответ');
    await expect(
      advancedModeButton.locator('.ai-assistant__response-trigger-skeleton')
    ).toHaveCount(0);
    await advancedModeButton.click();
    await page.getByRole('menuitemradio', { name: 'Быстрый ответ' }).click();
    await expect(quickModeButton).toBeEnabled();
    await expect(page.locator('.ai-assistant__thinking')).toBeVisible();
    expect(requests).toHaveLength(1);

    await expect.poll(() => requests.length, { timeout: 30_000 }).toBe(1);
    expect(requests[0]).toMatchObject({
      requestContext: { responseMode: 'advanced' }
    });
    releaseFirstReply();
    await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);

    const conversation = page.locator('.ai-assistant__scroll');
    const answer = conversation.locator(
      '.ai-assistant__message--assistant .message__article__text'
    );
    const prompt = conversation.locator(
      '.ai-assistant__message--user .message__article__text'
    );
    await expect(answer).toBeVisible();
    await expect(answer).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(answer).toHaveCSS('padding-left', '0px');
    await expect(answer).toHaveCSS('padding-right', '0px');
    await expect(answer.locator('.message-bubble-tail')).toBeHidden();
    await expect(prompt).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const answerBox = await answer.boundingBox();
    const conversationBox = await conversation.boundingBox();
    expect(answerBox?.x).toBeCloseTo(conversationBox!.x, 1);
    expect(answerBox?.width).toBeCloseTo(conversationBox!.width, 1);
    await testInfo.attach(`full-width-reply-${theme}`, {
      body: await conversation.screenshot(),
      contentType: 'image/png'
    });

    await editor
      .locator('[contenteditable="true"]')
      .fill('Теперь ответь быстро');
    await editor.locator('.toolbar-button.right:visible').click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({
      requestContext: { responseMode: 'quick' }
    });
    await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);

    await page.reload();
    await expect(quickModeButton).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stored = localStorage.getItem('sep:chat:ai-assistant:v1');
          return stored ? JSON.parse(stored).responseMode : null;
        })
      )
      .toBe('quick');
  });
}
