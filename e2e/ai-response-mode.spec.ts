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
    test.skip(
      testInfo.project.name === 'chromium-mobile',
      'Выбор режима расположен в компьютерной панели'
    );
    const sessionId = `ai-response-mode-${Date.now()}`;
    const requests: Array<Record<string, unknown>> = [];
    await prepareAiSession(page, sessionId);
    await page.addInitScript(value => {
      localStorage.setItem('erp-theme-color-scheme', value);
    }, theme);

    await page.route('**/api/agents/generalAgent/stream*', async route => {
      requests.push(route.request().postDataJSON());
      await new Promise(resolve => {
        setTimeout(resolve, 2000);
      });
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
        .locator('.ai-assistant__response-trigger--desktop')
        .boundingBox();
      const send = await page
        .locator('.ai-assistant__editor .toolbar-button.right:visible')
        .boundingBox();
      expect(mode).not.toBeNull();
      expect(send).not.toBeNull();
      expect(send!.x - mode!.x - mode!.width).toBeCloseTo(8, 1);
    };
    await assertSendGap();
    await quickModeButton.click();
    const advancedModeOption = page.getByRole('menuitemradio', {
      name: 'Продвинутый ответ'
    });
    await expect(advancedModeOption.locator('svg')).toBeVisible();
    await advancedModeOption.click();

    const advancedModeButton = page.getByRole('button', {
      name: 'Продвинутый ответ',
      exact: true
    });
    await expect(advancedModeButton).toBeVisible();
    await expect(advancedModeButton.locator('svg')).toBeVisible();
    await expect
      .poll(() =>
        advancedModeButton.evaluate(
          element => element.getBoundingClientRect().width
        )
      )
      .toBeGreaterThan(triggerWidth);
    await assertSendGap();

    const editor = page.locator('.ai-assistant__editor');
    await testInfo.attach(`response-toolbar-${theme}`, {
      body: await editor.screenshot(),
      contentType: 'image/png'
    });
    await editor.locator('[contenteditable="true"]').click();
    await page.keyboard.insertText('Подготовь подробный ответ');
    await editor.locator('.toolbar-button.right:visible').click();

    await expect(advancedModeButton).toBeDisabled();
    await expect(advancedModeButton).toContainText('Продвинутый ответ');
    await expect(
      advancedModeButton.locator('.ai-assistant__response-trigger-skeleton')
    ).toHaveCount(0);
    await assertSendGap();

    await expect.poll(() => requests.length, { timeout: 30_000 }).toBe(1);
    expect(requests[0]).toMatchObject({
      requestContext: { responseMode: 'advanced' }
    });

    await page.reload();
    await expect(advancedModeButton).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const stored = localStorage.getItem('sep:chat:ai-assistant:v1');
          return stored ? JSON.parse(stored).responseMode : null;
        })
      )
      .toBe('advanced');
  });
}
