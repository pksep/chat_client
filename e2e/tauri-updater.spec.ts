import { expect, test, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function openProfile(page: Page, mode = 'available', theme = 'light') {
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
  await page.goto(`/e2e/fixtures/profile-qr-login.html?theme=${theme}`, {
    waitUntil: 'domcontentloaded'
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).updateCalls.includes('plugin:updater|check')
      )
    )
    .toBe(true);
  await expect(page.getByTestId('DesktopAppVersion')).toHaveCount(0);
  await page.getByTestId('Fixture-MenuProfilePanel-UpdateTrigger').click();
  await expect(
    page.getByTestId('Fixture-MenuProfilePanel-UpdateMenu')
  ).toBeVisible();
  if (mode === 'latest')
    await expect(page.getByTestId('DesktopAppVersion')).toHaveText(
      'Версия 1.6.8'
    );
}

test('Профиль Tauri: версия, скачивание и отдельная установка', async ({
  page
}, testInfo) => {
  await openProfile(page);
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await expect(action).toHaveText('Обновить чат');
  await expect(action).toHaveAccessibleName(
    'Скачать обновление до версии 1.6.9'
  );
  await expect(
    page.getByText('Доступна новая версия', { exact: true })
  ).toBeVisible();
  const screenshot = testInfo.outputPath('desktop-updater.png');
  await page.locator('.menu-profile__update').screenshot({ path: screenshot });
  await testInfo.attach('desktop-updater', {
    path: screenshot,
    contentType: 'image/png'
  });
  await action.click();
  await expect(action).toHaveText('Перезапустить чат');
  await expect(action).toHaveAccessibleName('Установить и перезапустить');
  const buttonBox = (await action.boundingBox())!;
  const cardBox = (await page
    .locator('.menu-profile__update-content')
    .boundingBox())!;
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    cardBox.x + cardBox.width
  );
  await expect(
    page.getByText('Обновление загружено', { exact: true })
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

for (const theme of ['light', 'dark']) {
  for (const width of [280, 391]) {
    test(`Профиль Tauri: постоянные размеры ${theme}, ${width}px`, async ({
      page
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1100 });
      await openProfile(page, 'latest', theme);
      for (const zoom of [1, 1.3]) {
        await page.evaluate(
          async ({ width, zoom }) => {
            const shell = document.querySelector('main') as HTMLElement;
            shell.style.width = `${width / zoom}px`;
            shell.style.zoom = String(zoom);
            await document.fonts.ready;
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
          },
          { width, zoom }
        );

        const geometry = () =>
          page.locator('.menu-profile__update-content').evaluate(card => {
            const origin = card.getBoundingClientRect();
            return [
              '',
              '.menu-profile__update-status-icon',
              '.menu-profile__update-copy',
              '.menu-profile__update-title',
              '.menu-profile__update-description',
              '.menu-profile__update-action-slot'
            ].map(selector => {
              const box = (
                selector ? card.querySelector(selector)! : card
              ).getBoundingClientRect();
              return {
                x: box.x - origin.x,
                y: box.y - origin.y,
                width: box.width,
                height: box.height
              };
            });
          });
        const expected = await geometry();
        const trigger = page.getByTestId(
          'Fixture-MenuProfilePanel-UpdateTrigger'
        );
        const triggerHeight = (await trigger.boundingBox())!.height;
        const chevron = (await trigger.locator('svg').boundingBox())!;
        expect(chevron.width / zoom).toBeCloseTo(24, 1);
        expect(chevron.height / zoom).toBeCloseTo(16, 1);
        expect(
          await trigger
            .locator('.menu-profile__wallpapers-trigger-title')
            .evaluate(element => getComputedStyle(element).fontWeight)
        ).toBe('400');
        const phases = [
          'idle',
          'checking',
          'available',
          'downloading',
          'downloading',
          'downloading',
          'downloading',
          'downloaded',
          'installing',
          'error',
          'latest'
        ] as const;
        const progress = [
          null,
          null,
          null,
          null,
          0,
          53,
          99,
          null,
          null,
          null,
          null
        ];
        for (let index = 0; index < phases.length; index += 1) {
          await page.evaluate(
            async ({ phase, progress }) => {
              const updaterPath = '/src/services/useDesktopUpdater.ts';
              const messagePath = '/src/services/desktop-update-messages.ts';
              const { desktopUpdater } = await import(
                /* @vite-ignore */ updaterPath
              );
              const { DESKTOP_UPDATE_MESSAGES } = await import(
                /* @vite-ignore */ messagePath
              );
              desktopUpdater.state.value = {
                ...desktopUpdater.state.value,
                phase,
                progress,
                error:
                  phase === 'error'
                    ? DESKTOP_UPDATE_MESSAGES.downloadFailed
                    : ''
              };
              await new Promise(requestAnimationFrame);
            },
            { phase: phases[index], progress: progress[index] }
          );
          expect(
            await geometry(),
            `Геометрия ${phases[index]}, zoom ${zoom}`
          ).toEqual(expected);
          expect((await trigger.boundingBox())!.height).toBe(triggerHeight);
          const icon = expected[1];
          expect(icon.width / zoom).toBeCloseTo(36, 1);
          expect(icon.height / zoom).toBeCloseTo(36, 1);
        }
        const action = page.locator('.menu-profile__update-action-slot');
        const box = (await action.boundingBox())!;
        const card = (await page
          .locator('.menu-profile__update-content')
          .boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width);
        expect(box.y + box.height).toBeLessThanOrEqual(card.y + card.height);
        if (zoom === 1 && testInfo.project.name === 'chromium-desktop') {
          const screenshot = testInfo.outputPath(
            `desktop-updater-${theme}-${width}.png`
          );
          await page
            .locator('.menu-profile__update')
            .screenshot({ path: screenshot });
          await testInfo.attach(`desktop-updater-${theme}-${width}`, {
            path: screenshot,
            contentType: 'image/png'
          });
        }
      }
    });
  }
}

test('Профиль Tauri: ошибка проверки и повтор', async ({ page }) => {
  await openProfile(page, 'error');
  await expect(
    page.getByText('Не удалось обновить приложение', { exact: true })
  ).toBeVisible();
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await expect(action).toHaveText('Проверить');
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

test('Профиль Tauri: раскрытие показывает сохранённое состояние без новой проверки', async ({
  page
}) => {
  await openProfile(page, 'latest');
  await expect(
    page.getByText('Установлена новейшая версия', { exact: true })
  ).toBeVisible();
  const countChecks = () =>
    page.evaluate(
      () =>
        (window as any).updateCalls.filter(
          (value: string) => value === 'plugin:updater|check'
        ).length
    );
  const checks = await countChecks();
  expect(checks).toBeGreaterThan(0);
  const trigger = page.getByTestId('Fixture-MenuProfilePanel-UpdateTrigger');
  for (let i = 0; i < 3; i += 1) {
    await trigger.click();
    await expect(
      page.getByTestId('Fixture-MenuProfilePanel-UpdateMenu')
    ).toHaveCount(0);
    await trigger.click();
    await expect(page.getByTestId('DesktopAppVersion')).toBeVisible();
    expect(await countChecks()).toBe(checks);
  }
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
  await expect(action).toHaveText('Перезапустить чат');
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
