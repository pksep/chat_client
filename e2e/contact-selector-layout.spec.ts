import { expect, test, type Locator } from '@playwright/test';

const fixture = '/e2e/fixtures/contact-selector-layout.html';
const selectorBox = (selector: Locator) =>
  selector.evaluate(element => {
    const selector = element.getBoundingClientRect();
    const search = element
      .querySelector('.contact-selector__search')!
      .getBoundingClientRect();
    const content = element
      .querySelector('.contact-selector__list, .contact-selector__empty')!
      .getBoundingClientRect();
    const button = element
      .querySelector('.contact-selector__add')!
      .getBoundingClientRect();
    return {
      buttonBottomGap: selector.bottom - button.bottom,
      searchTopGap: search.top - selector.top,
      contentOverlapsButton: content.bottom > button.top
    };
  });

for (const theme of ['light', 'dark']) {
  for (const long of [false, true]) {
    test(`Содержимое сверху, кнопка снизу: ${theme}, ${long ? 'длинный' : 'короткий'} список`, async ({
      page
    }, testInfo) => {
      await page.goto(`${fixture}?theme=${theme}${long ? '&long' : ''}`);
      const selector = page.locator('.contact-selector');
      const list = selector.locator('.contact-selector__list');
      const button = selector.locator('.contact-selector__add');
      const input = selector.locator('.contact-selector__search input');
      await expect(list.locator('li')).toHaveCount(long ? 40 : 2);
      await expect(selector).toHaveCSS('align-content', 'flex-start');
      await expect(list).toHaveCSS('align-content', 'flex-start');
      await expect
        .poll(() => selectorBox(selector))
        .toMatchObject({
          buttonBottomGap: 0,
          searchTopGap: 0,
          contentOverlapsButton: false
        });
      await expect(button).toBeDisabled();
      if (long) {
        expect(
          await list.evaluate(
            element => element.scrollHeight > element.clientHeight
          )
        ).toBe(true);
      }

      await list.locator('li').first().click();
      await expect(selector.locator('.contact-selector__badges')).toBeVisible();
      await expect(button).toBeEnabled();
      await expect
        .poll(() => selectorBox(selector))
        .toMatchObject({
          buttonBottomGap: 0,
          contentOverlapsButton: false
        });
      const listTop = (await list.boundingBox())!.y;
      const firstRowTop = (await list.locator('li').first().boundingBox())!.y;
      expect(firstRowTop - listTop).toBeLessThanOrEqual(1);

      await input.fill('нет такого контакта');
      await expect(selector.locator('.contact-selector__empty')).toBeVisible();
      await expect
        .poll(() => selectorBox(selector))
        .toMatchObject({
          buttonBottomGap: 0,
          contentOverlapsButton: false
        });
      await input.fill('');
      await expect(list).toBeVisible();
      await selector.screenshot({ path: testInfo.outputPath('selector.png') });
    });
  }

  test(`Создание группы и выбор контакта: ${theme}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(`${fixture}?mode=group&theme=${theme}`);
    const selector = page.locator('.contact-selector');
    await expect(selector).toHaveCSS('align-content', 'flex-start');
    await selector.locator('.contact-selector__item').first().click();
    if (isMobile) {
      await expect(selector.locator('.contact-selector__add')).toHaveCount(0);
      const next = page.getByRole('button', { name: 'Далее', exact: true });
      await expect(next).toBeEnabled();
      const selectorBounds = (await selector.boundingBox())!;
      expect((await next.boundingBox())!.y).toBeGreaterThanOrEqual(
        selectorBounds.y + selectorBounds.height
      );
    } else {
      await expect
        .poll(() => selectorBox(selector))
        .toMatchObject({
          buttonBottomGap: 0,
          contentOverlapsButton: false
        });
      await selector
        .getByRole('button', { name: 'Далее', exact: true })
        .click();
      await expect(page.locator('.new-group__create-button')).toBeVisible();
    }
    await page.goto(`${fixture}?mode=contact&theme=${theme}`);
    await expect(page.locator('.contact-selector')).toHaveCSS(
      'align-content',
      'flex-start'
    );
    await expect(page.locator('.contact-selector__add')).toHaveCount(0);
    await expect(page.locator('.contact-selector__item')).toHaveCount(2);
  });

  test(`Мобильная пересылка остаётся прокручиваемой: ${theme}`, async ({
    page,
    isMobile
  }) => {
    test.skip(!isMobile, 'Полноэкранная мобильная модалка');
    await page.goto(`${fixture}?mode=forward&theme=${theme}&long`);
    const list = page.locator('.contact-selector__list');
    await expect(list.locator('li')).toHaveCount(40);
    await expect(list).toHaveCSS('align-content', 'start');
    expect(
      await list.evaluate(
        element => element.scrollHeight > element.clientHeight
      )
    ).toBe(true);
  });

  test(`Hover скрывает границы без сдвига строк: ${theme}`, async ({
    page,
    isMobile
  }) => {
    test.skip(isMobile, 'Hover только для мыши');
    await page.goto(`${fixture}?theme=${theme}`);
    const row = page.locator('.contact-selector__item').first();
    const before = await row.boundingBox();
    await row.hover();
    await expect(row).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
    expect(await row.boundingBox()).toEqual(before);
    await page.mouse.move(800, 600);
    await expect(row).not.toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');

    const rows = page.locator('.contact-list__li');
    const content = (row: Locator, pseudo: string) =>
      row.evaluate(
        (element, pseudo) => getComputedStyle(element, pseudo).content,
        pseudo
      );
    for (const folders of [false, true]) {
      for (const active of [false, true]) {
        await page.goto(
          `${fixture}?mode=dividers&theme=${theme}${folders ? '&folders' : ''}${active ? '&active' : ''}`
        );
        await rows.nth(1).locator('.contact-list__item').hover();
        await expect.poll(() => content(rows.nth(1), '::before')).toBe('none');
        await expect.poll(() => content(rows.nth(1), '::after')).toBe('none');
        await expect.poll(() => content(rows.nth(0), '::after')).toBe('none');
        await page.mouse.move(800, 600);
        await expect
          .poll(() => content(rows.nth(1), '::before'))
          .toBe(active && !folders ? '""' : 'none');
        await expect.poll(() => content(rows.nth(1), '::after')).toBe('""');
        await rows.nth(0).locator('.contact-list__item').hover();
        await expect.poll(() => content(rows.nth(0), '::after')).toBe('none');
        await page.mouse.move(800, 600);
        await expect
          .poll(() => content(rows.nth(0), '::after'))
          .toBe(active && !folders ? 'none' : '""');
      }
    }
  });
}
