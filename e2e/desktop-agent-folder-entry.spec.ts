import { expect, test } from './fixtures/ai-history';

test.setTimeout(90_000);

for (const outcome of ['cancel', 'error', 'connected'] as const) {
  test(`выбор папки из обычного ИИ-чата Tauri: ${outcome}`, async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.use.isMobile,
      'Локальные папки доступны в настольном Tauri'
    );
    const api = 'http://127.0.0.1:65530';
    await page.route(api + '/config', route =>
      route.fulfill({
        contentType: 'text/plain',
        body: `VITE_MASTRA_URL=http://127.0.0.1:4111\nVITE_CHAT_API_DOMAIN=${api}`
      })
    );
    await page.route(api + '/auth/session', route =>
      route.fulfill({ json: { id: 'local-ui-test-user', name: 'Тест' } })
    );
    await page.addInitScript(
      ({ api, outcome }) => {
        const user = { id: 'local-ui-test-user', name: 'Тест' };
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([
            {
              url: api,
              config: {
                CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
                CHAT_API_DOMAIN: api,
                CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
                CHAT_ERP_URL: api
              }
            }
          ])
        );
        localStorage.setItem('chat_runtime_last_organization', api);
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({
            token: 'qa-only-token',
            user,
            source: 'chat_credentials'
          })
        );
        sessionStorage.setItem('menu-collapse', 'false');
        Object.defineProperties(window, {
          isTauri: { value: true, configurable: true },
          __TAURI_INTERNALS__: {
            configurable: true,
            value: {
              metadata: {
                currentWindow: { label: 'main' },
                currentWebview: { label: 'main' }
              },
              transformCallback: () => 0,
              unregisterCallback: () => {},
              invoke: async (
                command: string,
                args: { preferredModel?: string } = {}
              ) => {
                if (command === 'get_telemetry_os') return 'windows';
                if (command === 'desktop_agent_models')
                  return {
                    models: [
                      {
                        value: 'native-qa-model',
                        name: 'Локальная модель',
                        defaultEffort: 'low',
                        efforts: [{ value: 'low', name: 'low' }]
                      }
                    ]
                  };
                if (command !== 'desktop_agent_pick_directory') return null;
                (window as any).qaFolderRequests =
                  ((window as any).qaFolderRequests || 0) + 1;
                (window as any).qaPreferredNativeModel = args.preferredModel;
                if (outcome === 'cancel') return null;
                if (outcome === 'error')
                  throw 'Для локального агента не настроено подключение к ИИ.';
                return {
                  directory: 'C:/Projects/Example',
                  sessionId: 'qa-native-session',
                  configOptions: [
                    {
                      id: 'model',
                      category: 'model',
                      currentValue: 'native-qa-model',
                      options: [
                        { value: 'native-qa-model', name: 'Локальная модель' }
                      ]
                    },
                    {
                      id: 'effort',
                      category: 'thought_level',
                      currentValue: 'low',
                      options: [{ value: 'low', name: 'low' }]
                    }
                  ]
                };
              }
            }
          }
        });
      },
      { api, outcome }
    );

    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/ai?organization=' + encodeURIComponent(api));
    const assistant = page.getByTestId('AI-Assistant');
    const folder = assistant.getByRole('button', {
      name: 'Выбрать папку проекта',
      exact: true
    });
    const model = assistant.locator('.ai-composer-settings__trigger');
    const editor = assistant.getByRole('textbox');
    const tabs = page.getByRole('tablist', { name: 'Разделы ИИ' });
    await expect(model).toHaveAttribute('title', 'Модель А', {
      timeout: 60_000
    });
    await expect(folder).toBeVisible();
    await expect(folder).toHaveText('Выбрать папку');
    await expect(
      tabs.getByRole('tab', { name: 'Чаты', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await editor.fill('Черновик обычного ИИ-чата');
    await folder.click();
    await expect
      .poll(() => page.evaluate(() => (window as any).qaFolderRequests))
      .toBe(1);
    expect(
      await page.evaluate(() => (window as any).qaPreferredNativeModel)
    ).not.toBe('model-a');

    if (outcome !== 'connected') {
      await expect(folder).toBeEnabled();
      await expect(editor).toHaveText('Черновик обычного ИИ-чата');
      await expect(model).toHaveAttribute('title', 'Модель А');
      await expect(
        tabs.getByRole('tab', { name: 'Чаты', exact: true })
      ).toHaveAttribute('aria-selected', 'true');
      if (outcome === 'error')
        await expect(
          page.getByText(
            'Для локального агента не настроено подключение к ИИ.',
            { exact: true }
          )
        ).toBeVisible();
      return;
    }

    await expect(
      tabs.getByRole('tab', { name: 'Агенты', exact: true })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      assistant.getByRole('button', {
        name: 'Сменить папку проекта',
        exact: true
      })
    ).toHaveText('Example');
    await expect(model).toHaveAttribute('title', 'Локальная модель');
    await expect(editor).not.toContainText('Черновик обычного ИИ-чата');
    await tabs.getByRole('tab', { name: 'Чаты', exact: true }).click();
    await expect(editor).toHaveText('Черновик обычного ИИ-чата');
    await expect(model).toHaveAttribute('title', 'Модель А');
  });
}
