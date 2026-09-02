import { expect, test } from '@playwright/test';

const CHAT_SESSION_ID = 'collapsed-menu-chat';
const TASK_SESSION_ID = 'collapsed-menu-task-chat';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ chatSessionId, taskSessionId }) => {
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
              id: taskSessionId,
              title: 'Чат запланированной задачи',
              description: 'Тест',
              time: '09:00',
              messages: []
            }
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
    { chatSessionId: CHAT_SESSION_ID, taskSessionId: TASK_SESSION_ID }
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

  await expect(task).toBeVisible();
  await expect(chat).toBeVisible();
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

  const separatorStyle = await task.evaluate(element => {
    const style = window.getComputedStyle(element, '::after');
    return {
      borderTopColor: style.borderTopColor,
      borderTopWidth: style.borderTopWidth,
      content: style.content
    };
  });
  expect(separatorStyle.content).not.toBe('none');
  expect(separatorStyle.borderTopColor).toBe('rgb(231, 231, 231)');
  expect(separatorStyle.borderTopWidth).toBe('1px');

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
    'rgb(242, 247, 255)'
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
  const regularChat = expandedPanel.getByText('Рабочий чат', { exact: true });
  await expect(regularChat).toBeVisible();

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

  expect(taskMeasurements.box).toEqual(emptyMeasurements.box);
  expect(taskMeasurements.icon).toEqual(emptyMeasurements.icon);
  expect(taskMeasurements.heading?.y).toBe(emptyMeasurements.heading?.y);
  expect(taskMeasurements.heading?.height).toBe(
    emptyMeasurements.heading?.height
  );
  expect(taskMeasurements.content?.y).toBe(emptyMeasurements.content?.y);
  expect(taskMeasurements.content?.height).toBe(
    emptyMeasurements.content?.height
  );
});
