import { expect, test, type Page } from './fixtures/ai-history';

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.locator('dialog.ios-push-modal[open]'),
    async dialog => {
      await dialog
        .getByRole('button', { name: 'Настроить позже', exact: true })
        .click();
    }
  );
  await page.addInitScript(() => {
    const url = 'http://127.0.0.1:65530';
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      value: true
    });
    localStorage.setItem(
      'chat_runtime_organizations',
      JSON.stringify([
        {
          url,
          config: {
            CHAT_API_DOMAIN: url,
            CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530',
            CHAT_MASTRA_URL: 'http://127.0.0.1:4111',
            CHAT_ERP_URL: 'http://127.0.0.1:5000'
          }
        }
      ])
    );
    localStorage.setItem('chat_runtime_last_organization', url);
    localStorage.setItem(
      'chat_auth_session',
      JSON.stringify({
        token: 'local-ui-test',
        user: { id: 'local-ui-test-user', initials: 'Тест' }
      })
    );
    sessionStorage.setItem('menu-collapse', 'false');
  });
  await page.route('**/manager/access', route =>
    route.fulfill({ json: { allowed: true } })
  );
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({ json: [] })
  );
  await page.route('**/manager/managers', route => route.fulfill({ json: [] }));
});

// Завершение реального обновления, которое обычно запускается по таймеру.
const refreshInquiries = (page: Page) =>
  page.evaluate(async () => {
    // Используем тот же экземпляр модуля, включая версию Vite после HMR.
    const moduleUrl = performance
      .getEntriesByType('resource')
      .map(entry => entry.name)
      .find(
        url =>
          new URL(url).pathname === '/src/composables/useManagerInquiries.ts'
      );
    if (!moduleUrl) throw new Error('Модуль обращений ещё не загружен');
    const { refreshManagerInquiries } = await import(moduleUrl);
    await refreshManagerInquiries();
  });

test('Мобильные папки находятся сверху, фильтры типов управляют списком', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Проверка мобильной навигации');
  await page.goto('/');
  const chats = page.locator('.mobile-list-container__section--chats');
  await expect(chats.locator('.chat-folder-rail--mobile')).toBeVisible({
    timeout: 30000
  });
  await page.evaluate(async () => {
    const moduleUrl = (path: string) => {
      const url = performance
        .getEntriesByType('resource')
        .map(entry => entry.name)
        .find(url => new URL(url).pathname === path);
      if (!url) throw new Error(`Модуль ${path} ещё не загружен`);
      return url;
    };
    const { useChatsToolbarState } = await import(
      moduleUrl('/src/composables/useChatsToolbarState.ts')
    );
    useChatsToolbarState().setFilter('groups');
    const { setTopics } = await import(
      moduleUrl('/src/composables/useTopics.ts')
    );
    setTopics([
      {
        id: 'mobile-dm',
        type: 'DM',
        name: 'Личный тест',
        user: { id: 'peer-user', initials: 'Личный тест' },
        info: {},
        unreadMessageCount: 0
      },
      {
        id: 'mobile-group',
        type: 'GROUP',
        name: 'Групповой тест',
        group: { id: 'mobile-group', name: 'Групповой тест' },
        info: {},
        unreadMessageCount: 0
      }
    ]);
  });
  await expect(chats.locator('.chats-toolbar__filters')).toBeVisible();
  await expect(
    chats.getByRole('heading', { name: 'Личный тест', exact: true })
  ).toHaveCount(0);
  await expect(
    chats.getByRole('heading', { name: 'Групповой тест', exact: true })
  ).toBeVisible();
  await expect(
    chats.locator('.chat-folder-rail__items > button').first()
  ).toHaveAttribute('data-testid', 'ChatFolders-Rail-All');
  const search = (await chats.locator('.chats-toolbar__search').boundingBox())!;
  const folders = (await chats.locator('.chat-folder-rail').boundingBox())!;
  expect(search.y - folders.y - folders.height).toBe(10);
  const filters = chats.locator('.chats-toolbar__filters');
  expect((await filters.boundingBox())!.y - search.y - search.height).toBe(10);
  await filters.getByRole('button', { name: 'Чаты', exact: true }).tap();
  await expect(
    chats.getByRole('heading', { name: 'Личный тест', exact: true })
  ).toBeVisible();
  await expect(
    chats.getByRole('heading', { name: 'Групповой тест', exact: true })
  ).toHaveCount(0);
  await filters.getByRole('button', { name: 'Все', exact: true }).tap();
  await expect(chats.locator('.contact-list__li')).toHaveCount(2);
  await chats.getByTestId('ChatFolders-Rail-Manage').tap();
  await expect(chats.getByTestId('ChatFolders-Panel')).toBeVisible();
});

for (const scope of ['chats', 'clients'] as const) {
  test(`Панель папок сохраняет возврат к спискам: ${scope}`, async ({
    page,
    isMobile
  }, testInfo) => {
    test.skip(!isMobile);
    test.setTimeout(60000);
    const channels = ['widget', 'avito', 'vk', 'telegram', 'max', 'support'];
    await page.route('**/manager/inquiries?*', route =>
      route.fulfill({
        json: channels.map((channel, index) => ({
          id: `inquiry-${index}`,
          topic_id: `client-${index}`,
          name: `Клиент ${index}`,
          contacts: {},
          source: { channel },
          manager_ids: index === 0 ? [] : ['local-ui-test-user'],
          metadata_version: 1
        }))
      })
    );
    await page.goto('/');
    const nav = page.locator('.menu-bottom-nav:visible');
    await expect(nav).toBeVisible({ timeout: 30000 });
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Clients"]')
    ).toBeVisible();
    await page.evaluate(async () => {
      const moduleUrl = (path: string) => {
        const url = performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .find(url => new URL(url).pathname === path);
        if (!url) throw new Error(`Модуль ${path} ещё не загружен`);
        return url;
      };
      const { getChatSDK } = await import(
        moduleUrl('/src/services/useChat.ts')
      );
      const sdk = getChatSDK();
      if (!sdk) throw new Error('SDK ещё не инициализирован');
      sdk.getChatFolders = async () =>
        ['chats', 'clients'].flatMap(scope => [
          {
            id: `${scope}-work`,
            name: 'Работа',
            icon: 'briefcase',
            scope,
            topicIds: [scope === 'clients' ? 'client-1' : 'ordinary-1'],
            createdAt: '',
            updatedAt: ''
          },
          {
            id: `${scope}-empty`,
            name: 'Пустая',
            icon: 'folder',
            scope,
            topicIds: [],
            createdAt: '',
            updatedAt: ''
          }
        ]);
      const { setTopics } = await import(
        moduleUrl('/src/composables/useTopics.ts')
      );
      setTopics([
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `ordinary-${index}`,
          type: 'GROUP',
          name: `Обычный ${index}`,
          group: { id: `ordinary-${index}`, name: `Обычный ${index}` },
          info: {}
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `client-${index}`,
          type: 'GROUP',
          name: `Клиент ${index}`,
          group: { id: `client-${index}`, name: `Клиент ${index}` },
          info: {}
        }))
      ]);
      const { useChatFolders } = await import(
        moduleUrl('/src/composables/useChatFolders.ts')
      );
      await useChatFolders().loadFolders(true);
    });
    await refreshInquiries(page);
    await nav
      .locator(
        `[data-testid$="MenuBottomNav-${scope === 'clients' ? 'Clients' : 'Chats'}"]`
      )
      .click();
    const section = page.locator(`.mobile-list-container__section--${scope}`);
    const panel = section.getByTestId('ChatFolders-Panel');
    const visibleTopic = (index: number) =>
      section.getByRole('heading', {
        name: scope === 'clients' ? `Клиент ${index}` : `Обычный ${index}`,
        exact: true
      });
    await expect(visibleTopic(0)).toBeVisible();
    const toolbar = section.locator('.chats-toolbar');
    const heading = (await toolbar
      .locator('.chats-toolbar__headline')
      .boundingBox())!;
    const folders = (await toolbar.locator('.chat-folder-rail').boundingBox())!;
    const toolbarSearch = (await toolbar
      .locator('.chats-toolbar__search')
      .boundingBox())!;
    const folderOffset = folders.y - heading.y - heading.height;
    const searchOffset = toolbarSearch.y - heading.y - heading.height;
    for (const folder of ['work', 'empty']) {
      await section.getByTestId('ChatFolders-Rail-Manage').click();
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('ChatFolders-Rail-All')).toBeVisible();
      await expect(
        panel.getByTestId('ChatFolders-Rail-Manage')
      ).toHaveAttribute('aria-pressed', 'true');
      const rail = await panel
        .locator('.chat-folders-panel__rail')
        .boundingBox();
      const search = await panel
        .getByTestId('ChatFolders-Search')
        .boundingBox();
      const list = await panel
        .locator('.chat-folders-panel__list')
        .boundingBox();
      const panelHeading = (await panel
        .locator('.chat-folders-panel__header')
        .boundingBox())!;
      const panelFolders = (await panel
        .locator('.chat-folder-rail')
        .boundingBox())!;
      expect(rail).not.toBeNull();
      expect(search).not.toBeNull();
      expect(list).not.toBeNull();
      expect(panelFolders.y - panelHeading.y - panelHeading.height).toBeCloseTo(
        folderOffset,
        0
      );
      expect(search!.y - panelHeading.y - panelHeading.height).toBeCloseTo(
        searchOffset,
        0
      );
      expect(search!.y - rail!.y - rail!.height).toBeCloseTo(10, 0);
      expect(list!.y).toBeGreaterThanOrEqual(search!.y + search!.height);
      await page.screenshot({
        path: testInfo.outputPath(`${scope}-folder-navigation-${folder}.png`),
        animations: 'disabled'
      });
      await panel
        .getByTestId(`ChatFolders-Rail-Folder-${scope}-${folder}`)
        .click();
      await expect(panel).toHaveCount(0);
      await expect(
        section.getByTestId(`ChatFolders-Rail-Folder-${scope}-${folder}`)
      ).toHaveAttribute('aria-pressed', 'true');
      if (folder === 'work') {
        await expect(visibleTopic(1)).toBeVisible();
        await expect(visibleTopic(0)).toHaveCount(0);
        // Повторный выбор уже активной папки из управления сохраняет её.
        await section.getByTestId('ChatFolders-Rail-Manage').click();
        await panel
          .getByTestId(`ChatFolders-Rail-Folder-${scope}-work`)
          .click();
        await expect(visibleTopic(1)).toBeVisible();
        await expect(visibleTopic(0)).toHaveCount(0);
      } else await expect(visibleTopic(1)).toHaveCount(0);
      await section.getByTestId('ChatFolders-Rail-Manage').click();
      await panel.getByTestId('ChatFolders-Rail-All').click();
      await expect(panel).toHaveCount(0);
      await expect(visibleTopic(0)).toBeVisible();
    }
    if (scope === 'clients') {
      const filters = [
        'site',
        'avito',
        'vk',
        'telegram',
        'max',
        'support',
        'new'
      ];
      for (const [index, filter] of filters.entries()) {
        await section.getByTestId('ChatFolders-Rail-Manage').click();
        await panel.getByTestId(`Clients-SystemFolder-${filter}`).click();
        await expect(panel).toHaveCount(0);
        await expect(
          section.getByTestId(`Clients-SystemFolder-${filter}`)
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(visibleTopic(index === 6 ? 0 : index)).toBeVisible();
        await expect(
          visibleTopic(index === 0 || index === 6 ? 1 : 0)
        ).toHaveCount(0);
        await section.getByTestId('ChatFolders-Rail-Manage').click();
        await panel.getByTestId(`Clients-SystemFolder-${filter}`).click();
        await expect(panel).toHaveCount(0);
        await expect(
          section.getByTestId(`Clients-SystemFolder-${filter}`)
        ).toHaveAttribute('aria-pressed', 'true');
      }
      await section.getByTestId('ChatFolders-Rail-Manage').click();
      await panel.getByTestId('ChatFolders-Rail-All').click();
      await expect(visibleTopic(0)).toBeVisible();
      await expect(visibleTopic(1)).toBeVisible();
    }
  });
}

for (const section of ['Calls', 'Profile']) {
  test(`Обновление обращений сохраняет выбранный раздел ${section}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(isMobile ? '/' : '/dialogs/ordinary-topic');
    const nav = page.locator('.menu-bottom-nav:visible');
    await expect(nav).toBeVisible({ timeout: 30_000 });
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Clients"]')
    ).toBeVisible();
    await refreshInquiries(page);
    if (isMobile) {
      await page.evaluate(() => {
        window.history.pushState({}, '', '/dialogs');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
    }
    await expect(page).toHaveURL(
      isMobile ? /\/dialogs$/ : /\/dialogs\/ordinary-topic$/
    );
    const button = nav.locator(`[data-testid$="MenuBottomNav-${section}"]`);
    await button.click();
    await expect(button).toHaveClass(/menu-bottom-nav__button--active/);

    await refreshInquiries(page);
    await expect(button).toHaveClass(/menu-bottom-nav__button--active/);

    await page.route('**/manager/inquiries?*', route =>
      route.fulfill({
        json: [
          {
            id: 'inquiry-1',
            topic_id: 'ordinary-topic',
            name: 'Клиент',
            contacts: {},
            source: { channel: 'widget' },
            manager_ids: [],
            metadata_version: 1
          }
        ]
      })
    );
    await refreshInquiries(page);
    await expect(button).toHaveClass(/menu-bottom-nav__button--active/);
  });
}

test('Переход к переписке и уточнение её типа выбирают нужный раздел', async ({
  page,
  isMobile
}) => {
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(
    nav.locator('[data-testid$="MenuBottomNav-Clients"]')
  ).toBeVisible();
  await refreshInquiries(page);
  await nav.locator('[data-testid$="MenuBottomNav-Calls"]').click();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/dialogs/ordinary-topic');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const menu = page.locator(isMobile ? '.mobile-list-container' : '.menu');
  await expect(
    menu.locator('[data-testid$="MenuBottomNav-Chats"]')
  ).toHaveClass(/menu-bottom-nav__button--active/);
  await page.route('**/manager/inquiries?*', route =>
    route.fulfill({
      json: [
        {
          id: 'inquiry-1',
          topic_id: 'ordinary-topic',
          name: 'Клиент',
          contacts: {},
          source: { channel: 'widget' },
          manager_ids: [],
          metadata_version: 1
        }
      ]
    })
  );
  await refreshInquiries(page);
  await expect(
    menu.locator('[data-testid$="MenuBottomNav-Clients"]')
  ).toHaveClass(/menu-bottom-nav__button--active/);

  // Возврат из переписки не сбрасывает выбранный список клиентов.
  for (const path of ['/dialogs', '/group']) {
    await page.evaluate(path => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await refreshInquiries(page);
    await expect(
      menu.locator('[data-testid$="MenuBottomNav-Clients"]')
    ).toHaveClass(/menu-bottom-nav__button--active/);
  }
});

test('Нижнее меню во всех мобильных разделах сохраняет геометрию «Звонков»', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile);
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(
    nav.locator('[data-testid$="MenuBottomNav-Clients"]')
  ).toBeVisible();
  await refreshInquiries(page);
  await nav.locator('[data-testid$="MenuBottomNav-Calls"]').click();
  const reference = await nav.boundingBox();
  const referenceStyles = await nav.evaluate(element => {
    const style = getComputedStyle(element);
    return {
      bottom: style.bottom,
      padding: style.padding,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter
    };
  });
  for (const section of ['Chats', 'Clients', 'AI', 'Profile']) {
    const button = nav.locator(`[data-testid$="MenuBottomNav-${section}"]`);
    await button.click();
    await expect(button).toHaveClass(/menu-bottom-nav__button--active/);
    expect(await nav.boundingBox()).toEqual(reference);
    expect(
      await nav.evaluate(element => {
        const style = getComputedStyle(element);
        return {
          bottom: style.bottom,
          padding: style.padding,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          backdropFilter: style.backdropFilter
        };
      })
    ).toEqual(referenceStyles);
  }
});

test('Смена мобильного и десктопного вида сохраняет раздел «Звонки»', async ({
  page,
  isMobile
}) => {
  await page.goto('/');
  const nav = page.locator('.menu-bottom-nav:visible');
  await expect(nav).toBeVisible({ timeout: 30_000 });
  await expect(
    nav.locator('[data-testid$="MenuBottomNav-Clients"]')
  ).toBeVisible();
  await refreshInquiries(page);
  if (isMobile) {
    await page.evaluate(() => {
      window.history.pushState({}, '', '/dialogs');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }
  await nav.locator('[data-testid$="MenuBottomNav-Calls"]').click();
  const viewport = page.viewportSize()!;
  await page.setViewportSize({
    width: isMobile ? 1024 : 390,
    height: viewport.height
  });
  await expect(nav.locator('[data-testid$="MenuBottomNav-Calls"]')).toHaveClass(
    /menu-bottom-nav__button--active/
  );
  await page.setViewportSize(viewport);
  await expect(nav.locator('[data-testid$="MenuBottomNav-Calls"]')).toHaveClass(
    /menu-bottom-nav__button--active/
  );
});

for (const scope of ['Chats', 'Clients']) {
  test(`Нижнее меню выходит из настроек папок ${scope} без анимации и сохраняет переходы основных разделов`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Мобильное нижнее меню');
    await page.route('**/chat-folders', route => route.fulfill({ json: [] }));
    await page.goto('/');
    const nav = page.locator('.menu-bottom-nav:visible');
    await expect(nav).toBeVisible({ timeout: 30_000 });
    await expect(
      nav.locator('[data-testid$="MenuBottomNav-Clients"]')
    ).toBeVisible();
    const track = page.locator('.mobile-list-container__section-track');
    await track.evaluate(element => {
      (window as any).sectionTransitions = [];
      element.addEventListener('transitionrun', event => {
        const transition = event as TransitionEvent;
        if (
          transition.target === element &&
          transition.propertyName === 'transform'
        ) {
          (window as any).sectionTransitions.push(transition.propertyName);
        }
      });
    });
    const resetTransitions = () =>
      page.evaluate(() => {
        (window as any).sectionTransitions = [];
      });
    const finishTransition = () =>
      track.evaluate(element =>
        Promise.all(
          element.getAnimations().map(animation => animation.finished)
        )
      );
    const button = (section: string) =>
      nav.locator(`[data-testid$="MenuBottomNav-${section}"]`);

    for (const target of ['Chats', 'Calls', 'Clients', 'AI', 'Profile']) {
      await button(scope).click();
      await finishTransition();
      await page
        .locator('.mobile-list-container__section[aria-hidden="false"]')
        .getByTestId('ChatFolders-Rail-Manage')
        .click();
      await expect(page.getByTestId('ChatFolders-Panel')).toBeVisible();
      await resetTransitions();
      await button(target).click();
      await expect(page.getByTestId('ChatFolders-Panel')).toHaveCount(0);
      await expect(button(target)).toHaveClass(
        /menu-bottom-nav__button--active/
      );
      await page.evaluate(
        () =>
          new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      expect(
        await track.evaluate(element => element.getAnimations().length)
      ).toBe(0);
      expect(
        await page.evaluate(() => (window as any).sectionTransitions)
      ).toEqual([]);

      await resetTransitions();
      await button(target === 'Calls' ? 'Profile' : 'Calls').click();
      await expect
        .poll(() => page.evaluate(() => (window as any).sectionTransitions))
        .toContain('transform');
      await finishTransition();
    }
  });
}
