import { expect, test, type Locator } from '@playwright/test';

const dividerVisible = (row: Locator) =>
  row.evaluate(element => {
    const next = element.nextElementSibling;
    const style = next?.classList.contains('menu-list-divider')
      ? getComputedStyle(next)
      : getComputedStyle(element, '::after');
    return (
      style.display !== 'none' &&
      style.visibility === 'visible' &&
      style.opacity !== '0' &&
      parseFloat(style.height) > 0 &&
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      (next?.classList.contains('menu-list-divider') ||
        !['none', 'normal'].includes(style.content))
    );
  });

const transitionDuration = (element: Locator, property: string) =>
  element.evaluate((element, property) => {
    const style = getComputedStyle(element);
    const properties = style.transitionProperty
      .split(',')
      .map(value => value.trim());
    const durations = style.transitionDuration.split(',').map(parseFloat);
    const index = properties.findLastIndex(
      value =>
        value === 'all' ||
        value === property ||
        (value === 'border-color' && /^border-.*-color$/.test(property))
    );
    return index === -1 ? 0 : durations[index % durations.length];
  }, property);

const expectInstantColors = async (element: Locator) => {
  for (const property of ['background-color', 'color', 'border-top-color']) {
    expect(await transitionDuration(element, property)).toBe(0);
  }
};

for (const section of [
  'chats',
  'calls',
  'ai',
  'tasks',
  'clients',
  'folders',
  'folder-topics'
]) {
  for (const theme of ['light', 'dark']) {
    test(`${section}: линии и подсветка совпадают с Чатами, ${theme}`, async ({
      page,
      isMobile
    }) => {
      await page.goto(
        `/e2e/fixtures/menu-list-items.html?section=${section}&theme=${theme}`
      );
      const menu = page.getByTestId('Fixture-Menu');
      const rows = menu.locator('.menu-list-row');
      await expect(rows).toHaveCount(3);
      const selected = rows.nth(1);
      const color =
        theme === 'light' ? 'rgb(236, 243, 255)' : 'rgb(96, 104, 132)';
      for (const index of [0, 1])
        await expect.poll(() => dividerVisible(rows.nth(index))).toBe(true);
      await expect.poll(() => dividerVisible(rows.last())).toBe(false);
      await expectInstantColors(selected);
      if (['ai', 'tasks'].includes(section)) {
        expect(await transitionDuration(selected, 'transform')).toBe(0.2);
        await expect(
          menu.locator('.ai-menu-panel__tabs button').first()
        ).toHaveCSS('transition-duration', '0.2s');
      }
      const item = selected.locator('.menu-list-item');
      if (await item.count()) await expectInstantColors(item);
      const search = menu.locator('.menu-section-search');
      const input = search.locator('.search-yui-kit__input');
      await expect(search).toHaveCSS('height', isMobile ? '40px' : '42px');
      await expect(input).toHaveCSS('height', isMobile ? '40px' : '42px');
      await expect(input).toHaveCSS('transition-duration', '0.3s');
      await expect(input).toHaveCSS('font-size', '14px');
      await expect(input).toHaveCSS('line-height', '16px');
      await expect(search.locator('.search-icon')).toHaveCSS(
        'top',
        isMobile ? '8px' : '11px'
      );
      if (section !== 'folder-topics') {
        const menuBox = (await menu.boundingBox())!;
        const inputBox = (await input.boundingBox())!;
        const borderRight = await menu.evaluate(element =>
          parseFloat(getComputedStyle(element).borderRightWidth)
        );
        expect(inputBox.x - menuBox.x).toBeCloseTo(isMobile ? 16 : 20, 1);
        expect(
          menuBox.x + menuBox.width - inputBox.x - inputBox.width
        ).toBeCloseTo(isMobile ? 16 : 10 + borderRight, 1);
      }

      if (!isMobile) {
        await selected.hover();
        await expect(selected).toHaveCSS('background-color', color);
        for (const index of [0, 1])
          await expect.poll(() => dividerVisible(rows.nth(index))).toBe(false);
        await page.mouse.move(2, 2);
      }

      const box = (await selected.boundingBox())!;
      const touch = isMobile ? await page.context().newCDPSession(page) : null;
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }]
        });
      } else {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
      }
      await expect(selected).toHaveCSS('background-color', color);
      for (const index of [0, 1])
        await expect.poll(() => dividerVisible(rows.nth(index))).toBe(false);
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: box.x + box.width / 2, y: box.y + box.height / 2 + 20 }
          ]
        });
        await expect(selected).toHaveCSS(
          'background-color',
          'rgba(0, 0, 0, 0)'
        );
        for (const index of [0, 1])
          await expect.poll(() => dividerVisible(rows.nth(index))).toBe(true);
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchCancel',
          touchPoints: []
        });
        await touch.detach();
      } else {
        await page.mouse.move(2, 2);
        await page.mouse.up();
      }
      await expect(selected).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      for (const index of [0, 1])
        await expect.poll(() => dividerVisible(rows.nth(index))).toBe(true);

      await page.getByTestId('Fixture-Select').click();
      await expect(selected).toHaveClass(/menu-list-row--active/);
      await expect(selected).toHaveCSS('background-color', color);
      for (const index of [0, 1])
        await expect.poll(() => dividerVisible(rows.nth(index))).toBe(false);
      if (isMobile) {
        const menuBox = (await menu.boundingBox())!;
        const rowBox = (await selected.boundingBox())!;
        expect(rowBox.x).toBeCloseTo(menuBox.x, 1);
        expect(rowBox.width).toBeCloseTo(menuBox.width, 1);
        await expect(selected).toHaveCSS('border-radius', '0px');
      }
      await page.getByTestId('Fixture-Clear').click();
      for (const index of [0, 1])
        await expect.poll(() => dividerVisible(rows.nth(index))).toBe(true);
      if (['calls', 'ai', 'tasks', 'folders'].includes(section)) {
        await input.fill('Строка 2');
        await expect(rows).toHaveCount(1);
        await expect.poll(() => dividerVisible(rows.last())).toBe(false);
        await search.locator('.clear-button').click();
        await expect(input).toHaveValue('');
        await expect(rows).toHaveCount(3);
      }
    });
  }
}
