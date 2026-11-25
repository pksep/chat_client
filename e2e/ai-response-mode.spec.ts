import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);

const prepareAiSession = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
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
  });
};

test('раздел агентов доступен только в настольном интерфейсе, список ИИ помещается на телефоне', async ({ page }, testInfo): Promise<void> => {
  await prepareAiSession(page);
  await page.addInitScript((): void => {
    Object.defineProperties(window, {
      isTauri: { value: true, configurable: true },
      __TAURI_INTERNALS__: { configurable: true, value: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        invoke: async (): Promise<null> => null,
        transformCallback: (): number => 0,
        unregisterCallback: (): void => {}
      } }
    });
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/ai');
  const tabs = page.getByRole('tablist', { name: 'Разделы ИИ' });
  const agents = tabs.getByRole('tab', { name: 'Агенты' });
  await expect(tabs).toBeVisible({ timeout: 60_000 });
  if (testInfo.project.use.isMobile) {
    await expect(agents).toHaveCount(0);
  } else {
    await expect(agents).toHaveAttribute('aria-selected', 'true');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-testid$="MenuBottomNav-AI"]:visible').click();
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const panel = page.locator('.mobile-list-container__section--ai[aria-hidden="false"]');
    await expect(panel.getByRole('tab', { name: 'Чаты' })).toBeVisible();
    await expect(panel.getByRole('tab', { name: 'Агенты' })).toHaveCount(0);
    for (const container of [panel, panel.locator('.ai-menu-panel'), panel.locator('.ai-menu-panel__list')]) {
      await expect.poll(() => container.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
  }
});

for (const theme of ['theme-light', 'theme-dark']) {
  test(`сохраняет модель и уровень для следующего сообщения (${theme})`, async ({
    page
  }, testInfo) => {
    const requests: Array<Record<string, unknown>> = [];
    await prepareAiSession(page);
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

    await page.goto('/ai');

    const trigger = page.locator('.ai-composer-settings__trigger:visible');
    const selectModel = async (name: string): Promise<void> => {
      await trigger.click();
      await page.locator('.ai-composer-settings__picker:visible').click();
      await page.getByRole('button', { name, exact: true }).click();
    };

    await expect(trigger).toContainText('Модель А', { timeout: 30_000 });
    await selectModel('Модель Б');
    await expect(trigger).toContainText('Высокий');
    const slider = page.getByRole('slider');
    await slider.focus();
    await slider.press('Home');
    await expect(trigger).toContainText('Лёгкий');
    await slider.press('Escape');
    await testInfo.attach(`response-toolbar-${theme}`, {
      body: await trigger.screenshot(),
      contentType: 'image/png'
    });

    const editor = page.locator('.ai-assistant__editor [contenteditable="true"]:visible');
    const send = page.locator('.ai-assistant__editor .toolbar-button.right:visible');
    await editor.click();
    await page.keyboard.insertText('Подготовь ответ');
    await send.click();
    try {
      await expect.poll(() => requests.length, { timeout: 30_000 }).toBe(1);
      expect(requests[0]).toMatchObject({
        requestContext: { modelSelection: { id: 'model-b', effort: 'low' } }
      });
      await selectModel('Модель А');
      await page.locator('.ai-composer-settings__picker:visible').press('Escape');
      await expect(trigger).toContainText('Модель А');
    } finally {
      releaseFirstReply();
    }

    await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);
    await editor.click();
    await page.keyboard.insertText('Ответь ещё раз');
    await send.click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]).toMatchObject({
      requestContext: { modelSelection: { id: 'model-a', effort: 'low' } }
    });
    await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);

    await page.reload();
    await expect(trigger).toContainText('Модель А', { timeout: 30_000 });
    await selectModel('Модель Б');
    await expect(trigger).toContainText('Лёгкий');
  });
}
