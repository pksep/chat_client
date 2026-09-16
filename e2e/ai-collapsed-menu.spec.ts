import { expect, test } from './fixtures/ai-history';

const CHAT_SESSION_ID = 'collapsed-menu-chat';
const SECOND_CHAT_SESSION_ID = 'collapsed-menu-second-chat';
const TASK_SESSION_ID = 'collapsed-menu-task-chat';
const TASK_DRAFT_SESSION_ID = 'collapsed-menu-task-draft';

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(
    ({
      chatSessionId,
      secondChatSessionId,
      taskSessionId,
      taskDraftSessionId,
      includeTaskDraft,
      pausedTask
    }) => {
      const organizationUrl = 'http://127.0.0.1:65530';
      Object.defineProperty(navigator, 'standalone', {
        configurable: true,
        value: true
      });
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
      if (!localStorage.getItem('sep:chat:ai-assistant:v1'))
        localStorage.setItem(
          'sep:chat:ai-assistant:v1',
          JSON.stringify({
            sessions: [
              {
                id: chatSessionId,
                title: 'Рабочий чат',
                description: 'Тест',
                time: '10:00',
                messages: []
              },
              {
                id: secondChatSessionId,
                title: 'Второй рабочий чат',
                description: 'Тест разделителя',
                time: '09:30',
                messages: []
              },
              {
                id: taskSessionId,
                title: 'Чат запланированной задачи',
                description: 'Тест',
                time: '09:00',
                messages: []
              },
              ...(includeTaskDraft
                ? [
                    {
                      id: taskDraftSessionId,
                      kind: 'task',
                      title: 'Сводка ожидает подтверждения',
                      description: 'Требуется подтверждение',
                      time: '08:55',
                      messages: []
                    }
                  ]
                : [])
            ],
            tasks: [
              {
                id: 'planned-task',
                sessionId: taskSessionId,
                title: 'Ежедневная сводка',
                description: 'Информация за рабочий день',
                schedule: 'Каждый день в 8:00',
                enabled: !pausedTask
              }
            ],
            permissionMode: 'ask'
          })
        );
      if (!sessionStorage.getItem('menu-collapse'))
        sessionStorage.setItem('menu-collapse', 'true');
    },
    {
      chatSessionId: CHAT_SESSION_ID,
      secondChatSessionId: SECOND_CHAT_SESSION_ID,
      taskSessionId: TASK_SESSION_ID,
      taskDraftSessionId: TASK_DRAFT_SESSION_ID,
      includeTaskDraft: testInfo.title.includes('показывает задачи и AI-чаты'),
      pausedTask: testInfo.title.endsWith(': paused')
    }
  );
});

test('показывает задачи и AI-чаты единым списком в свёрнутом меню', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');

  await page.goto(`/ai/${CHAT_SESSION_ID}`);

  const panel = page.locator('.ai-menu-panel--collapse');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.locator('.ai-menu-panel__tabs')).toHaveCount(0);
  const createButton = panel.getByRole('button', {
    name: 'Создать чат или повторяемую задачу'
  });
  await expect(createButton).toBeVisible();

  const list = panel.getByRole('navigation', {
    name: 'Запланированные задачи и чаты с ИИ'
  });
  const task = list.getByRole('button', {
    name: 'Запланированная задача: Ежедневная сводка'
  });
  const chat = list.getByRole('button', {
    name: 'Чат с ИИ: Рабочий чат'
  });
  const taskDraft = list.getByRole('button', {
    name: 'Задача с ИИ: Сводка ожидает подтверждения'
  });

  await expect(task).toBeVisible();
  await expect(taskDraft).toBeVisible();
  await expect(chat).toBeVisible();
  await expect(taskDraft.locator('.tasks-suggestion-icon')).toHaveCount(1);
  await expect(chat.locator('.tasks-suggestion-icon')).toHaveCount(0);
  await task.hover();
  await expect(
    list.getByRole('button', {
      name: 'Чат с ИИ: Чат запланированной задачи'
    })
  ).toHaveCount(0);
  await expect(chat).toHaveAttribute('aria-current', 'page');
  await expect(chat).toHaveClass(/contact-list__item--active/);
  await expect(task.locator('.ai-menu-panel__collapsed-icon')).toHaveCSS(
    'color',
    'rgb(119, 166, 255)'
  );
  await expect(chat.locator('.ai-menu-panel__collapsed-icon')).toHaveCSS(
    'color',
    'rgb(119, 166, 255)'
  );

  const preview = page.locator('.ai-menu-panel__collapsed-preview');
  const previewItems = preview.locator('.ai-activity-panel__item');
  await task.hover();
  await expect(preview).toBeVisible();
  await expect(previewItems).toHaveCount(1);
  await expect(
    preview.getByText('Ежедневная сводка', { exact: true })
  ).toBeVisible();
  await expect(preview.getByText('Активна', { exact: true })).toBeVisible();
  await expect(
    preview.getByText('Информация за рабочий день', { exact: true })
  ).toBeVisible();
  await expect(preview.getByText('Рабочий чат', { exact: true })).toHaveCount(
    0
  );

  await chat.hover();
  await expect(previewItems).toHaveCount(1);
  await expect(preview.getByText('Рабочий чат', { exact: true })).toBeVisible();
  await expect(
    preview.getByText('Готов к работе', { exact: true })
  ).toBeVisible();
  await expect(preview.locator('.ai-activity-panel__copy small')).toHaveText(
    'Новый чат'
  );

  const [previewBox, hoveredChatBox] = await Promise.all([
    preview.boundingBox(),
    chat.boundingBox()
  ]);
  expect(previewBox!.x).toBeGreaterThan(
    hoveredChatBox!.x + hoveredChatBox!.width
  );

  const separator = task
    .locator('xpath=..')
    .locator('.ai-menu-panel__collapsed-divider');
  await expect(separator).toBeVisible();
  await expect(separator).toHaveCSS('border-top-color', 'rgb(231, 231, 231)');
  await expect(separator).toHaveCSS('border-top-width', '1px');

  const [
    panelBox,
    createButtonBox,
    taskBox,
    chatBox,
    taskAvatarBox,
    chatAvatarBox,
    taskIconBox,
    chatIconBox
  ] = await Promise.all([
    panel.boundingBox(),
    createButton.boundingBox(),
    task.boundingBox(),
    chat.boundingBox(),
    task.locator('.ai-menu-panel__collapsed-avatar').boundingBox(),
    chat.locator('.ai-menu-panel__collapsed-avatar').boundingBox(),
    task.locator('svg').boundingBox(),
    chat.locator('svg').boundingBox()
  ]);

  expect(chatBox).toMatchObject({ height: 58 });
  expect(taskAvatarBox).toMatchObject({ width: 38, height: 38 });
  expect(
    Math.abs(
      createButtonBox!.x +
        createButtonBox!.width / 2 -
        (panelBox!.x + panelBox!.width / 2)
    )
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      taskAvatarBox!.x +
        taskAvatarBox!.width / 2 -
        (panelBox!.x + panelBox!.width / 2)
    )
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      taskAvatarBox!.y +
        taskAvatarBox!.height / 2 -
        (taskBox!.y + taskBox!.height / 2)
    )
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      chatAvatarBox!.y +
        chatAvatarBox!.height / 2 -
        (chatBox!.y + chatBox!.height / 2)
    )
  ).toBeLessThanOrEqual(0.5);
  await expect(task.locator('.ai-menu-panel__collapsed-avatar')).toHaveCSS(
    'background-color',
    'rgb(236, 243, 255)'
  );
  await expect(task.locator('.ai-menu-panel__collapsed-avatar')).toHaveCSS(
    'border-radius',
    '50%'
  );
  expect(taskIconBox).toMatchObject({ width: 24, height: 24 });
  expect(chatIconBox).toMatchObject({ width: 24, height: 24 });

  await task.click();
  await expect(task).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(new RegExp(`/ai/${TASK_SESSION_ID}$`));

  await page.locator('.chats-toolbar__collapse').click();

  const expandedPanel = page.locator(
    '.ai-menu-panel:not(.ai-menu-panel--collapse)'
  );
  await expect(expandedPanel).toBeVisible();
  await expect(
    expandedPanel.getByRole('tab', { name: 'Задачи' })
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    expandedPanel.getByText('Ежедневная сводка', { exact: true })
  ).toBeVisible();
  await expect(
    expandedPanel.getByText('Сводка ожидает подтверждения', { exact: true })
  ).toBeVisible();

  const expandedTaskRow = expandedPanel
    .locator('.ai-menu-panel__row--task')
    .filter({ hasText: 'Ежедневная сводка' });
  const [taskStateBox, taskTitleBox] = await Promise.all([
    expandedTaskRow.locator('.ai-menu-panel__task-state').boundingBox(),
    expandedTaskRow.locator('.ai-menu-panel__row-copy strong').boundingBox()
  ]);
  expect(
    Math.abs(
      taskStateBox!.y +
        taskStateBox!.height / 2 -
        (taskTitleBox!.y + taskTitleBox!.height / 2)
    )
  ).toBeLessThanOrEqual(0.5);

  const draftRow = expandedPanel.locator('.ai-menu-panel__row--task-session');
  const draftIcon = draftRow.locator('.ai-menu-panel__task-state svg');
  await expect(draftIcon).toHaveCSS('width', '16px');
  await expect(draftIcon.locator('path')).toHaveCSS(
    'fill',
    'rgb(184, 184, 184)'
  );
  await draftRow.click({ button: 'right' });
  const draftMenu = page.getByTestId(
    `AI-MenuPanel-TaskSessionContext-${TASK_DRAFT_SESSION_ID}-ContextMenu-Container`
  );
  await expect(
    draftMenu.getByRole('button', { name: 'Удалить задачу' })
  ).toBeVisible();
  await expect(
    draftMenu.getByRole('button', { name: /Остановить|Возобновить|Очистить/ })
  ).toHaveCount(0);
  await draftRow.click();
  await page
    .getByTestId('ChatContainer-ChatContainer-Header-Header-PopoverIcon')
    .click();
  const draftHeaderMenu = page.locator('.chat__header-context-menu:visible');
  await expect(
    draftHeaderMenu.getByRole('button', { name: 'Удалить задачу' })
  ).toBeVisible();
  await expect(
    draftHeaderMenu.getByRole('button', {
      name: /Остановить|Возобновить|Очистить/
    })
  ).toHaveCount(0);
  await page.locator('.ai-assistant__scroll').click();

  const chatsTab = expandedPanel.getByRole('tab', { name: 'Чаты' });
  const tasksTab = expandedPanel.getByRole('tab', { name: 'Задачи' });

  await chatsTab.click();
  await expect(chatsTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/ai$/);
  await expect(
    expandedPanel.locator('.ai-menu-panel__row--active')
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Чем вам помочь сегодня?' })
  ).toBeVisible();
  await expect(
    expandedPanel.getByText('Чат запланированной задачи', { exact: true })
  ).toHaveCount(0);
  await expect(
    expandedPanel.getByText('Сводка ожидает подтверждения', { exact: true })
  ).toHaveCount(0);
  const regularChat = expandedPanel.getByText('Рабочий чат', { exact: true });
  await expect(regularChat).toBeVisible();

  const chatRows = expandedPanel.locator(
    '.ai-menu-panel__row:not(.ai-menu-panel__row--task)'
  );
  const chatDelimiter = expandedPanel.locator(
    '.ai-menu-panel__delimetr:visible'
  );
  await expect(chatRows).toHaveCount(2);
  await expect(chatDelimiter).toHaveCount(1);

  const [firstChatBox, secondChatBox, delimiterBox] = await Promise.all([
    chatRows.nth(0).boundingBox(),
    chatRows.nth(1).boundingBox(),
    chatDelimiter.boundingBox()
  ]);

  expect(Math.abs(delimiterBox!.x - firstChatBox!.x)).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      delimiterBox!.x +
        delimiterBox!.width -
        (firstChatBox!.x + firstChatBox!.width)
    )
  ).toBeLessThanOrEqual(0.5);
  expect(delimiterBox!.y - (firstChatBox!.y + firstChatBox!.height)).toBe(2);
  expect(secondChatBox!.y - (delimiterBox!.y + delimiterBox!.height)).toBe(2);

  await regularChat.click();
  await expect(
    expandedPanel.locator('.ai-menu-panel__row--active')
  ).toHaveCount(1);

  await tasksTab.click();
  await expect(tasksTab).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/ai$/);
  await expect(expandedTaskRow).not.toHaveClass(/ai-menu-panel__row--active/);
  await expect(
    expandedTaskRow.locator('.ai-menu-panel__row-main')
  ).not.toHaveAttribute('aria-current', 'true');
  await expect(
    page.getByRole('heading', { name: 'Автоматизированные задачи' })
  ).toBeVisible();

  await expandedPanel
    .getByText('Сводка ожидает подтверждения', { exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/ai/${TASK_DRAFT_SESSION_ID}$`));
  await expect(tasksTab).toHaveAttribute('aria-selected', 'true');

  await chatsTab.click();
  await expect(chatsTab).toHaveAttribute('aria-selected', 'true');
  await expect(
    expandedPanel.locator('.ai-menu-panel__row--active')
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Чем вам помочь сегодня?' })
  ).toBeVisible();
});

for (const entry of ['раздел задач', 'новая задача', 'сохранённая задача']) {
  test(`не переключает раздел после сообщений: ${entry}`, async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop');
    await page.route('**/api/agents/generalAgent/stream*', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"text-delta","payload":{"text":"Уточните период."}}\n\ndata: {"type":"finish"}\n\n'
      })
    );
    await page.goto(`/ai/${CHAT_SESSION_ID}`);
    await expect(page.locator('.ai-assistant__editor')).toBeVisible({
      timeout: 60_000
    });
    await page.locator('.chats-toolbar__collapse').click();
    const panel = page.getByTestId('AI-MenuPanel');
    const tasksTab = panel.getByRole('tab', { name: 'Задачи', exact: true });
    if (entry === 'новая задача') {
      await panel.getByRole('button', { name: 'Создать', exact: true }).click();
      await page
        .getByRole('button', { name: 'Новая задача', exact: true })
        .click();
    } else {
      await tasksTab.click();
      if (entry === 'сохранённая задача') {
        await panel.getByText('Ежедневная сводка', { exact: true }).click();
      }
    }
    let sessionUrl = '';
    for (const [index, message] of [
      'Сводка по задачам',
      'На этот месяц',
      'Продолжай'
    ].entries()) {
      const editor = page.locator('.ai-assistant__editor');
      await editor.locator('[contenteditable="true"]').fill(message);
      await editor.locator('.toolbar-button.right:visible').click();
      await expect(page.locator('[data-message-id]')).toHaveCount(
        (index + 1) * 2
      );
      await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);
      await expect(tasksTab).toHaveAttribute('aria-selected', 'true');
      if (!sessionUrl) sessionUrl = page.url();
      expect(page.url()).toBe(sessionUrl);
      await expect(panel.locator('.ai-menu-panel__row--active')).toHaveCount(1);
    }
    await page.reload();
    await expect(tasksTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-message-id]')).toHaveCount(6);
  });
}

test('убирает просмотренную задачу из панели активности, не затрагивая остальные', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  let releaseTaskReply!: () => void;
  const taskReplyReady = new Promise<void>(resolve => {
    releaseTaskReply = resolve;
  });
  let releaseChatReply!: () => void;
  const chatReplyReady = new Promise<void>(resolve => {
    releaseChatReply = resolve;
  });
  await page.route('**/api/agents/generalAgent/stream*', async route => {
    const request = route.request().postDataJSON();
    if (request.requestContext.threadId === TASK_SESSION_ID)
      await taskReplyReady;
    if (request.requestContext.threadId === CHAT_SESSION_ID)
      await chatReplyReady;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"text-delta","payload":{"text":"Готово."}}\n\ndata: {"type":"finish"}\n\n'
    });
  });
  try {
    await page.goto(`/ai/${TASK_SESSION_ID}`);
    const editor = page.locator('.ai-assistant__editor');
    await expect(editor).toBeVisible({ timeout: 60_000 });
    await editor.locator('[contenteditable="true"]').fill('Подготовь сводку');
    const taskRequest = page.waitForRequest(
      '**/api/agents/generalAgent/stream*'
    );
    await editor.locator('.toolbar-button.right:visible').click();
    await taskRequest;
    await page
      .getByRole('button', { name: 'Чат с ИИ: Рабочий чат', exact: true })
      .click();
    await editor.locator('[contenteditable="true"]').fill('Подготовь ответ');
    const chatRequest = page.waitForRequest(
      '**/api/agents/generalAgent/stream*'
    );
    await editor.locator('.toolbar-button.right:visible').click();
    await chatRequest;
    await page
      .getByRole('button', {
        name: 'Чат с ИИ: Второй рабочий чат',
        exact: true
      })
      .click();
    releaseChatReply();
    const toggle = page.getByRole('button', {
      name: 'Показать фоновые задачи ИИ'
    });
    await toggle.click();
    const activityPanel = page.getByTestId('AI-ActivityPanel');
    await expect(activityPanel.locator('.ai-activity-panel__item')).toHaveCount(
      2
    );
    await activityPanel
      .getByRole('button', { name: /^Чат запланированной задачи\./ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/ai/${TASK_SESSION_ID}$`));
    await expect(activityPanel).toHaveCount(0);
    await expect(toggle).toHaveCount(1);
    await page
      .getByRole('button', {
        name: 'Чат с ИИ: Второй рабочий чат',
        exact: true
      })
      .click();
    releaseTaskReply();
    await toggle.click();
    await expect(activityPanel.locator('.ai-activity-panel__item')).toHaveCount(
      1
    );
    await activityPanel.getByRole('button', { name: /^Рабочий чат\./ }).click();
    await expect(toggle).toHaveCount(0);
    await page
      .getByRole('button', {
        name: 'Запланированная задача: Ежедневная сводка',
        exact: true
      })
      .click();
    await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);
    await expect(page.locator('[data-message-id]')).toHaveCount(2);
  } finally {
    releaseTaskReply();
    releaseChatReply();
  }
});

for (const initialStatus of ['active', 'paused'] as const) {
  for (const menuMode of ['expanded', 'collapsed'] as const)
    test(`одинаковые действия задачи в меню ${menuMode} и хэдэре: ${initialStatus}`, async ({
      page
    }, testInfo) => {
      const isMobile = testInfo.project.name === 'chromium-mobile';
      test.skip(isMobile && menuMode === 'collapsed');
      if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
      let status: 'active' | 'paused' = initialStatus;
      const automation = {
        id: 'planned-task',
        sessionId: TASK_SESSION_ID,
        title:
          'Ежедневная сводка по всем активным и просроченным задачам производства',
        task: 'Сводка по задачам',
        schedule: 'Ежедневно в 08:00',
        timezone: 'Europe/Moscow',
        nextRunAt: null,
        lastRunAt: null
      };
      await page.route('**/automations', route =>
        route.fulfill({
          json: { automations: [{ ...automation, status }] }
        })
      );
      const requests: Array<Record<string, unknown>> = [];
      await page.route('**/api/agents/generalAgent/stream*', async route => {
        requests.push(route.request().postDataJSON());
        status = status === 'active' ? 'paused' : 'active';
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: 'data: {"type":"text-delta","payload":{"text":"Состояние расписания изменено."}}\n\ndata: {"type":"finish"}\n\n'
        });
      });
      await page.goto(`/ai/${TASK_SESSION_ID}`);
      await expect(page.locator('.ai-assistant__editor')).toBeVisible({
        timeout: 60_000
      });
      const headerTrigger = page.getByTestId(
        'ChatContainer-ChatContainer-Header-Header-PopoverIcon'
      );
      await expect(headerTrigger).toBeVisible();
      await expect(headerTrigger.locator('path, circle').first()).toBeVisible();
      const triggerBox = await headerTrigger.boundingBox();
      expect(triggerBox!.x + triggerBox!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width
      );
      await headerTrigger.click();
      const headerMenu = page.locator('.chat__header-context-menu:visible');
      const initialAction =
        initialStatus === 'active' ? 'Остановить' : 'Возобновить';
      await expect(headerMenu.getByRole('button').first()).toHaveText(
        initialAction
      );
      await expect(
        headerMenu.getByRole('button').first().locator('svg')
      ).toHaveCSS('width', '16px');
      await page.locator('.ai-assistant__scroll').click();
      if (isMobile) {
        await page
          .getByTestId('ChatContainer-ChatContainer-Header-Header-BackButton')
          .click();
      } else if (menuMode === 'expanded') {
        await page.locator('.chats-toolbar__collapse').click();
      }
      const panel = page.getByTestId('AI-MenuPanel');
      const row =
        menuMode === 'collapsed'
          ? panel.getByRole('button', {
              name: `Запланированная задача: ${automation.title}`
            })
          : panel
              .locator('.ai-menu-panel__row--task')
              .filter({ hasText: 'Ежедневная сводка' });
      if (menuMode === 'expanded') {
        const state = row.locator('.ai-menu-panel__task-state svg');
        await expect(state).toHaveAttribute('viewBox', '0 0 16 16');
        await expect(state).toHaveCSS('width', '16px');
        await expect(state).toHaveCSS('height', '16px');
        for (const theme of ['theme-light', 'theme-dark']) {
          await page.locator('.chat-container').evaluate((element, theme) => {
            element.classList.remove('theme-light', 'theme-dark');
            element.classList.add(theme);
          }, theme);
          await expect(state.locator('path').first()).toHaveCSS(
            'fill',
            initialStatus === 'active'
              ? 'rgb(119, 166, 255)'
              : 'rgb(255, 184, 51)'
          );
        }
        await expect(state.locator('rect')).toHaveCount(
          initialStatus === 'paused' ? 2 : 0
        );
      }
      await row.click({ button: 'right' });
      const firstAction = page.getByRole('button', {
        name: initialAction,
        exact: true
      });
      await expect(firstAction).toBeVisible();
      await expect(page.getByRole('button', { name: /Очистить/ })).toHaveCount(
        0
      );
      await firstAction.click();
      await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);
      await expect.poll(() => requests.length).toBe(1);
      expect(JSON.stringify(requests[0])).toContain(
        initialStatus === 'active' ? 'Приостанови' : 'Возобнови'
      );
      await page
        .getByTestId('ChatContainer-ChatContainer-Header-Header-PopoverIcon')
        .click();
      await expect(headerMenu.getByRole('button').first()).toHaveText(
        initialStatus === 'active' ? 'Возобновить' : 'Остановить'
      );
      await expect(
        headerMenu.getByRole('button', { name: /Очистить/ })
      ).toHaveCount(0);
      await expect(
        headerMenu.getByRole('button', { name: 'Удалить задачу', exact: true })
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('task-header-menu.png')
      });
      await headerMenu.getByRole('button').first().click();
      await expect.poll(() => requests.length).toBe(2);
      expect(JSON.stringify(requests[1])).toContain(
        initialStatus === 'active' ? 'Возобнови' : 'Приостанови'
      );
    });
}

test('троеточие доступно на стартовом экране ИИ и при создании задачи', async ({
  page
}) => {
  await page.goto('/ai');
  const headerTrigger = page.getByTestId(
    'ChatContainer-ChatContainer-Header-Header-PopoverIcon'
  );
  await expect(headerTrigger).toBeVisible({ timeout: 60_000 });
  await headerTrigger.click();
  const menu = page.locator('.chat__header-context-menu:visible');
  await menu.getByRole('button', { name: 'Новая задача', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Автоматизированные задачи' })
  ).toBeVisible();
  await expect(headerTrigger).toBeVisible();
  await headerTrigger.click();
  await menu.getByRole('button', { name: 'Новый чат', exact: true }).click();
  await expect(page.locator('.ai-assistant__suggestions')).toBeVisible();
  await expect(headerTrigger).toBeVisible();
});

test('сохраняет геометрию стартового блока при переходе к задачам', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  await page.addInitScript(() => {
    localStorage.setItem('chat_wallpaper_selection_v2', 'wallpaper1');
  });
  await page.goto('/ai');
  await page.locator('.chats-toolbar__collapse').click();
  await page.locator('.chat-container').evaluate(async element => {
    await Promise.all(
      element.getAnimations().map(animation => animation.finished)
    );
  });

  const menu = page.locator('.ai-menu-panel:not(.ai-menu-panel--collapse)');
  await expect(menu).toBeVisible({ timeout: 30_000 });
  const empty = page.locator('.ai-assistant__empty');
  await expect(empty).toBeVisible();
  const emptyMeasurements = await empty.evaluate(element => ({
    box: element.getBoundingClientRect().toJSON(),
    heading: element.querySelector('h1')?.getBoundingClientRect().toJSON(),
    content: element
      .querySelector('.ai-assistant__suggestions')
      ?.getBoundingClientRect()
      .toJSON(),
    icon: element
      .querySelector('.ai-assistant__hero-icon')
      ?.getBoundingClientRect()
      .toJSON()
  }));

  await menu.getByRole('tab', { name: 'Задачи' }).click();
  const tasks = page.locator('.ai-assistant__tasks');
  await expect(tasks).toBeVisible();
  const taskMeasurements = await tasks.evaluate(element => ({
    box: element.getBoundingClientRect().toJSON(),
    heading: element.querySelector('h1')?.getBoundingClientRect().toJSON(),
    content: element
      .querySelector('.ai-assistant__automation-list')
      ?.getBoundingClientRect()
      .toJSON(),
    icon: element
      .querySelector('.ai-assistant__tasks-icon')
      ?.getBoundingClientRect()
      .toJSON()
  }));

  expect(taskMeasurements.box?.x).toBe(emptyMeasurements.box?.x);
  expect(taskMeasurements.box?.width).toBe(emptyMeasurements.box?.width);
  expect(taskMeasurements.box!.y + taskMeasurements.box!.height / 2).toBe(
    emptyMeasurements.box!.y + emptyMeasurements.box!.height / 2
  );
  expect(taskMeasurements.icon?.width).toBe(emptyMeasurements.icon?.width);
  expect(taskMeasurements.icon?.height).toBe(emptyMeasurements.icon?.height);
  expect(taskMeasurements.icon!.y - taskMeasurements.box!.y).toBe(
    emptyMeasurements.icon!.y - emptyMeasurements.box!.y
  );
  expect(taskMeasurements.heading!.y - taskMeasurements.box!.y).toBe(
    emptyMeasurements.heading!.y - emptyMeasurements.box!.y
  );
  expect(taskMeasurements.heading?.height).toBe(
    emptyMeasurements.heading?.height
  );
  expect(taskMeasurements.content!.y - taskMeasurements.box!.y).toBe(
    emptyMeasurements.content!.y - emptyMeasurements.box!.y
  );
});

for (const theme of ['theme-light', 'theme-dark']) {
  test(`панель активности и стандартная подсказка успешного статуса: ${theme}`, async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop');
    await page.addInitScript(value => {
      localStorage.setItem('erp-theme-color-scheme', value);
    }, theme);

    let finishReply!: () => void;
    const replyReady = new Promise<void>(resolve => {
      finishReply = resolve;
    });
    await page.route('**/api/agents/generalAgent/stream*', async route => {
      await replyReady;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          { type: 'text-delta', payload: { text: 'Проверка завершена.' } },
          { type: 'finish' }
        ]
          .map(event => `data: ${JSON.stringify(event)}\n\n`)
          .join('')
      });
    });

    try {
      await page.goto(`/ai/${CHAT_SESSION_ID}`);
      const chat = page.getByRole('button', { name: 'Чат с ИИ: Рабочий чат' });
      await expect(chat).toBeVisible({ timeout: 30_000 });
      await chat.hover();

      const preview = page.getByTestId(
        'AI-MenuPanel-CollapsedPreview-Activity'
      );
      await expect(preview).toBeVisible();
      await expect(preview).toHaveCSS('padding', '10px');
      await expect(preview).toHaveCSS('border-radius', '15px');
      await expect(page.locator('.ai-menu-panel__collapsed-preview')).toHaveCSS(
        'border-radius',
        '15px'
      );
      await page.screenshot({
        path: testInfo.outputPath('activity-panel.png')
      });

      const editor = page.locator(
        '.ai-assistant__editor [contenteditable="true"]'
      );
      await editor.fill('Проверь фоновый статус');
      await expect(
        page.locator('.ai-assistant__editor .toolbar-button.right:visible')
      ).toBeEnabled();
      const streamRequest = page.waitForRequest(
        '**/api/agents/generalAgent/stream*'
      );
      await editor.press('Enter');
      await streamRequest;
      await page
        .getByRole('button', { name: 'Чат с ИИ: Второй рабочий чат' })
        .click();
      await page.locator('.chats-toolbar__collapse').click();
      await page.locator('.chat-container').evaluate(async element => {
        await Promise.all(
          element.getAnimations().map(animation => animation.finished)
        );
      });

      const status = page.locator('.ai-menu-panel__activity-status');
      const tooltip = page.locator('.tooltip-yui-kit__hint_show');
      await expect(status).toHaveClass(
        /ai-menu-panel__activity-status--running/
      );
      await expect(status).toHaveCSS('width', '24px');
      await expect(status).toHaveCSS('height', '24px');
      await expect(status.locator('svg')).toHaveCount(0);
      const bottomStatus = page.locator('.menu-bottom-nav__ai-status--running');
      await expect(bottomStatus).toBeVisible();
      for (const property of [
        'border-top-color',
        'border-right-color',
        'animation-name'
      ]) {
        await expect(status).toHaveCSS(
          property,
          await bottomStatus.evaluate(
            (element, name) => getComputedStyle(element).getPropertyValue(name),
            property
          )
        );
      }
      await expect(status).not.toHaveAttribute('title');
      await status.hover();
      await expect(tooltip).toHaveText('Выполняется');

      finishReply();
      await expect(status).toHaveClass(
        /ai-menu-panel__activity-status--success/
      );
      await expect(status).toHaveCSS('box-shadow', 'none');
      await expect(status).toHaveCSS('border-width', '0px');
      await expect(status).toHaveCSS('width', '12px');
      await expect(status).toHaveCSS('height', '12px');
      await expect(tooltip).toHaveText('Успешно завершено');
      await page.screenshot({
        path: testInfo.outputPath('success-tooltip.png')
      });

      await page.mouse.move(900, 300);
      await expect(tooltip).toHaveCount(0);
      await status.click();
      await expect(page).toHaveURL(new RegExp(`/ai/${CHAT_SESSION_ID}$`));
      await expect(status).toHaveCount(0);
    } finally {
      finishReply();
    }
  });
}

test('показывает чистый индикатор работы и тёмный переключатель статусов', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');

  await page.addInitScript(() => {
    localStorage.setItem('erp-theme-color-scheme', 'theme-dark');
  });

  let releaseStream: (() => void) | undefined;
  await page.route(
    'http://127.0.0.1:4111/api/agents/generalAgent/stream',
    async route => {
      await new Promise<void>(resolve => {
        releaseStream = resolve;
      });
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Тестовая остановка ответа' })
      });
    }
  );

  try {
    await page.goto(`/ai/${CHAT_SESSION_ID}`);

    const editor = page.locator(
      '.ai-assistant__editor [contenteditable="true"]'
    );
    await expect(editor).toBeVisible({ timeout: 30_000 });
    await editor.fill('Проверь фоновый статус');
    await expect(
      page.locator('.ai-assistant__editor .toolbar-button.right:visible')
    ).toBeEnabled();

    const streamRequest = page.waitForRequest(
      request =>
        request.method() === 'POST' &&
        request.url() === 'http://127.0.0.1:4111/api/agents/generalAgent/stream'
    );
    await editor.press('Enter');
    await streamRequest;

    await page
      .getByRole('button', { name: 'Чат с ИИ: Второй рабочий чат' })
      .click();

    const status = page.locator('.menu-bottom-nav__ai-status--running');
    await expect(status).toBeVisible();
    await expect(status).toHaveCSS('width', '12px');
    await expect(status).toHaveCSS('height', '12px');
    await expect(status).toHaveCSS(
      'animation-name',
      'menu-bottom-nav-ai-status-spin'
    );
    await expect(status.locator(':scope > *')).toHaveCount(0);

    const toggle = page.locator('.menu-bottom-nav__ai-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveCSS('background-color', 'rgb(96, 104, 132)');
    await expect(toggle).toHaveCSS('color', 'rgb(255, 255, 255)');
  } finally {
    releaseStream?.();
  }
});
