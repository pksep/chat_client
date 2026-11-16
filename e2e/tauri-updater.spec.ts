import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function openProfile(page: Page, mode = 'available') {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  await page.addInitScript(mode => {
    const win = window as any;
    win.isTauri = true;
    win.updateCalls = [];
    win.updateMode = mode;
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      },
      transformCallback: () => 1,
      invoke: async (command: string) => {
        win.updateCalls.push(command);
        if (command === 'plugin:app|version') return '1.6.8';
        if (command === 'plugin:updater|check') {
          if (win.updateMode === 'error') throw new Error('offline');
          if (win.updateMode === 'latest') return null;
          return {
            rid: 1,
            currentVersion: '1.6.8',
            version: '1.6.9',
            body: 'Исправления'
          };
        }
        if (command === 'plugin:updater|download') {
          await new Promise(resolve => setTimeout(resolve, 100));
          if (win.updateMode === 'bad-signature')
            throw new Error('invalid signature');
          return 2;
        }
        return null;
      }
    };
  }, mode);
  await page.goto('/e2e/fixtures/profile-qr-login.html', {
    waitUntil: 'domcontentloaded'
  });
  await expect(page.getByTestId('DesktopAppVersion')).toHaveCount(0);
  await page.getByTestId('Fixture-MenuProfilePanel-UpdateTrigger').click();
  await expect(
    page
      .getByTestId('Fixture-MenuProfilePanel-UpdateMenu')
      .getByTestId('DesktopAppVersion')
  ).toHaveText('Версия 1.6.8');
}

test('Профиль Tauri: версия, скачивание и отдельная установка', async ({
  page
}, testInfo) => {
  await openProfile(page);
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await expect(action).toHaveText('Скачать обновление');
  await expect(
    page.getByText('Доступна версия 1.6.9', { exact: true })
  ).toBeVisible();
  const screenshot = testInfo.outputPath('desktop-updater.png');
  await page.locator('.menu-profile').screenshot({ path: screenshot });
  await testInfo.attach('desktop-updater', {
    path: screenshot,
    contentType: 'image/png'
  });
  await action.click();
  await expect(action).toHaveText('Установить и перезапустить');
  const buttonBox = (await action.boundingBox())!;
  const cardBox = (await page
    .locator('.menu-profile__update-content')
    .boundingBox())!;
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    cardBox.x + cardBox.width
  );
  await expect(
    page.getByText('Обновление скачано', { exact: true })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).updateCalls.includes('plugin:updater|install')
    )
  ).toBe(false);
  await action.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).updateCalls.includes('plugin:process|restart')
      )
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () =>
        (window as any).updateCalls.filter(
          (value: string) => value === 'plugin:updater|download'
        ).length
    )
  ).toBe(1);
});

test('Профиль Tauri: ошибка проверки и повтор', async ({ page }) => {
  await openProfile(page, 'error');
  await expect(
    page.getByText('Не удалось обновить приложение', { exact: true })
  ).toBeVisible();
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await expect(action).toHaveText('Проверить обновления');
  await page.evaluate(() => {
    (window as any).updateMode = 'latest';
  });
  await action.click();
  await expect(
    page.getByText('Установлена новейшая версия', { exact: true })
  ).toBeVisible();
  await expect(page.getByTestId('DesktopAppVersion')).toHaveText(
    'Версия 1.6.8'
  );
});

test('Профиль Tauri: повреждённый пакет не становится готовым к установке', async ({
  page
}) => {
  await openProfile(page, 'bad-signature');
  await page.getByTestId('Fixture-MenuProfilePanel-UpdateAction').click();
  await expect(
    page.getByText(
      'Не удалось скачать или проверить подпись обновления. Попробуйте ещё раз.',
      { exact: true }
    )
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).updateCalls.includes('plugin:updater|install')
    )
  ).toBe(false);
});

test('Профиль Tauri: звонок и передача откладывают установку скачанного пакета', async ({
  page
}) => {
  await openProfile(page);
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await action.click();
  await expect(action).toHaveText('Установить и перезапустить');
  await page.evaluate(async () => {
    const path = '/src/services/useCallState.ts';
    const state = await import(/* @vite-ignore */ path);
    state.open.value = true;
  });
  await action.click();
  await expect(
    page.getByText(
      'Обновление готово. Завершите звонок, затем установите его.',
      { exact: true }
    )
  ).toBeVisible();
  await page.evaluate(async () => {
    const callPath = '/src/services/useCallState.ts';
    const activityPath = '/src/services/web-update-activity.ts';
    (await import(/* @vite-ignore */ callPath)).open.value = false;
    (window as any).finishUpdateOperation = (
      await import(/* @vite-ignore */ activityPath)
    ).deferWebUpdateReload();
  });
  await action.click();
  await expect(
    page.getByText('Дождитесь завершения отправки или скачивания файлов.', {
      exact: true
    })
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).updateCalls.includes('plugin:updater|install')
    )
  ).toBe(false);
  await page.evaluate(() => (window as any).finishUpdateOperation());
  await action.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).updateCalls.includes('plugin:updater|install')
      )
    )
    .toBe(true);
});
