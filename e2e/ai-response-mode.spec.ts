import { expect, test, type Page } from './fixtures/ai-history';

test.setTimeout(90_000);

const organizationUrl = 'http://127.0.0.1:65530';
const organizationQuery = '?organization=' + encodeURIComponent(organizationUrl);

const prepareAiSession = async (page: Page): Promise<void> => {
  const user = { id: 'local-ui-test-user', name: 'Тест' };
  const config = {
      CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
      CHAT_API_DOMAIN: organizationUrl,
      CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
      CHAT_ERP_URL: organizationUrl
  };

  await page.route(organizationUrl + '/config', route => route.fulfill({
    contentType: 'text/plain',
    body: [
      'VITE_MASTRA_URL=' + config.CHAT_MASTRA_URL,
      'VITE_CHAT_API_DOMAIN=' + config.CHAT_API_DOMAIN,
      'VITE_CHAT_WS_DOMAIN=' + config.CHAT_WS_DOMAIN,
      'VITE_ERP_URL=' + config.CHAT_ERP_URL
    ].join('\n')
  }));
  await page.route(organizationUrl + '/auth/session', route => route.fulfill({ json: user }));
  await page.addInitScript(({ organizationUrl, config, user }): void => {
    sessionStorage.setItem('menu-collapse', 'false');
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
        user,
        source: 'chat_credentials'
      })
    );
  }, { organizationUrl, config, user });
};

test('раздел агентов доступен только в настольном интерфейсе, список ИИ помещается на телефоне', async ({ page }, testInfo): Promise<void> => {
  await prepareAiSession(page);
  await page.addInitScript((): void => {
    Object.defineProperties(window, {
      isTauri: { value: true, configurable: true },
      __TAURI_INTERNALS__: { configurable: true, value: {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        invoke: async (command: string): Promise<null> => {
            if (command === 'desktop_agent_models') {
              (window as any).agentModelRequests =
                ((window as any).agentModelRequests || 0) + 1;
              throw 'Для локального агента не настроено подключение к ИИ.';
            }
            return null;
          },
        transformCallback: (): number => 0,
        unregisterCallback: (): void => {}
      } }
    });
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/' + organizationQuery);
  await page.locator('[data-testid$="MenuBottomNav-AI"]:visible').click();
  const tabs = page.getByRole('tablist', { name: 'Разделы ИИ' });
  const agents = tabs.getByRole('tab', { name: 'Агенты' });
  await expect(tabs).toBeVisible({ timeout: 60_000 });
  if (testInfo.project.use.isMobile) {
    await expect(agents).toHaveCount(0);
  } else {
    await expect(agents).toHaveAttribute('aria-selected', 'false');
    await expect(
      tabs.getByRole('tab', { name: 'Чаты', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    const model = page.locator('.ai-composer-settings__trigger:visible');
    await expect(model).toHaveAttribute('title', 'Модель А');
    expect(
      await page.evaluate(() => (window as any).agentModelRequests || 0)
    ).toBe(0);
    await agents.click();
    await model.click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Для локального агента не настроено' })
    ).toBeVisible();
    await tabs.getByRole('tab', { name: 'Чаты', exact: true }).click();
    await expect(model).toHaveAttribute('title', 'Модель А');
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Для локального агента не настроено' })
    ).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/' + organizationQuery);
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

test('показывает провайдера тегом и ищет модель по названию и провайдеру', async ({
  page
}): Promise<void> => {
  await prepareAiSession(page);
  await page.route('**/response-models', route =>
    route.fulfill({
      json: {
        defaults: { quick: 'sol', advanced: 'sol' },
        models: [
          { id: 'sol', name: 'Sol (Preview) (OpenAI)', efforts: ['low'] },
          {
            id: 'opencode-go|sol',
            name: 'Sol (Preview) (OpenCode Go)',
            efforts: ['low']
          },
          {
            id: 'opencode-go|deepseek',
            name: 'DeepSeek (OpenCode Go)',
            efforts: ['low']
          },
          {
            id: 'openrouter|sol',
            name: 'Sol (Preview) (OpenRouter)',
            efforts: ['low']
          }
        ]
      }
    })
  );

  await page.goto('/ai' + organizationQuery);
  const trigger = page.locator('.ai-composer-settings__trigger:visible');
  const badge = '.ai-composer-settings__provider';
  await expect(trigger).toHaveAttribute('title', 'Sol (Preview)', {
    timeout: 30_000
  });
  await expect(trigger.locator(badge)).toHaveCount(0);
  await trigger.click();
  const picker = page.getByRole('button', { name: /^Выбрать модель,/ });
  await expect(picker.locator(badge)).toHaveCount(0);
  await picker.click();

  const dialog = page.getByRole('dialog', { name: 'Выбор модели' });
  const search = dialog.getByPlaceholder('Поиск моделей');
  const choices = dialog.locator('button[aria-pressed]');
  await expect(search).toBeFocused();
  await expect(choices).toHaveCount(4);
  const badges = choices.locator(badge);
  await expect(badges.getByText('OpenAI', { exact: true })).toBeVisible();
  await expect(badges.filter({ hasText: 'OpenAI' })).toHaveClass(/\bblue-yui-kit\b/);
  await expect(badges.filter({ hasText: 'OpenCode Go' }).first()).toHaveClass(/\bviolet-yui-kit\b/);
  await expect(badges.filter({ hasText: 'OpenRouter' })).toHaveClass(/\bgreen-yui-kit\b/);
  const selected = dialog.locator('button[aria-pressed="true"]');
  await expect(selected.locator(badge)).toHaveText('OpenAI');
  await expect(selected.locator(':scope > svg')).toHaveCount(0);
  await search.fill('OPENCODE');
  await expect(choices).toHaveCount(2);
  await search.fill('сияние');
  await expect(dialog.getByRole('status')).toHaveText('Модели не найдены');
  await search.fill('  Go   PREVIEW ');
  await expect(choices).toHaveCount(1);
  await expect(choices.locator(badge)).toHaveText('OpenCode Go');
  await choices.click();

  await expect(picker).toHaveAccessibleName('Выбрать модель, Sol (Preview)');
  await expect(trigger).not.toContainText('OpenCode Go');
  await picker.click();
  await expect(search).toHaveValue('');
  await expect(choices).toHaveCount(4);
  await expect(selected.locator(badge)).toHaveText('OpenCode Go');
  await expect(selected.locator(':scope > svg')).toHaveCount(0);
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

    await page.goto('/ai' + organizationQuery);

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
    const conversation = page.locator('.ai-assistant__conversation');
    const answer = conversation.locator('.ai-assistant__answer');
    const prompt = conversation.locator(
      '.ai-assistant__message--user .message__article__text'
    );
    await expect(answer).toContainText('Готово.');
    await expect(answer).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(answer).toHaveCSS('padding-left', '0px');
    await expect(answer).toHaveCSS('padding-right', '0px');
    await expect(answer.locator('.message-bubble-tail')).toBeHidden();
    await expect(prompt).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const horizontalOffsets = await conversation.evaluate(element => {
      const content = element.querySelector('.ai-assistant__answer')!
        .getBoundingClientRect();
      const container = element.getBoundingClientRect();
      const style = getComputedStyle(element);

      return [
        content.left - container.left - parseFloat(style.paddingLeft),
        container.right - content.right - parseFloat(style.paddingRight)
      ];
    });
    for (const offset of horizontalOffsets) {
      expect(Math.abs(offset)).toBeLessThanOrEqual(1);
    }
    await testInfo.attach(`full-width-reply-${theme}`, {
      body: await conversation.screenshot(),
      contentType: 'image/png'
    });

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
