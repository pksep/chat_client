import { expect, test } from '@playwright/test';

for (const kind of ['group', 'ai']) {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 600]) {
      test(`${kind}: поиск сохраняет геометрию и прокрутку, ${theme}, ${width}px`, async ({
        page
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium-mobile');
        await page.setViewportSize({ width, height: 844 });
        await page.goto(
          `/e2e/fixtures/mobile-chat-search.html?kind=${kind}&theme=${theme}${theme === 'dark' && width === 390 ? '&call' : ''}`
        );
        const editor = page.locator('.chat__input .editor-component');
        const composer = page.locator('.chat__input');
        const header = page.locator('.chat__header-wrapper');
        const pinned = page.locator('.pinned-messages');
        const scroller = page.locator(
          kind === 'ai' ? '.ai-assistant__scroll' : '.chat__message-wrapper'
        );
        await expect(editor).toBeVisible({ timeout: 30_000 });
        await expect(scroller.locator('[data-message-id]')).toHaveCount(40);
        await page.evaluate(() => document.fonts.ready);
        await expect(
          scroller.locator('[data-message-id]').last()
        ).toBeInViewport();
        const composerBounds = await editor.boundingBox();
        const initialHeader = await header.boundingBox();
        const titleBounds = await header.locator('h3').boundingBox();
        const titleText = header.locator(
          kind === 'ai' ? '.user-profile__title-text' : 'h3'
        );
        const titleTextBounds = await titleText.boundingBox();
        const expectTitleTextUnchanged = async () => {
          const currentBounds = await titleText.boundingBox();
          for (const property of ['x', 'y', 'width', 'height'] as const) {
            expect(currentBounds![property]).toBeCloseTo(
              titleTextBounds![property],
              1
            );
          }
        };
        const backBounds = await page
          .getByTestId('Fixture-Header-BackButton')
          .boundingBox();
        await scroller.hover();
        await page.mouse.wheel(0, -600);
        await scroller.evaluate(element => {
          element.scrollTop = 500;
        });
        const visibleMessage = await scroller.evaluate(element => {
          const top = element.getBoundingClientRect().top;
          const message = [
            ...element.querySelectorAll<HTMLElement>('[data-message-id]')
          ].find(item => item.getBoundingClientRect().top >= top + 80)!;
          return {
            id: message.dataset.messageId!,
            y: message.getBoundingClientRect().top
          };
        });

        await page.getByTestId('Fixture-Header-PopoverIcon').click();
        await page
          .getByRole('button', { name: 'Поиск в чате', exact: true })
          .click();
        const search = page
          .getByTestId('Fixture-Header-MobileSearchInput')
          .locator('input');
        await expect(search).toBeFocused();
        await search.blur();
        const referenceColors = await page
          .getByTestId('Fixture-Chats-ChatsToolbar-Search')
          .locator('input')
          .evaluate(element => {
            const styles = getComputedStyle(element);
            return {
              background: styles.backgroundColor,
              color: styles.color,
              placeholder: getComputedStyle(element, '::placeholder').color,
              height: styles.height
            };
          });
        await expect(search).toHaveCSS(
          'background-color',
          referenceColors.background
        );
        await expect(search).toHaveCSS('color', referenceColors.color);
        await expect(search).toHaveCSS('height', referenceColors.height);
        expect(
          await search.evaluate(
            element => getComputedStyle(element, '::placeholder').color
          )
        ).toBe(referenceColors.placeholder);
        await expect(search).toHaveCSS('transition-duration', '0s');
        await search.focus();
        await expectTitleTextUnchanged();
        expect((await header.locator('h3').boundingBox())!.y).toBeCloseTo(
          titleBounds!.y,
          0
        );
        expect(
          (await page.getByTestId('Fixture-Header-BackButton').boundingBox())!.y
        ).toBeCloseTo(backBounds!.y, 0);
        await expect(composer).toHaveCSS('visibility', 'hidden');
        const controls = page.locator(
          '.chat__header-mobile-search-controls-content'
        );
        await expect(controls).toBeVisible();
        const controlsBounds = await controls.boundingBox();
        for (const property of ['x', 'y', 'width', 'height'] as const) {
          expect(controlsBounds![property]).toBeCloseTo(
            composerBounds![property],
            0
          );
        }
        await expect(controls).toHaveCSS(
          'background-color',
          theme === 'dark' ? 'rgb(55, 61, 81)' : 'rgb(255, 255, 255)'
        );
        await expect(controls).toHaveCSS(
          'border-top-color',
          theme === 'dark' ? 'rgb(96, 104, 132)' : 'rgb(231, 231, 231)'
        );
        const expandedHeader = await header.boundingBox();
        const pinnedBounds = await pinned.boundingBox();
        expect(expandedHeader!.height).toBeGreaterThan(initialHeader!.height);
        expect(pinnedBounds!.y).toBeCloseTo(
          expandedHeader!.y + expandedHeader!.height,
          0
        );
        await expect
          .poll(
            async () =>
              (await scroller
                .locator(`[data-message-id="${visibleMessage.id}"]`)
                .boundingBox())!.y
          )
          .toBeCloseTo(visibleMessage.y, 0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        await search.fill('Сообщение');
        await expect(
          page.getByTestId('Fixture-Header-MobileSearchCount')
        ).toHaveText('1 из 40');
        await expectTitleTextUnchanged();
        await expect(
          page.getByTestId('Fixture-Header-MobileSearchPrev')
        ).toBeEnabled();
        await page.getByTestId('Fixture-Header-MobileSearchPrev').click();
        await expect(
          page.getByTestId('Fixture-Header-MobileSearchCount')
        ).toHaveText('2 из 40');
        await expectTitleTextUnchanged();
        expect((await header.locator('h3').boundingBox())!.y).toBeCloseTo(
          titleBounds!.y,
          0
        );
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
        const searchedMessage =
          kind === 'ai'
            ? scroller.locator('.highlighted').first()
            : scroller.locator(`[data-message-id="${visibleMessage.id}"]`);
        await expect(searchedMessage).toBeInViewport();
        const searchedBounds = await searchedMessage.boundingBox();
        const searchedId =
          await searchedMessage.getAttribute('data-message-id');

        await page.setViewportSize({ width, height: 600 });
        const resizedComposer = await editor.boundingBox();
        const resizedControls = await controls.boundingBox();
        for (const property of ['x', 'y', 'width', 'height'] as const) {
          expect(resizedControls![property]).toBeCloseTo(
            resizedComposer![property],
            0
          );
        }
        await page.setViewportSize({ width, height: 844 });

        await page
          .getByTestId('Fixture-Header-MobileSearchBottomClose')
          .click();
        await expect(composer).toBeVisible();
        await expectTitleTextUnchanged();
        await expect
          .poll(async () => (await header.boundingBox())!.height)
          .toBeCloseTo(initialHeader!.height, 0);
        await expect
          .poll(
            async () =>
              (await scroller
                .locator(`[data-message-id="${searchedId}"]`)
                .boundingBox())!.y
          )
          .toBeCloseTo(searchedBounds!.y, 0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      });
    }
  }
}

for (const kind of ['group', 'ai']) {
  for (const theme of ['light', 'dark']) {
    test(`${kind}: без закреплений нет зазора под хедером, ${theme}`, async ({
      page
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium-mobile');
      await page.goto(
        `/e2e/fixtures/mobile-chat-search.html?kind=${kind}&theme=${theme}&no-pinned`
      );
      const header = page.locator('.chat__header-wrapper');
      const scroller = page.locator(
        kind === 'ai' ? '.ai-assistant__scroll' : '.chat__message-wrapper'
      );
      await expect(
        page.locator('.chat__input .editor-component')
      ).toBeVisible();
      await expect(page.locator('.pinned-messages')).toHaveCount(0);
      const expectNoGap = async () => {
        await expect
          .poll(async () => {
            const headerBounds = await header.boundingBox();
            const messageBounds = await scroller.boundingBox();
            return Math.round(
              messageBounds!.y - headerBounds!.y - headerBounds!.height
            );
          })
          .toBe(0);
      };
      await expectNoGap();
      await page.getByTestId('Fixture-Header-PopoverIcon').click();
      await page
        .getByRole('button', { name: 'Поиск в чате', exact: true })
        .click();
      await expectNoGap();
      await page.getByTestId('Fixture-Header-MobileSearchBottomClose').click();
      await expectNoGap();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }
}
