import { expect, test } from '@playwright/test';

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
      includeTaskDraft
    }) => {
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
              enabled: true
            }
          ],
          permissionMode: 'ask'
        })
      );
      sessionStorage.setItem('menu-collapse', 'true');
    },
    {
      chatSessionId: CHAT_SESSION_ID,
      secondChatSessionId: SECOND_CHAT_SESSION_ID,
      taskSessionId: TASK_SESSION_ID,
      taskDraftSessionId: TASK_DRAFT_SESSION_ID,
      includeTaskDraft: testInfo.title.includes('показывает задачи и AI-чаты')
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

  const [expandedPanelBox, firstChatBox, secondChatBox, delimiterBox] =
    await Promise.all([
      expandedPanel.boundingBox(),
      chatRows.nth(0).boundingBox(),
      chatRows.nth(1).boundingBox(),
      chatDelimiter.boundingBox()
    ]);

  expect(Math.abs(delimiterBox!.x - expandedPanelBox!.x)).toBeLessThanOrEqual(
    0.5
  );
  expect(
    Math.abs(
      delimiterBox!.x +
        delimiterBox!.width -
        (expandedPanelBox!.x + expandedPanelBox!.width)
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
