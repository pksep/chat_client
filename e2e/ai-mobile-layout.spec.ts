import { expect, test } from './fixtures/ai-history';

const SESSION_ID = 'ai-mobile-layout';
const HEADER = 'ChatContainer-ChatContainer-Header-Header';
const LONG_TEXT = 'Документ_' + 'очень_длинное_название_'.repeat(10) + '.xlsx';

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-mobile');
  await page.addInitScript(sessionId => {
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
        user: { id: 'local-ui-test-user', name: 'Тест' }
      })
    );
    localStorage.setItem(
      'sep:chat:ai-assistant:v1',
      JSON.stringify({
        sessions: [
          {
            id: sessionId,
            title:
              'Очень длинное название чата о результатах работы производства',
            description: 'Мобильная проверка',
            time: '10:00',
            messages: []
          }
        ],
        tasks: [],
        permissionMode: 'ask',
        responseMode: 'quick'
      })
    );
  }, SESSION_ID);
});

for (const theme of ['theme-light', 'theme-dark']) {
  for (const width of [320, 390, 480, 481, 600, 768]) {
    test(`${theme}: сообщения и редактор на ширине ${width}`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route('**/api/agents/generalAgent/stream*', route =>
        route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: [
            {
              type: 'text-delta',
              payload: {
                text:
                  'Сводка по работам\nСтрельников Ю.А.: 12 операций за 3 часа.\n' +
                  LONG_TEXT +
                  '\nТекст <script>не является разметкой</script>'
              }
            },
            { type: 'finish' }
          ]
            .map(event => `data: ${JSON.stringify(event)}\n\n`)
            .join('')
        })
      );
      await page.goto(`/ai/${SESSION_ID}`);
      const editor = page.locator('.ai-assistant__editor');
      await expect(editor).toBeVisible({ timeout: 60_000 });
      await page.locator('.chat-container').evaluate((element, className) => {
        element.classList.remove('theme-light', 'theme-dark');
        element.classList.add(className);
      }, theme);
      await editor
        .locator('[contenteditable="true"]')
        .fill('Покажи результаты работ');
      await expect(
        editor.locator('.toolbar-button.right:visible')
      ).toBeEnabled();
      if (width <= 480) {
        await expect(
          editor.locator('.right-buttons > .smile-button')
        ).toBeHidden();
        await expect(editor.locator('.toolbar')).toBeHidden();
        const controls = editor.locator(
          '.right-buttons .ai-assistant__permission-trigger, .right-buttons .ai-assistant__response-trigger'
        );
        await expect(controls).toHaveCount(2);
        const clip = editor.locator('.attach-file-button:visible');
        for (const control of await controls.all()) {
          await expect(control).toHaveCSS('width', '30px');
          await expect(control).toHaveCSS('height', '30px');
          await expect(control).toHaveCSS('padding', '0px');
          await expect(control.locator('svg')).toHaveCSS('width', '30px');
          await expect(control.locator('svg')).toHaveCSS('height', '30px');
          await expect(control).toHaveCSS(
            'color',
            theme === 'theme-light'
              ? 'rgb(119, 166, 255)'
              : 'rgb(156, 190, 255)'
          );
          const clipBox = await clip.boundingBox();
          const controlBox = await control.boundingBox();
          expect(controlBox!.y).toBeCloseTo(clipBox!.y, 1);
        }
      }
      const inputBox = await editor.locator('.editor-content').boundingBox();
      const sendBox = await editor
        .locator('.toolbar-button.right:visible')
        .boundingBox();
      expect(inputBox!.width).toBeGreaterThan(80);
      expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(width);
      await editor.locator('.toolbar-button.right:visible').click();
      await expect(page.locator('[data-message-id]')).toHaveCount(2);
      await expect(page.locator('.ai-assistant__thinking')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('conversation.png') });
      await expect(page.getByTestId(`${HEADER}-CallIcon`)).toBeVisible();
      await expect(editor.locator('.ai-assistant__voice-trigger')).toHaveCount(
        0
      );
      await expect(
        page.locator('.ai-assistant__message-content .message__article')
      ).toHaveCount(2);
      for (const selector of [
        '.ai-assistant',
        '.ai-assistant__editor',
        '.editor-component',
        '.ai-assistant__message-content .message-content'
      ]) {
        const bounds = await page.locator(selector).evaluateAll(elements =>
          elements.map(element => ({
            left: element.getBoundingClientRect().left,
            right: element.getBoundingClientRect().right,
            client: element.clientWidth,
            scroll: element.scrollWidth
          }))
        );
        for (const bound of bounds) {
          expect(bound.left, selector).toBeGreaterThanOrEqual(0);
          expect(bound.right, selector).toBeLessThanOrEqual(width);
          expect(bound.scroll, selector).toBeLessThanOrEqual(bound.client + 1);
        }
      }
      await expect(
        page.locator('.ai-assistant__message--assistant')
      ).toContainText('<script>не является разметкой</script>');
      await expect(
        page.locator('.ai-assistant__message-content script')
      ).toHaveCount(0);
      const response = editor.locator(
        '.ai-assistant__response-trigger:visible'
      );
      const permission = editor.locator(
        '.ai-assistant__permission-trigger:visible'
      );
      await permission.click();
      const permissionMenu = editor
        .getByRole('menu', { name: 'Режим подтверждения действий' })
        .filter({ visible: true });
      await expect(permissionMenu).toBeVisible();
      const permissionBox = await permissionMenu.boundingBox();
      expect(permissionBox!.x).toBeGreaterThanOrEqual(0);
      expect(permissionBox!.x + permissionBox!.width).toBeLessThanOrEqual(
        width
      );
      await permissionMenu
        .getByRole('menuitemradio', { name: 'Автоматически подтверждать' })
        .click();
      await expect(permission).toHaveAttribute(
        'aria-label',
        'Автоматически подтверждать'
      );
      await expect(
        permission.locator('.permission-check-circle-icon')
      ).toBeVisible();
      await permission.click();
      await permissionMenu
        .getByRole('menuitemradio', { name: 'Запрашивать разрешения' })
        .click();
      await expect(permission.locator('.permission-hand-icon')).toBeVisible();
      await response.click();
      await expect(permissionMenu).toBeHidden();
      const responseMenu = editor
        .getByRole('menu', { name: 'Режим ответа', exact: true })
        .filter({ visible: true });
      const responseMenuBox = await responseMenu.boundingBox();
      expect(responseMenuBox!.x).toBeGreaterThanOrEqual(0);
      expect(responseMenuBox!.x + responseMenuBox!.width).toBeLessThanOrEqual(
        width
      );
      if (width <= 480)
        await page.screenshot({ path: testInfo.outputPath('mode-menu.png') });
      await page
        .getByRole('menuitemradio', { name: 'Продвинутый ответ' })
        .filter({ visible: true })
        .click();
      await expect(response).toHaveAttribute('aria-label', 'Продвинутый ответ');
      const responseBox = await response.boundingBox();
      expect(responseBox!.x + responseBox!.width).toBeLessThanOrEqual(width);
      await page.getByTestId(`${HEADER}-PopoverIcon`).click();
      // Общая шапка переключается на компьютерные кнопки начиная с 768 px.
      if (width < 768) {
        await expect(
          page.getByRole('button', { name: 'Поиск в чате', exact: true })
        ).toBeVisible();
      }
      await expect(
        page.getByRole('button', { name: 'Очистить чат', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Удалить чат', exact: true })
      ).toBeVisible();
      if (width < 768) {
        await page
          .getByRole('button', { name: 'Поиск в чате', exact: true })
          .click();
      } else {
        await page.getByTestId(`${HEADER}-AIAssistantIcon`).click();
        await expect(
          page.locator('.chat__header-context-menu:visible')
        ).toHaveCount(0);
        await page.getByTestId(`${HEADER}-SearchIcon`).click();
      }
      const searchPrefix = width < 768 ? 'MobileSearch' : 'Search';
      await expect(
        page.getByTestId(`${HEADER}-${searchPrefix}Input`)
      ).toBeVisible();
      if (width >= 768) {
        await expect
          .poll(() =>
            page.locator('.chat--ai-route').evaluate(element => {
              const search = document.querySelector(
                '.chat__header-desktop-search-row'
              )!;
              return (
                element.getBoundingClientRect().top -
                search.getBoundingClientRect().bottom
              );
            })
          )
          .toBeGreaterThanOrEqual(0);
      }
      await page.getByTestId(`${HEADER}-${searchPrefix}Close`).click();

      if (width === 390) {
        await page
          .locator('.ai-assistant__message--assistant')
          .click({ button: 'right' });
        await page
          .getByRole('button', { name: 'Ответить', exact: true })
          .click();
        await expect(editor.locator('.chat__input__action')).toBeVisible();
        await editor.locator('[contenteditable="true"]').fill('🙂');
        const request = page.waitForRequest(
          '**/api/agents/generalAgent/stream*'
        );
        await editor.locator('.toolbar-button.right:visible').click();
        expect((await request).postDataJSON()).toMatchObject({
          requestContext: { responseMode: 'advanced' }
        });
        await expect(page.locator('[data-message-id]')).toHaveCount(4);
        const reply = page.locator('.ai-assistant__message--user').last();
        await expect(
          reply.locator('.ai-assistant__message-reply')
        ).toContainText('Сводка по работам');
        await expect(reply.locator('.message-content__html')).toHaveText('🙂');

        await page.setViewportSize({ width, height: 480 });
        await editor
          .locator('[contenteditable="true"]')
          .fill('Многострочный черновик\n'.repeat(15));
        const historyBox = await page
          .locator('.ai-assistant__scroll')
          .boundingBox();
        expect(historyBox!.height).toBeGreaterThan(160);
        const composerBox = await editor.boundingBox();
        expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(480);
        await page.screenshot({
          path: testInfo.outputPath('short-viewport-draft.png')
        });
        await editor.locator('[contenteditable="true"]').fill('');
        await page.setViewportSize({ width, height: 844 });
      }

      if (width >= 768) await page.setViewportSize({ width: 767, height: 844 });
      await page.getByTestId(`${HEADER}-BackButton`).click();
      const list = page.locator('.ai-menu-panel__list:visible');
      await expect(list).toBeVisible();
      await expect(list).toHaveCSS('padding-left', '0px');
      await page.locator('.chat-container').evaluate(async element => {
        await Promise.allSettled(
          element
            .getAnimations({ subtree: true })
            .filter(
              animation =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            )
            .map(animation => animation.finished)
        );
      });
      const row = list.locator('.ai-menu-panel__row-main').first();
      const listBox = await list.boundingBox();
      const rowBox = await row.boundingBox();
      expect(rowBox!.x).toBeCloseTo(listBox!.x, 1);
      await page.screenshot({ path: testInfo.outputPath('chat-list.png') });
      await row.click();
      await expect(editor).toBeVisible();
    });
  }
}
