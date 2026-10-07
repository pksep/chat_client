import { expect, test, type Page } from './fixtures/ai-history';

test.beforeEach(async ({ page }) => {
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
            CHAT_AUTH_API: url,
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

test('Мобильные папки заменяют фильтры и не наследуют скрытый фильтр desktop', async ({
  page,
  isMobile
}) => {
  test.skip(!isMobile, 'Новая навигация только на мобильных экранах');
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
  await expect(chats.locator('.chats-toolbar__filters')).toHaveCount(0);
  await expect(
    chats.getByRole('heading', { name: 'Личный тест', exact: true })
  ).toBeVisible();
  await expect(
    chats.getByRole('heading', { name: 'Групповой тест', exact: true })
  ).toBeVisible();
  await expect(
    chats.locator('.chat-folder-rail__items > button').first()
  ).toHaveAttribute('data-testid', 'ChatFolders-Rail-Manage');
  const search = (await chats.locator('.chats-toolbar__search').boundingBox())!;
  const folders = (await chats.locator('.chat-folder-rail').boundingBox())!;
  expect(folders.y - search.y - search.height).toBe(10);
  await chats.getByTestId('ChatFolders-Rail-Manage').tap();
  await expect(chats.getByTestId('ChatFolders-Panel')).toBeVisible();
});

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
