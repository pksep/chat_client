import { expect, test } from './fixtures/ai-history';
import { readFile } from 'node:fs/promises';

type AgentTestUpdate =
  | 'permission'
  | 'progress'
  | 'writing'
  | 'success'
  | 'error'
  | 'cancel';

test('Агенты показывают ход работы, запрос разрешения и результат в общих меню ИИ', async ({
  page
}, testInfo): Promise<void> => {
  test.skip(testInfo.project.use.isMobile, 'Вкладка «Агенты» доступна на ПК');
  test.setTimeout(90_000);
  let photo: Buffer | null = null;
  await page.route('**/media/upload-target', route => {
    const body = route.request().postDataJSON();
    expect(body.isMedia).toBe(true);
    expect(body.contentType).toBe('image/png');
    const url = new URL('/agent-output-photo.png', page.url()).href;
    return route.fulfill({ json: { objectName: url, uploadUrl: url } });
  });
  await page.route('**/agent-output-photo.png', route => {
    if (route.request().method() === 'PUT') {
      photo = route.request().postDataBuffer();
      return route.fulfill({ status: 200 });
    }
    return route.fulfill({
      body: photo ?? Buffer.alloc(0),
      contentType: 'image/png'
    });
  });
  await page.route('**/media/upload', route =>
    route.fulfill({
      json: { objectName: new URL('/agent-output-photo.png', page.url()).href }
    })
  );

  await page.addInitScript((): void => {
    localStorage.setItem('erp-theme-color-scheme', 'theme-dark');
    const apiUrl = 'http://127.0.0.1:65530';
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url: apiUrl,
          config: {
            CHAT_API_DOMAIN: apiUrl,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530'
          }
        }
      ])
    );
    localStorage.setItem('chat_runtime_last_organization', apiUrl);
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'test-token',
        user: { id: 'local-ui-test-user', name: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');

    const directory = 'C:/Projects/Example';
    const model = { value: 'test/model', name: 'Тестовая модель' };
    let pushEvent: ((event: unknown) => void) | undefined;

    window.addEventListener('agent-test-closed', (): void => {
      pushEvent?.({ type: 'closed' });
    });

    Object.defineProperties(window, {
      isTauri: { value: true, configurable: true },
      __TAURI_INTERNALS__: {
        configurable: true,
        value: {
          metadata: {
            currentWindow: { label: 'main' },
            currentWebview: { label: 'main' }
          },
          transformCallback: (): number => 0,
          unregisterCallback: (): void => {},
          invoke: async (
            command: string,
            args: {
              events?: { onmessage: (event: unknown) => void };
              directory?: string;
              previousSession?: string;
              paths?: string[];
              texts?: string[];
            } = {}
          ): Promise<unknown> => {
            if (command === 'get_telemetry_os') return 'windows';
            if (command === 'desktop_agent_cancel') {
              window.dispatchEvent(new CustomEvent('agent-test-update', { detail: 'cancel' }));
              return;
            }
            if (command === 'desktop_agent_translate_notes') {
              const ru: Record<string, string> = {
                '**Preparing cat SVG paths**': '**Готовлю SVG-контуры кота**',
                '**Implementing path conversion**':
                  '**Реализую преобразование контуров**',
                'Finished checking the drawing.': 'Закончил проверку.'
              };
              const texts = args.texts ?? [];
              if (texts.includes('Finished checking the drawing.'))
                sessionStorage.setItem('agent-test-history-translation', '1');
              await new Promise<void>(resolve => setTimeout(resolve, 120));
              return texts.map(text => ru[text]);
            }
            if (command === 'desktop_agent_read_image') {
              return new TextEncoder().encode(
                '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><circle r="20"/></svg>'
              ).buffer;
            }
            if (command === 'desktop_agent_read_output') {
              return new TextEncoder().encode('Север;3\nЮг;9').buffer;
            }
            if (command === 'plugin:opener|reveal_item_in_dir') {
              sessionStorage.setItem(
                'agent-test-revealed',
                args.paths?.[0] ?? ''
              );
              return;
            }

            if (command === 'desktop_agent_models') {
              return {
                models: [{ ...model, efforts: [], defaultEffort: 'off' }]
              };
            }

            if (command === 'desktop_agent_pick_directory') {
              const count = Number(sessionStorage.getItem('agent-test-picks'));
              sessionStorage.setItem('agent-test-picks', String(count + 1));
              pushEvent = args.events?.onmessage;
              return {
                directory,
                sessionId: 'test-session',
                configOptions: []
              };
            }

            if (command === 'desktop_agent_resume_directory') {
              if (sessionStorage.getItem('agent-test-folder-unavailable'))
                throw new Error('Сохранённая папка недоступна.');

              if (
                args.directory !== directory ||
                args.previousSession !== 'test-session'
              ) {
                throw new Error('Передана другая папка или сессия.');
              }

              const count = Number(
                sessionStorage.getItem('agent-test-resumes')
              );
              sessionStorage.setItem('agent-test-resumes', String(count + 1));
              await new Promise<void>(resolve => {
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve())
                );
              });
              if (
                document.body.textContent?.includes('Подключаю папку проекта…')
              )
                throw new Error(
                  'При восстановлении показано подключение папки.'
                );

              pushEvent = args.events?.onmessage;
              return {
                directory,
                sessionId: 'test-session',
                configOptions: []
              };
            }

            if (command === 'desktop_agent_prompt') {
              return new Promise((resolve, reject) => {
                const onUpdate = (event: Event): void => {
                  const { detail } = event as CustomEvent<AgentTestUpdate>;
                  if (detail === 'permission') {
                    pushEvent?.({
                      type: 'permission',
                      requestId: 'test-permission',
                      toolCall: { title: 'Изменить файл' }
                    });
                    return;
                  }

                  if (detail === 'progress' || detail === 'writing') {
                    const publish = (workEntry: object): void =>
                      pushEvent?.({
                        type: 'update',
                        update: { sessionUpdate: 'tool_call_update', workEntry }
                      });
                    if (detail === 'writing') {
                      publish({
                        id: 'plan',
                        kind: 'commentary',
                        text: 'Посмотрю структуру проекта.'
                      });
                      publish({
                        id: 'read',
                        kind: 'action',
                        state: 'running',
                        text: 'Читаю файл · котик.svg'
                      });
                      publish({
                        id: 'read',
                        kind: 'action',
                        state: 'done',
                        text: 'Прочитал файл · котик.svg'
                      });
                    }
                    const steps =
                      detail === 'progress'
                        ? [{ id: 'a', text: 'Проверяю формат.' }]
                        : [
                            { id: 'a', text: 'Проверяю формат рисунка.' },
                            { id: 'b', text: '**Preparing cat SVG paths**' },
                            {
                              id: 'c',
                              text: '**Implementing path conversion**'
                            }
                          ];
                    for (const reasoningSummary of steps) {
                      pushEvent?.({
                        type: 'update',
                        update: {
                          sessionUpdate: 'tool_call_update',
                          reasoningSummary
                        }
                      });
                    }
                    if (detail === 'writing') {
                      publish({
                        id: 'shell',
                        kind: 'action',
                        state: 'done',
                        text: 'Выполнил команду'
                      });
                      pushEvent?.({
                        type: 'update',
                        update: {
                          sessionUpdate: 'tool_call_update',
                          commentary: 'Сохраню рисунок в выбранной папке.'
                        }
                      });
                    }
                    pushEvent?.({
                      type: 'update',
                      update: {
                        sessionUpdate: 'tool_call_update',
                        title:
                          detail === 'writing'
                            ? 'Готовлю содержимое файла'
                            : 'Читаю файл',
                        receivedChars: detail === 'writing' ? 320 : 0
                      }
                    });
                    return;
                  }

                  window.removeEventListener('agent-test-update', onUpdate);
                  if (detail === 'error') {
                    reject('Не удалось получить ответ от модели.');
                  } else {
                    resolve({
                      stopReason:
                        detail === 'cancel' ? 'cancelled' : 'end_turn',
                      reasoningSummaries:
                        detail === 'success'
                          ? ['Finished checking the drawing.']
                          : [],
                      responseText:
                        detail === 'success'
                          ? '## Результат проверки\n\n1. Файл прочитан.\n\nРисунок `котик.svg`.\n\n~~~powershell\nGet-Content "котик.svg"\n~~~'
                          : '',
                      outputFiles:
                        detail === 'success'
                          ? [
                              {
                                path: directory + '/котик.svg',
                                relativePath: 'котик.svg'
                                },
                                {
                                  path: directory + '/поставки.csv',
                                  relativePath: 'поставки.csv'
                                },
                                {
                                  path: directory + '/чертёж.dwg',
                                  relativePath: 'чертёж.dwg',
                                  linkOnly: true
                              }
                            ]
                          : []
                    });
                  }
                };

                window.addEventListener('agent-test-update', onUpdate);
              });
            }
          }
        }
      }
    });
  });

  await page.goto('/ai');

  const assistant = page.getByTestId('AI-Assistant');
  const thread = assistant.locator('.ai-assistant__conversation');
  const sidebar = page.getByTestId('AI-MenuPanel');
  await sidebar.getByRole('tab', { name: 'Агенты', exact: true }).click();
  const footer = page.locator('.menu-bottom-nav__ai-control');
  const footerStatus = footer.locator('.menu-bottom-nav__ai-status');
  const row = sidebar
    .locator('.ai-menu-panel__row-main')
    .filter({ hasText: 'Example' });
  const rowStatus = row.locator('.ai-menu-panel__activity-status');
  const panel = page.getByTestId('AI-ActivityPanel');
  const editor = assistant.locator(
    '.ai-assistant__editor [contenteditable=true]:visible'
  );

  const send = async (input: string): Promise<void> => {
    await editor.fill(input);
    await editor.press('Enter');
    await expect(thread.getByText(input, { exact: true })).toBeVisible();
    await expect(
      thread.getByText('Подготавливаю ответ', { exact: false })
    ).toBeVisible();
  };

  const leave = (): Promise<void> =>
    sidebar.getByRole('tab', { name: 'Агенты', exact: true }).click();

  const update = (detail: AgentTestUpdate): Promise<void> =>
    page.evaluate((value): void => {
      window.dispatchEvent(
        new CustomEvent('agent-test-update', { detail: value })
      );
    }, detail);

  const openActivity = async (label: string): Promise<void> => {
    await footer.locator('.menu-bottom-nav__ai-toggle').click();
    await panel.getByRole('button', { name: label }).click();
    await expect(footerStatus).toHaveCount(0);
    await expect(rowStatus).toHaveCount(0);
  };

  await send('Проверь проект');
  const stopButton = assistant.getByRole('button', { name: 'Остановить ответ', exact: true });
  await expect(stopButton).toBeVisible();
  await expect(stopButton).toHaveText('');
  await expect(assistant.locator('.toolbar-button.right:visible')).toHaveCount(0);
  await expect(thread).not.toContainText('< 1 с');
  await update('progress');
  const progress = thread
    .getByRole('status')
    .filter({ has: page.getByRole('region', { name: 'Ход работы агента' }) });
  const toggle = progress.getByRole('button', { name: /Работаю/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(
    progress.getByText('Проверяю формат.', { exact: true })
  ).toBeVisible();
  await expect(progress).toHaveCSS('margin-block-start', '28px');
  await expect(progress).not.toContainText('Обновлено в');
  await update('writing');
  await expect(progress).not.toContainText(/Preparing cat|Implementing path/);
  await expect(
    progress.getByText('Реализую преобразование контуров', { exact: true })
  ).toBeVisible();
  const stages = progress.getByRole('listitem');
  await expect(stages).toHaveText([
    'Посмотрю структуру проекта.',
    /Прочитал файл · котик.svg/,
    'Реализую преобразование контуров',
    /Выполнил команду/,
    'Сохраню рисунок в выбранной папке.'
  ]);
  await toggle.click();
  await expect(stages).toHaveCount(0);
  await toggle.click();
  await expect(progress).toContainText('Получено знаков: 320');
  await expect(progress).toContainText('Сохраню рисунок в выбранной папке.');
  await expect(progress).toContainText('Жду продолжения ответа', {
    timeout: 22_000
  });
  await expect(stages).toHaveCount(5);
  await leave();
  await expect(rowStatus).toHaveClass(/--running/);
  await expect(footerStatus).toHaveClass(/--running/);
  await update('permission');
  await expect(row).toContainText('Требуется подтверждение');
  await expect(rowStatus).toHaveClass(/--attention/);
  await expect(footerStatus).toHaveClass(/--attention/);
  await openActivity('Example. Требуется внимание');
  await expect(assistant.getByLabel('Запрос разрешения')).toBeVisible();
  await expect(thread.getByText(/Последнее обновление/)).toHaveCount(0);

  await leave();
  await expect(footerStatus).toHaveClass(/--attention/);
  await openActivity('Example. Требуется внимание');
  await assistant.getByRole('button', { name: 'Разрешить один раз' }).click();
  await expect(assistant.getByLabel('Запрос разрешения')).toHaveCount(0);
  await leave();
  await update('progress');
  await update('success');
  await expect(row).toContainText('Результат проверки');
  await expect(rowStatus).toHaveClass(/--success/);
  await expect(footerStatus).toHaveClass(/--success/);
  await openActivity('Example. Успешно завершено');
  const answer = thread.locator('.ai-assistant__message--assistant');
  await expect(
    answer.getByRole('heading', { name: 'Результат проверки' })
  ).toBeVisible();
  await expect(answer.locator('li')).toHaveText('Файл прочитан.');
  const leftEdges = await answer.locator('.agent-work__toggle, .ai-assistant__markdown > p, .ai-assistant__markdown > ol > li, .ai-assistant__markdown > .ai-code-block').evaluateAll(
    elements => elements.map(element => element.getBoundingClientRect().left)
  );
  expect(leftEdges).toHaveLength(4);
  expect(Math.max(...leftEdges) - Math.min(...leftEdges)).toBeLessThan(1);
  await expect(answer.locator('.ai-code-block__language')).toHaveText('PowerShell');
  await expect(answer.getByRole('button', { name: 'Копировать код' })).toBeVisible();
  await expect(answer.locator('pre a')).toHaveCount(0);
  await answer.getByRole('link', { name: 'котик.svg' }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-revealed'))
  ).toBe('C:/Projects/Example/котик.svg');
  const picture = answer
    .getByRole('img', { name: 'Изображение', exact: true })
    .first();
  await expect(picture).toBeVisible();
  await expect
    .poll(() =>
      picture.evaluate(image => (image as HTMLImageElement).naturalWidth)
    )
    .toBe(120);
  await picture.click();
  await expect(
    page.locator('.slider-modal__image:not(.slider-modal__image_error)')
  ).toBeVisible();
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('agent-test-history-translation')
    )
  ).toBeNull();
  await expect(
    answer.getByRole('button', { name: /Работа заняла/ })
  ).toHaveAttribute('aria-expanded', 'false');
  await answer.getByRole('button', { name: /Работа заняла/ }).click();
  await expect(
    answer.getByText('Закончил проверку.', { exact: true })
  ).toBeVisible();
  await expect(answer).toHaveCSS('margin-block-start', '28px');
  await expect(answer).toHaveCSS('margin-block-end', '28px');
  await expect(
    answer.getByText('Прочитал файл · котик.svg', { exact: true })
  ).toBeVisible();
  const preview = testInfo.outputPath('agent-work.png');
  await answer.getByLabel('Ход работы агента').screenshot({ path: preview });
  await testInfo.attach('Лента выполненной работы', {
    path: preview,
    contentType: 'image/png'
  });
  await expect(thread.getByText('Читаю файл', { exact: true })).toHaveCount(0);
  await expect(
    thread.getByText('Сохраню рисунок в выбранной папке.')
  ).toBeVisible();

  await send('Продолжи в этой папке');
  await expect(thread.locator('.ai-assistant__message--user').last()).toHaveCSS(
    'margin-block-start',
    '0px'
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-resumes'))
  ).toBeNull();
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-picks'))
  ).toBe('1');
  await editor.fill('Следующий вопрос');
  await stopButton.click();
  await expect(stopButton).toBeHidden();
  await expect(editor).toHaveText('Следующий вопрос');
  await expect(assistant.locator('.toolbar-button.right:visible')).toHaveCount(1);
  await expect(thread.getByRole('status')).toHaveCount(0);

  await page.evaluate((): void => {
    window.dispatchEvent(new Event('agent-test-closed'));
  });
  await send('Проверь следующий файл');
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-resumes'))
  ).toBe('1');
  await leave();
  await update('progress');
  await update('error');
  await expect(row).toContainText('Не удалось получить ответ от модели.');
  await expect(rowStatus).toHaveClass(/--error/);
  await expect(footerStatus).toHaveClass(/--error/);
  await page.reload();
  await expect(sidebar).toBeVisible({ timeout: 30_000 });
  await expect(footerStatus).toHaveClass(/--error/);
  await openActivity('Example. Ошибка');
  await expect(
    thread.getByText('Проверь следующий файл', { exact: true })
  ).toBeVisible();
  await expect(
    thread.getByText('Не удалось получить ответ от модели.', { exact: true })
  ).toHaveCount(1);
  await expect(answer.getByLabel('Ход работы агента')).toHaveCount(2);
  await page.getByRole('button', { name: 'Информация об ИИ-чате', exact: true }).click();
  const infoPanel = page.getByTestId('AiConversationInfo');
  await expect(infoPanel).toBeVisible({ timeout: 15_000 });
  await expect(infoPanel.getByRole('button', { name: 'котик.png' })).toBeVisible();
  await infoPanel.getByRole('tab', { name: 'Файлы', exact: true }).click();
  await expect(infoPanel.getByText('котик.svg', { exact: true })).toBeVisible();
  await infoPanel.getByText('чертёж.dwg', { exact: true }).click();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('agent-test-revealed')))
    .toBe('C:/Projects/Example/чертёж.dwg');
  const downloaded = page.waitForEvent('download');
  await infoPanel.getByText('поставки.csv', { exact: true }).click();
  const csv = await downloaded;
  expect(csv.suggestedFilename()).toBe('поставки.csv');
  expect(await readFile((await csv.path())!, 'utf8')).toBe('Север;3\nЮг;9');
  await infoPanel.getByRole('button', { name: 'Закрыть информацию о чате' }).click();
  await expect(
    answer
      .first()
      .getByRole('button', { name: 'C:/Projects/Example/котик.svg' })
  ).toBeVisible();
  await expect(picture).toBeVisible();
  await answer
    .first()
    .getByRole('button', { name: /Работа заняла/ })
    .click();
  await expect(
    answer
      .first()
      .getByRole('list', { name: 'Этапы работы' })
      .getByRole('listitem')
  ).toHaveText([
    'Посмотрю структуру проекта.',
    /Прочитал файл · котик.svg/,
    'Реализую преобразование контуров',
    /Выполнил команду/,
    'Сохраню рисунок в выбранной папке.',
    'Закончил проверку.'
  ]);
  await expect(
    answer
      .first()
      .getByText('Реализую преобразование контуров', { exact: true })
  ).toBeVisible();
  await expect(thread.getByText('Читаю файл', { exact: true })).toHaveCount(0);

  await page.evaluate((): void => {
    sessionStorage.setItem('agent-test-folder-unavailable', 'true');
  });
  await editor.fill('Начни новую проверку');
  await editor.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Сохранённая папка недоступна.' })
  ).toBeVisible();
  await expect(editor).toHaveText('Начни новую проверку');
  await expect(
    thread.getByText('Начни новую проверку', { exact: true })
  ).toHaveCount(0);
  await page.evaluate((): void => {
    sessionStorage.removeItem('agent-test-folder-unavailable');
  });

  await send('Начни новую проверку');
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-resumes'))
  ).toBe('2');
  expect(
    await page.evaluate(() => sessionStorage.getItem('agent-test-picks'))
  ).toBe('1');
  await leave();
  await update('progress');
  await update('cancel');
  await expect(rowStatus).toHaveClass(/--attention/);
  await expect(footerStatus).toHaveClass(/--attention/);
  await footer.locator('.menu-bottom-nav__ai-toggle').click();
  await expect(panel.getByText('Ответ остановлен')).toBeVisible();
});
