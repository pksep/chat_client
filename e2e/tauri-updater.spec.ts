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
        if (
          command === 'plugin:updater|install' &&
          win.updateMode === 'install-error'
        )
          throw new Error('test installer failure');
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
      'Сейчас у вас актуальная версия приложения 1.6.8'
    );
}

test('Профиль Tauri: версия, скачивание и отдельная установка', async ({
  page
}, testInfo) => {
  await openProfile(page);
  const action = page.getByTestId('Fixture-MenuProfilePanel-UpdateAction');
  await expect(action).toHaveText('Обновить');
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
  await expect(action).toHaveText('Перезагрузить');
  await expect(action).toHaveAccessibleName('Установить и перезапустить');
  const buttonBox = (await action.boundingBox())!;
  const cardBox = (await page
    .locator('.menu-profile__update-content')
    .boundingBox())!;
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
    cardBox.x + cardBox.width
  );
  await expect(
    page.getByText('Готово к установке', { exact: true })
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
        (window as any).updateCalls.includes('desktop_restart')
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

test('Боковая кнопка Tauri показывает ошибку установки и позволяет повторить', async ({
  page
}) => {
  await openProfile(page, 'install-error');
  await page.evaluate(() =>
    (window as any).profileQrFixture.showUpdateBanner()
  );
  const button = page.locator('.menu-update-button');
  await button.click();
  await expect(button).toHaveText('Перезапустить чат');
  await button.click();
  await expect(page.locator('.menu-update__error')).toHaveText(
    'Не удалось установить обновление. Повторите установку.'
  );
  await expect(page.locator('.menu-update__error')).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).updateCalls.includes('desktop_restart')
    )
  ).toBe(false);
  await page.evaluate(() => {
    (window as any).updateMode = 'available';
  });
  await button.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).updateCalls.includes('desktop_restart')
      )
    )
    .toBe(true);
});

for (const theme of ['light', 'dark']) {
  for (const width of [280, 391]) {
    test(
      'Профиль Tauri: макет обновлений ' + theme + ', ' + width + 'px',
      async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1100 });
        await openProfile(page, 'latest', theme);
        const trigger = page.getByTestId(
          'Fixture-MenuProfilePanel-UpdateTrigger'
        );
        const stickers = page.getByTestId(
          'Fixture-MenuProfilePanel-Stickers-Trigger'
        );
        const card = page.locator('.menu-profile__update-content');
        const action = page.locator('.menu-profile__update-action-slot');
        await expect(
          card.locator('.menu-profile__update-status-icon')
        ).toHaveCount(0);
        await expect(
          card.locator('.menu-profile__update-description')
        ).toHaveText('Сейчас у вас актуальная версия приложения 1.6.8');
        await expect(
          action.locator('.menu-profile__update-check')
        ).toBeVisible();
        await expect(action).not.toContainText('1.6.8');
        expect((await trigger.boundingBox())!.y).toBeLessThan(
          (await stickers.boundingBox())!.y
        );

        for (const zoom of [1, 1.3]) {
          await page.evaluate(
            async ({ width, zoom }) => {
              const shell = document.querySelector('main') as HTMLElement;
              shell.style.width = String(width / zoom) + 'px';
              shell.style.zoom = String(zoom);
              await document.fonts.ready;
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
            },
            { width, zoom }
          );
          const triggerHeight = (await trigger.boundingBox())!.height;
          const chevron = (await trigger.locator('svg').boundingBox())!;
          expect(chevron.width / zoom).toBeCloseTo(24, 1);
          expect(chevron.height / zoom).toBeCloseTo(16, 1);
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
            15,
            99,
            null,
            null,
            null,
            null
          ];
          let downloadBox: {
            x: number;
            y: number;
            width: number;
            height: number;
          } | null = null;
          for (let index = 0; index < phases.length; index += 1) {
            const phase = phases[index];
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
              { phase, progress: progress[index] }
            );
            const boxes = await card.evaluate(element => {
              const box = (element: Element) => {
                const { x, y, width, height, right, bottom } =
                  element.getBoundingClientRect();
                return { x, y, width, height, right, bottom };
              };
              return {
                card: box(element),
                copy: box(element.querySelector('.menu-profile__update-copy')!),
                action: box(
                  element.querySelector('.menu-profile__update-action-slot')!
                ),
                overflow: element.scrollWidth > element.clientWidth
              };
            });
            expect(boxes.overflow, phase).toBe(false);
            expect(boxes.copy.x).toBeGreaterThan(boxes.card.x);
            expect(boxes.copy.right).toBeLessThanOrEqual(boxes.action.x);
            expect(boxes.copy.bottom).toBeLessThan(boxes.card.bottom);
            expect(boxes.action.right).toBeLessThan(boxes.card.right);
            expect(boxes.action.bottom).toBeLessThan(boxes.card.bottom);
            expect((await trigger.boundingBox())!.height).toBe(triggerHeight);
            if (phase === 'downloading') {
              const progressbar = card.getByRole('progressbar');
              await expect(progressbar).toHaveAccessibleName(
                'Загружаем обновление'
              );
              if (progress[index] === null) {
                await expect(progressbar).not.toHaveAttribute('aria-valuenow');
              } else {
                await expect(progressbar).toHaveAttribute(
                  'aria-valuenow',
                  String(progress[index])
                );
                await expect(progressbar).toContainText(
                  String(progress[index]) + '%'
                );
              }
              const currentBox = (await card.boundingBox())!;
              if (downloadBox) expect(currentBox).toEqual(downloadBox);
              downloadBox = currentBox;
            }
            if (
              zoom === 1 &&
              width === 391 &&
              (['available', 'downloaded', 'latest'].includes(phase) ||
                (phase === 'downloading' && progress[index] === 15))
            ) {
              const screenshot = testInfo.outputPath(
                'profile-update-' + theme + '-' + phase + '.png'
              );
              await page
                .locator('.menu-profile__update')
                .screenshot({ path: screenshot });
              await testInfo.attach('profile-update-' + theme + '-' + phase, {
                path: screenshot,
                contentType: 'image/png'
              });
            }
          }
        }
      }
    );
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
    'Сейчас у вас актуальная версия приложения 1.6.8'
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
  await expect(action).toHaveText('Перезагрузить');
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
