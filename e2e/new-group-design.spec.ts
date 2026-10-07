import { expect, test, type Page } from '@playwright/test';

const fixture = '/e2e/fixtures/contact-selector-layout.html?mode=group';
const dialog = (page: Page) => page.locator('dialog[open]').last();
const next = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Далее', exact: true });
const create = (page: Page) =>
  dialog(page).getByRole('button', { name: 'Создать', exact: true });
const choose = async (page: Page, count = 2) => {
  for (let index = 0; index < count; index++) {
    await page.locator('.contact-selector__item').nth(index).click();
  }
  await next(page).click();
};
const backToSelection = async (page: Page, mobile: boolean) => {
  if (mobile) {
    await dialog(page)
      .getByRole('button', { name: 'Назад', exact: true })
      .click();
  } else {
    await dialog(page)
      .getByRole('button', { name: /^Участники/ })
      .click();
    await dialog(page)
      .getByRole('button', { name: 'Добавить участника', exact: true })
      .click();
  }
};

for (const theme of ['light', 'dark']) {
  test(`Создание при малой высоте окна: ${theme}`, async ({
    page,
    isMobile
  }) => {
    test.skip(isMobile, 'Десктопная модалка');
    await page.setViewportSize({ width: 1024, height: 500 });
    await page.goto(`${fixture}&theme=${theme}&long`);
    await choose(page, 40);
    await dialog(page)
      .getByRole('button', { name: /^Участники/ })
      .click();
    const windowBounds = (await dialog(page).boundingBox())!;
    const buttonBounds = (await create(page).boundingBox())!;
    expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(
      windowBounds.y + windowBounds.height - 19
    );
    const list = dialog(page).locator('.menu__info-users-list');
    const listBounds = (await list.boundingBox())!;
    expect(listBounds.y + listBounds.height).toBeLessThanOrEqual(
      buttonBounds.y
    );
    expect(
      await list.evaluate(
        element => element.scrollHeight > element.clientHeight
      )
    ).toBe(true);
    await expect(create(page)).toBeEnabled();
  });

  test(`Бот и пользователь в одной группе: ${theme}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(`${fixture}&theme=${theme}&mock-group&bots`);
    await page.locator('.contact-selector__item').first().click();
    await dialog(page)
      .getByRole('button', { name: 'Боты', exact: true })
      .click();
    await expect(page.locator('.contact-selector__item')).toHaveCount(1);
    await expect(page.locator('.contact-selector__item')).toContainText(
      'Бот проекта'
    );
    await page.locator('.contact-selector__item').click();
    await next(page).click();
    if (!isMobile) {
      await dialog(page)
        .getByRole('button', { name: /^Участники/ })
        .click();
    }
    await expect(
      dialog(page).locator('.menu__info-users-list > li')
    ).toHaveCount(3);
    await expect(dialog(page).locator('.menu__info-users-list')).toContainText(
      'Бот проекта'
    );
    await create(page).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const requests = JSON.parse(
      (await page.getByTestId('GroupRequests').textContent()) || '[]'
    );
    expect(requests[0].memberIds).toEqual([
      'selector-layout-user-0',
      'selector-layout-project_bot'
    ]);
  });

  test(`Выбор, поиск и пустые результаты: ${theme}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(`${fixture}&theme=${theme}`);
    await expect(next(page)).toBeDisabled();
    await page.locator('.contact-selector__item').first().click();
    await expect(next(page)).toBeEnabled();
    await dialog(page)
      .getByRole('textbox', { name: 'Поиск' })
      .fill('нет такого участника');
    await expect(page.locator('.contact-selector__empty')).toBeVisible();
    await expect(next(page)).toBeEnabled();
    await dialog(page).getByRole('textbox', { name: 'Поиск' }).fill('');
    await dialog(page)
      .getByRole('button', { name: 'Боты', exact: true })
      .click();
    await expect(page.locator('.contact-selector__empty')).toBeVisible();
    await dialog(page)
      .getByRole('button', {
        name: isMobile ? 'Пользователи' : 'Чаты',
        exact: true
      })
      .click();
    await page.locator('.contact-selector__badges .close-icon').click();
    await expect(next(page)).toBeDisabled();
    if (!isMobile) {
      const box = await dialog(page).boundingBox();
      expect(box!.width).toBe(370);
      expect(box!.height).toBe(532);
    }
  });

  test(`Название, вкладки, возврат и повторное открытие: ${theme}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(`${fixture}&theme=${theme}`);
    await choose(page);
    const name = dialog(page).getByRole('textbox', { name: 'Название группы' });
    await expect(name).toHaveValue('Участник 1, Участник 2');
    await name.fill('   ');
    await expect(create(page)).toBeDisabled();
    await name.fill('Команда проекта');
    if (!isMobile) {
      await expect(
        dialog(page).getByRole('button', { name: 'Информация', exact: true })
      ).toBeVisible();
      expect((await dialog(page).boundingBox())!.height).toBe(488);
      await dialog(page)
        .getByRole('button', { name: /^Участники/ })
        .click();
      await expect(
        dialog(page).locator('.menu__info-users-list > li')
      ).toHaveCount(3);
      await dialog(page)
        .getByRole('button', { name: 'Информация', exact: true })
        .click();
      await expect(name).toHaveValue('Команда проекта');
    }
    await backToSelection(page, isMobile);
    await expect(page.locator('.contact-selector__badges > div')).toHaveCount(
      2
    );
    await next(page).click();
    await expect(
      dialog(page).getByRole('textbox', { name: 'Название группы' })
    ).toHaveValue('Команда проекта');
    await backToSelection(page, isMobile);
    await page.locator('.contact-selector__item').nth(0).click();
    await page.locator('.contact-selector__item').nth(1).click();
    await expect(next(page)).toBeDisabled();
    await dialog(page)
      .getByRole('button', {
        name: isMobile ? 'Назад' : 'Закрыть',
        exact: true
      })
      .click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Создать группу', exact: true })
      .click();
    await expect(next(page)).toBeDisabled();
    await expect(page.locator('.contact-selector__badges')).toHaveCount(0);
  });

  test(`Большой список не перекрывает действия: ${theme}`, async ({
    page,
    isMobile
  }) => {
    await page.goto(`${fixture}&theme=${theme}&long`);
    await choose(page, 40);
    if (!isMobile) {
      await dialog(page)
        .getByRole('button', { name: /^Участники/ })
        .click();
    }
    const list = dialog(page).locator('.menu__info-users-list');
    await expect(list.locator('li')).toHaveCount(41);
    if (!isMobile) {
      expect(await list.evaluate(e => e.scrollHeight > e.clientHeight)).toBe(
        true
      );
      const contentBottom =
        (await list.boundingBox())!.y + (await list.boundingBox())!.height;
      expect(contentBottom).toBeLessThanOrEqual(
        (await create(page).boundingBox())!.y
      );
    }
    await expect(create(page)).toBeVisible();
    await backToSelection(page, isMobile);
    await expect(next(page)).toBeEnabled();
    const badges = page.locator('.contact-selector__badges');
    expect(await badges.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(
      true
    );
    if (!isMobile) {
      expect((await badges.boundingBox())!.height).toBeLessThanOrEqual(75);
      expect(
        (await page.locator('.contact-selector__list').boundingBox())!.height
      ).toBeGreaterThan(100);
    }
  });

  test(`Создание, длинное название и защита от повторного нажатия: ${theme}`, async ({
    page
  }) => {
    await page.goto(`${fixture}&theme=${theme}&mock-group`);
    await choose(page);
    await dialog(page)
      .getByRole('textbox', { name: 'Название группы' })
      .fill('Я'.repeat(170));
    await create(page).click();
    await expect(create(page)).toBeDisabled();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const requests = JSON.parse(
      (await page.getByTestId('GroupRequests').textContent()) || '[]'
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].title).toBe('Я'.repeat(140));
    expect(requests[0].memberIds).toHaveLength(2);
    await expect(page).toHaveURL(/\/group\/fixture-topic(?:\?|$)/);
  });

  test(`Повторная попытка после ошибки: ${theme}`, async ({ page }) => {
    await page.goto(`${fixture}&theme=${theme}&mock-group&fail-once`);
    await choose(page);
    await create(page).click();
    await expect(page.getByRole('alert')).toContainText(
      'Не удалось создать группу'
    );
    await expect(create(page)).toBeEnabled();
    await create(page).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(
      JSON.parse(
        (await page.getByTestId('GroupRequests').textContent()) || '[]'
      )
    ).toHaveLength(2);
  });

  test(`Аватар: отмена, повторный выбор файла и сохранение: ${theme}`, async ({
    page
  }) => {
    await page.goto(`${fixture}&theme=${theme}&mock-group`);
    await choose(page);
    const file = {
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
        'base64'
      )
    };
    const input = dialog(page).locator('input[type=file]');
    await input.setInputFiles(file);
    const crop = page.locator('dialog.modal-cropped-avatar[open]');
    await expect(crop).toBeVisible();
    await crop.getByRole('button', { name: 'Отменить', exact: true }).click();
    await expect(crop).toHaveCount(0);
    await input.setInputFiles(file);
    await expect(crop).toBeVisible();
    await crop.getByRole('button', { name: /Сохранить/ }).click();
    await expect(crop).toHaveCount(0);
    await expect(
      dialog(page).locator(
        '.new-group-info__avatar-button .avatar-yui-kit__image, .modal-info-mobile__avatar .avatar-yui-kit__image'
      )
    ).toHaveAttribute('src', /^data:image/);
    await create(page).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    const requests = JSON.parse(
      (await page.getByTestId('GroupRequests').textContent()) || '[]'
    );
    expect(requests[0].avatarUrl).toMatch(/^data:image/);
  });
}
