import { expect, test, type Page } from './fixtures/ai-history';

async function setCount(
  page: Page,
  count: number,
  muted = false
): Promise<void> {
  await page.evaluate(
    async ({ count, muted }): Promise<void> => {
      const url = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === '/src/composables/useTopics.ts');
      if (!url) throw new Error('Список чатов ещё не загружен');

      const { setTopics } = await import(url);
      setTopics([
        {
          id: 'inquiry-badge',
          type: 'GROUP',
          name: 'Клиент сайта',
          group: {
            id: 'inquiry-group',
            name: 'Клиент сайта',
            description: 'sep-chat:external-inquiry:v1'
          },
          unreadMessageCount: count,
          info: { isMute: muted },
          lastMessage: {
            id: 'guest-message',
            senderUserId: 'guest',
            text: 'Здравствуйте!',
            isSystem: false
          }
        }
      ]);
    },
    { count, muted }
  );
}

test.beforeEach(async ({ page }): Promise<void> => {
  await page.addInitScript((): void => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_AUTH_API: url,
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: url
          }
        }
      ])
    );
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'synthetic-inquiry-test',
        user: { id: 'inquiry-test-user', initials: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');
  });
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({
      json: [
        {
          id: 'synthetic-inquiry',
          topic_id: 'inquiry-badge',
          guest_user_id: 'guest',
          name: 'Клиент сайта',
          contacts: {},
          source: { channel: 'widget' },
          manager_ids: [],
          assignee_id: null,
          note: '',
          metadata_version: 0,
          erp_contact_id: null,
          created_at: '2026-10-14T05:30:00.000Z'
        }
      ]
    })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
});

test('настройки виджета автоматически сохраняются при выходе, смене раздела и обновлении', async ({
  page
}): Promise<void> => {
  test.setTimeout(90_000);
  const config = {
    initialMessage: '',
    welcomeMessages: ['Узнать цену'],
    socialLinks: { vk: '', avito: '', telegram: '', max: '' },
    schedule: {
      start: '08:00',
      end: '18:00',
      days: [1, 2, 3],
      timezone: 'Europe/Moscow'
    },
    autoOpenDelayMs: null
  };
  const posts: unknown[] = [];
  const siteSettings = new Map([
    ['first', { version: 1, settings: config }],
    [
      'second',
      {
        version: 1,
        settings: {
          ...config,
          initialMessage: 'Для второго сайта',
          schedule: { ...config.schedule, days: [0, 1, 2, 3, 4, 6] }
        }
      }
    ]
  ]);
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'inquiry-test-user',
        effective: { ai: false, client: true }
      }
    })
  );
  await page.route('**/manager/widget-sites', route =>
    route.fulfill({
      json: [
        { id: 'first', name: 'Первый сайт' },
        { id: 'second', name: 'Второй сайт' }
      ]
    })
  );
  await page.route('**/manager/widget-sites/*', route => {
    const path = new URL(route.request().url()).pathname;
    const id = path.split('/').at(-1) || '';
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.version !== siteSettings.get(id)?.version)
        return route.fulfill({ status: 409, json: {} });
      posts.push({ path, body });
      const updated = { version: body.version + 1, settings: body.settings };
      siteSettings.set(id, updated);

      return route.fulfill({ json: updated });
    }

    return route.fulfill({ json: siteSettings.get(id) });
  });

  await page.goto('/');
  await page
    .locator('.menu-bottom-nav:visible [data-testid$="MenuBottomNav-Clients"]')
    .click({ timeout: 30_000 });
  const gear = page.getByRole('button', { name: 'Настройки виджета' });
  await expect(gear).toBeVisible({ timeout: 30_000 });
  await expect(gear).toBeEnabled({ timeout: 15_000 });
  await expect(gear).toHaveCSS('width', '24px');
  const clientsTitle = page.getByTestId('Clients-ChatsToolbar-Title');
  const headerStyle = await clientsTitle.evaluate(element => {
    const { fontSize, fontWeight, lineHeight } = getComputedStyle(element);

    return { fontSize, fontWeight, lineHeight };
  });
  await gear.click();
  const form = page.getByRole('region', { name: 'Настройки виджета' });
  const title = form.getByRole('heading', { name: 'Настройки', exact: true });
  await expect(title).toHaveCSS('font-size', headerStyle.fontSize);
  await expect(title).toHaveCSS('font-weight', headerStyle.fontWeight);
  await expect(title).toHaveCSS('line-height', headerStyle.lineHeight);
  const greeting = form.getByRole('textbox', {
    name: 'Приветственное сообщение'
  });
  await expect(greeting).toBeVisible();
  await expect(greeting.locator('xpath=ancestor::fieldset[1]')).toHaveCSS(
    'background-color',
    'rgb(248, 249, 253)'
  );
  for (const heading of [
    'Приветственное сообщение',
    'Часы работы',
    'Рабочие дни',
    'Соцсети',
    'Шаблоны сообщений'
  ]) {
    const label = form.getByText(heading, { exact: true });
    await expect(label).toHaveCSS('font-size', '16px');
    await expect(label).toHaveCSS('margin-top', '10px');
    await expect(label).toHaveCSS('margin-bottom', '10px');
  }
  await expect(form.getByText('Europe/Moscow')).toHaveCount(0);
  await expect(form.getByText('Открывать автоматически')).toHaveCount(0);
  const addTemplate = form.getByRole('button', { name: 'Добавить шаблон' });
  await expect(addTemplate).toHaveCSS('height', '30px');
  const vk = form.getByText('ВКонтакте', { exact: true });
  await expect(vk).toHaveCSS('font-size', '14px');
  const vkSpacing = await vk.evaluate(element => {
    const input = element.parentElement?.querySelector('fieldset');

    return (
      (input?.getBoundingClientRect().left ?? 0) -
      element.getBoundingClientRect().right
    );
  });
  expect(vkSpacing).toBeGreaterThanOrEqual(10);
  await form.getByTestId('WidgetSettings-Site-SelectedText').click();
  await page.getByTestId('WidgetSettings-Site-Options-1').click();
  await expect(greeting).toHaveValue('Для второго сайта');
  await greeting.fill('Здравствуйте!');
  await form.getByRole('textbox', { name: 'Telegram' }).fill('https://t.me/qa');
  const delay = form.getByTestId('WidgetSettings-Delay-Input');
  await expect(delay).toHaveValue('0');
  await delay.fill('2.5');
  const panelContent = form.locator('.client-widget-settings__content');
  const dayControl = form.getByTestId('WidgetSettings-Days-Current');
  await expect(dayControl).toHaveCSS('height', '36px');
  await dayControl.click();
  const dayList = form.getByTestId('WidgetSettings-Days-OptionsList');
  await expect(dayList).toBeVisible();
  const layout = await panelContent.evaluate(element => {
    const icons = Array.from(
      element.querySelectorAll('.client-widget-settings__social-icon > *')
    ).map(icon => {
      const { width, height } = icon.getBoundingClientRect();

      return [width, height];
    });

    return {
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
      icons
    };
  });
  expect(layout.scrollWidth).toBe(layout.width);
  expect(layout.icons).toEqual(Array.from({ length: 4 }, () => [20, 20]));
  expect((await dayList.boundingBox())?.width).toBeLessThan(layout.width);

  await expect(dayList.getByRole('checkbox')).toHaveCount(7);
  const monday = dayList.getByRole('checkbox', { name: 'Понедельник' });
  const friday = dayList.getByRole('checkbox', { name: 'Пятница' });
  await expect(monday).toBeChecked();
  await expect(friday).not.toBeChecked();
  await dayList.getByText('Понедельник', { exact: true }).click();
  await friday.press('Space');
  await expect(monday).not.toBeChecked();
  await expect(friday).toBeChecked();
  await expect(dayList).toBeVisible();
  await title.click();
  await form
    .getByTestId('WidgetSettings-TimeStart')
    .locator('.time-picker-select-content')
    .click({ timeout: 10_000 });
  await page
    .locator('.time-picker__input_hour input:visible')
    .fill('09', { timeout: 10_000 });
  await page
    .locator('.time-picker-actions')
    .getByRole('button', { name: 'Сохранить' })
    .click();
  await addTemplate.click();
  await form
    .getByRole('textbox', { name: 'Шаблон 2' })
    .fill('Поговорить с менеджером');
  await expect(
    form.getByRole('button', { name: 'Сохранить', exact: true })
  ).toHaveCount(0);
  expect(posts).toHaveLength(0);
  const back = form.getByRole('button', { name: 'Назад к клиентам' });
  await back.click();
  await expect(gear).toBeVisible();
  expect(posts).toEqual([
    {
      path: '/manager/widget-sites/second',
      body: {
        version: 1,
        settings: {
          ...config,
          initialMessage: 'Здравствуйте!',
          autoOpenDelayMs: 2500,
          schedule: {
            ...config.schedule,
            start: '09:00',
            days: [0, 2, 3, 4, 5, 6]
          },
          socialLinks: { ...config.socialLinks, telegram: 'https://t.me/qa' },
          welcomeMessages: ['Узнать цену', 'Поговорить с менеджером']
        }
      }
    }
  ]);
  await gear.click();
  await expect(greeting).toHaveValue('');
  await back.click();
  await expect(gear).toBeVisible();
  expect(posts).toHaveLength(1);

  const nav = page.locator('.menu-bottom-nav:visible');
  const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
  await gear.click();
  await greeting.fill('Выход через меню');
  await delay.fill('1');
  await delay.fill('0');
  await nav.locator('[data-testid$="MenuBottomNav-Chats"]').click();
  await expect(form).toHaveCount(0);
  await expect
    .poll(() => siteSettings.get('first')?.settings.initialMessage)
    .toBe('Выход через меню');
  expect(posts).toHaveLength(2);
  expect(siteSettings.get('first')?.settings.autoOpenDelayMs).toBe(0);

  await clients.click();
  await gear.click();
  await expect(greeting).toHaveValue('Выход через меню');
  await greeting.fill('Выход через обновление');
  await page.reload();
  await expect
    .poll(() => siteSettings.get('first')?.settings.initialMessage, {
      timeout: 15_000
    })
    .toBe('Выход через обновление');
  expect(posts).toHaveLength(3);
});

test('шестерёнка не открывает настройки без ответа Manager и оживает после восстановления', async ({
  page
}): Promise<void> => {
  test.setTimeout(75_000);
  await page.route('**/users/me/access', route =>
    route.fulfill({
      json: {
        userId: 'inquiry-test-user',
        effective: { ai: false, client: true }
      }
    })
  );
  let available = false;
  await page.route('**/manager/widget-sites', route =>
    available
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 503, json: {} })
  );

  await page.goto('/');
  await page
    .locator('.menu-bottom-nav:visible [data-testid$="MenuBottomNav-Clients"]')
    .click({ timeout: 30_000 });
  const gear = page.getByRole('button', { name: 'Настройки виджета' });
  await expect(gear).toBeDisabled({ timeout: 30_000 });
  await expect(gear).toHaveAttribute(
    'aria-description',
    'Сервер виджета недоступен'
  );
  await page.getByTestId('Clients-WidgetSettingsTooltip').hover();
  await expect(page.locator('.tooltip-yui-kit__hint_show')).toHaveText(
    'Сервер виджета недоступен'
  );
  await expect(
    page.getByRole('region', { name: 'Настройки виджета' })
  ).toHaveCount(0);

  available = true;
  await expect(gear).toBeEnabled({ timeout: 20_000 });
  available = false;
  await gear.click();
  await expect(gear).toHaveAttribute(
    'aria-description',
    'Сервер виджета недоступен'
  );
  await expect(
    page.getByRole('region', { name: 'Настройки виджета' })
  ).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
  test(`плашки клиентов ограничены 9+ и остаются круглыми: ${theme}`, async ({
    page
  }, testInfo): Promise<void> => {
    await page.goto('/');
    const nav = page.locator('.menu-bottom-nav:visible');
    const clients = nav.locator('[data-testid$="MenuBottomNav-Clients"]');
    await expect(clients).toBeVisible({ timeout: 30000 });
    await page.evaluate((theme: string): void => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.classList.toggle('theme-dark', theme === 'dark');
      document.documentElement.classList.toggle(
        'theme-light',
        theme === 'light'
      );
    }, theme);
    const badge = clients.locator('.menu-bottom-nav__unread-count');

    for (const count of [1, 9, 10, 11242]) {
      await setCount(page, count);
      await expect(badge).toHaveText(count > 9 ? '9+' : String(count));
      await expect(clients).toHaveAttribute(
        'aria-label',
        `Клиенты. Непрочитанных: ${count}`
      );
      const box = await badge.boundingBox();
      expect(box!.height).toBeCloseTo(box!.width, 1);
      expect(box!.width).toBeLessThan(25);
    }

    await clients.click();
    const listBadge = page.locator(
      '[data-testid$="ContactList-Notification1"]:visible'
    );
    await expect(listBadge).toHaveText('9+');
    await nav.screenshot({
      path: testInfo.outputPath(`inquiry-badge-${theme}.png`)
    });
    await setCount(page, 2, true);
    await expect(badge).toHaveClass(/--muted/);
    await setCount(page, 0);
    await expect(badge).toHaveCount(0);
  });
}

test('настоящий список сообщений скрывает старые события обращения, но не обычной группы', async ({
  page
}): Promise<void> => {
  await page.goto('/');
  await expect(
    page.locator('[data-testid$="MenuBottomNav-Clients"]:visible')
  ).toBeVisible({ timeout: 30000 });
  await page.evaluate(async (): Promise<void> => {
    const resources = performance
      .getEntriesByType('resource')
      .map(entry => entry.name);
    const managerUrl = resources.find(
      url => new URL(url).pathname === '/src/composables/useManagerInquiries.ts'
    );
    const vueUrl = resources.find(url =>
      new URL(url).pathname.endsWith('/deps/vue.js')
    );
    if (!managerUrl || !vueUrl)
      throw new Error('Не загружены зависимости проверки истории');

    const { refreshManagerInquiries } = await import(managerUrl);
    await refreshManagerInquiries();
    const { createApp } = await import(vueUrl);
    const componentUrl = '/src/components/Messages/MessageListUserItems.vue';
    const { default: MessageList } = await import(componentUrl);
    const host = document.createElement('div');
    host.id = 'legacy-inquiry-probe';
    document.body.append(host);
    const common = {
      createdAt: '2026-10-14T05:30:00.000Z',
      senderUserId: 'guest',
      senderUser: { id: 'guest', initials: 'Посетитель' },
      media: [],
      reactions: [],
      isReadByMe: true
    };

    createApp(MessageList, {
      dataTestid: 'LegacyInquiryProbe',
      authUserId: 'inquiry-test-user',
      messages: [
        {
          ...common,
          id: 'legacy-staff-event',
          topicId: 'inquiry-badge',
          isSystem: true,
          text: 'Техническое исключение сотрудника'
        },
        {
          ...common,
          id: 'guest-visible-message',
          topicId: 'inquiry-badge',
          isSystem: false,
          text: 'Здравствуйте!'
        },
        {
          ...common,
          id: 'ordinary-group-event',
          topicId: 'ordinary-group',
          isSystem: true,
          text: 'Участник вошёл в обычную группу'
        }
      ]
    }).mount(host);
  });
  const history = page.locator('#legacy-inquiry-probe');
  await expect(history).toContainText('Здравствуйте!');
  await expect(history).toContainText('Участник вошёл в обычную группу');
  await expect(history).not.toContainText('Техническое исключение сотрудника');
});
