import { expect, test } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

for (const mode of ['true', 'false', undefined]) {
  test(`вход при VITE_AUTH_WITH_LOGIN=${mode ?? 'не задан'}`, async ({
    page
  }, testInfo) => {
    const fixture = await createAndroidPerformanceServer({
      port: 5470 + testInfo.parallelIndex,
      topicCount: 1,
      messagesPerTopic: 2,
      userCount: 2
    });
    try {
      await page.route(`${fixture.origin}/config`, async route => {
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({
          response,
          body:
            mode === undefined ? body : `${body}\nVITE_AUTH_WITH_LOGIN=${mode}`
        });
      });
      const credentials: unknown[] = [];
      await page.route('**/auth/credentials-login', async route => {
        credentials.push(route.request().postDataJSON());
        await route.fulfill({
          json: { token: 'login-mode-test-token', user: fixture.user }
        });
      });
      await page.goto('/');
      await page.getByTestId('AuthorizationScreen').waitFor();
      await page.getByPlaceholder('Введите ссылку').fill(fixture.origin);
      await page.getByRole('button', { name: 'Далее', exact: true }).click();
      await expect(page.getByPlaceholder('Введите пароль')).toBeVisible();

      const combobox = page.getByTestId('LoginForm-TabelNumber-Combobox');
      await expect(combobox).toBeVisible();
      if (mode === 'false') {
        const tabel = page.getByPlaceholder('Введите логин');
        await expect(tabel).toBeVisible();
        await tabel.click();
        await expect(
          page.getByText(fixture.user.initials, { exact: true })
        ).toHaveCount(0);
        await tabel.fill('000294');
      } else {
        await page.getByPlaceholder('Введите логин').click();
        await page.getByText(fixture.user.initials, { exact: true }).click();
      }
      await page.screenshot({ path: testInfo.outputPath('authorization.png') });
      await page.getByPlaceholder('Введите пароль').fill('test-password');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();

      await expect(page.getByTestId('AuthorizationScreen')).toBeHidden();
      expect(credentials).toEqual([
        {
          identifier: mode === 'false' ? '000294' : fixture.user.nickname,
          password: 'test-password'
        }
      ]);
      await expect
        .poll(() =>
          fixture.requests.some(request =>
            request.path.startsWith('/api/topics')
          )
        )
        .toBe(true);
      expect(
        fixture.requests.some(request =>
          request.path.startsWith('/api/users/login-options')
        )
      ).toBe(mode !== 'false');
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('chat_auth_session') || '{}').token
        )
      ).toBe('login-mode-test-token');
    } finally {
      await fixture.close();
    }
  });
}

test('ручной ввод табеля: Enter, пустые поля и защита от повторного входа', async ({
  page
}) => {
  const organization = 'http://127.0.0.1:65530';
  const requests: unknown[] = [];
  const loginOptions: string[] = [];
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route(`${organization}/**`, async route => {
    const url = route.request().url();
    if (url.endsWith('/config'))
      return route.fulfill({
        contentType: 'text/plain',
        body: `VITE_CHAT_API_DOMAIN=${organization}/api\nVITE_AUTH_WITH_LOGIN=false`
      });
    if (url.includes('/users/login-options')) loginOptions.push(url);
    if (url.endsWith('/auth/credentials-login')) {
      requests.push(route.request().postDataJSON());
      await responseReady;
      return route.fulfill({
        status: 401,
        json: { message: 'Тестовый ответ' }
      });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto(`/?organization=${encodeURIComponent(organization)}`);
  await page.getByTestId('AuthorizationScreen').waitFor();
  const tabel = page.getByPlaceholder('Введите логин');
  const password = page.getByPlaceholder('Введите пароль');
  const submit = page.locator('.authorization-screen__button--credentials');
  await expect(tabel).toBeVisible();
  await expect(submit).toBeDisabled();
  await password.fill('test-password');
  await password.press('Enter');
  expect(requests).toHaveLength(0);
  await tabel.fill('000294');
  await tabel.press('Enter');
  await expect.poll(() => requests.length).toBe(1);
  await expect(submit).toBeDisabled();
  await password.press('Enter');
  expect(requests).toEqual([
    { identifier: '000294', password: 'test-password' }
  ]);
  release();
  await expect(submit).toBeEnabled();
  expect(loginOptions).toHaveLength(0);
});

for (const mode of ['true', 'false']) {
  test(`обновляет сохранённый режим входа на ${mode} из свежего конфига`, async ({
    page
  }) => {
    const organization = 'http://127.0.0.1:65530';
    const loginOptions: string[] = [];
    await page.addInitScript(
      ({ organization, mode }) => {
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([
            {
              url: organization,
              config: {
                CHAT_API_DOMAIN: `${organization}/api`,
                CHAT_AUTH_WITH_LOGIN: mode === 'true' ? 'false' : 'true'
              }
            }
          ])
        );
        localStorage.setItem('chat_runtime_last_organization', organization);
      },
      { organization, mode }
    );
    await page.route(`${organization}/**`, async route => {
      const url = route.request().url();
      if (url.endsWith('/config'))
        return route.fulfill({
          contentType: 'text/plain',
          body: `VITE_CHAT_API_DOMAIN=${organization}/api\nVITE_AUTH_WITH_LOGIN=${mode}`
        });
      if (url.includes('/users/login-options')) loginOptions.push(url);
      return route.fulfill({ json: { data: [] } });
    });
    await page.goto('/');
    await page.getByTestId('AuthorizationScreen').waitFor();
    await expect(page.getByPlaceholder('Введите логин')).toBeVisible();
    if (mode === 'true') await expect.poll(() => loginOptions.length).toBe(1);
    else expect(loginOptions).toHaveLength(0);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem('chat_runtime_organizations') || '[]'
          )[0].config.CHAT_AUTH_WITH_LOGIN
      )
    ).toBe(mode);
  });
}

test('при переключении на false ждёт конфиг, скрывает загруженные инициалы и отправляет табель без подмены', async ({
  page
}) => {
  const organization = 'http://127.0.0.1:65530';
  const credentials: unknown[] = [];
  let configRequests = 0;
  let loginOptionsRequests = 0;
  let releaseConfig!: () => void;
  const configReady = new Promise<void>(resolve => {
    releaseConfig = resolve;
  });
  await page.route(`${organization}/**`, async route => {
    const url = route.request().url();
    if (url.endsWith('/config')) {
      configRequests++;
      const mode = configRequests === 1 ? 'true' : 'false';
      if (mode === 'false') await configReady;
      return route.fulfill({
        contentType: 'text/plain',
        body: `VITE_CHAT_API_DOMAIN=${organization}/api\nVITE_AUTH_WITH_LOGIN=${mode}`
      });
    }
    if (url.includes('/users/login-options')) {
      loginOptionsRequests++;
      return route.fulfill({
        json: {
          data: [
            {
              id: '29420000-0000-4000-8000-000000000000',
              initials: '045',
              nickname: '000999',
              avatarUrl: '',
              ex: {}
            }
          ]
        }
      });
    }
    if (url.endsWith('/auth/credentials-login')) {
      credentials.push(route.request().postDataJSON());
      return route.fulfill({
        status: 401,
        json: { message: 'Тестовый ответ' }
      });
    }
    return route.fulfill({ json: { data: [] } });
  });

  await page.goto(`/?organization=${encodeURIComponent(organization)}`);
  await page.getByTestId('AuthorizationScreen').waitFor();
  const login = page.getByPlaceholder('Введите логин');
  await expect.poll(() => loginOptionsRequests).toBe(1);
  await login.click();
  await expect(page.getByText('045', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await page.getByText(organization, { exact: true }).click();
  await expect.poll(() => configRequests).toBe(2);
  await expect(page.getByPlaceholder('Введите пароль')).toHaveCount(0);
  expect(loginOptionsRequests).toBe(1);
  releaseConfig();

  await expect(login).toBeVisible();
  await login.click();
  await expect(page.getByText('045', { exact: true })).toHaveCount(0);
  await login.fill('045');
  await page.getByPlaceholder('Введите пароль').fill('test-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect.poll(() => credentials.length).toBe(1);
  expect(credentials).toEqual([
    { identifier: '045', password: 'test-password' }
  ]);
  expect(loginOptionsRequests).toBe(1);
});
