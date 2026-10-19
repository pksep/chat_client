import { expect, test } from '@playwright/test';

const organization = 'http://127.0.0.1:65530';
const config = [
  `VITE_CHAT_API_DOMAIN=${organization}/api`,
  `VITE_CHAT_WS_DOMAIN=${organization}`,
  `VITE_ERP_URL=${organization}`
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.route(`${organization}/**`, async route => {
    if (route.request().url().includes('/config'))
      return route.fulfill({ contentType: 'text/plain', body: config });
    return route.fulfill({ json: { data: [] } });
  });
});

test('Enter после корпоративной ссылки открывает ввод логина', async ({
  page
}) => {
  await page.goto('/');
  const url = page.getByPlaceholder('Введите ссылку');
  await url.fill(organization);
  await url.press('Enter');
  await expect(page.getByPlaceholder('Введите пароль')).toBeVisible();
});

test('Enter в пароле отправляет вход один раз, незаполненные поля и загрузка блокируют повтор', async ({
  page
}) => {
  const requests: unknown[] = [];
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/*credentials-login', async route => {
    requests.push(route.request().postDataJSON());
    await responseReady;
    await route.fulfill({ status: 401, json: { message: 'Тестовый ответ' } });
  });
  await page.goto(`/?organization=${encodeURIComponent(organization)}`);
  // Загрузка ленивого экрана в Vite не входит в проверку поведения Enter.
  await page.getByTestId('AuthorizationScreen').waitFor();
  const login = page.getByPlaceholder('Введите логин');
  const password = page.getByPlaceholder('Введите пароль');
  await expect(password).toBeVisible();
  await password.press('Enter');
  expect(requests).toHaveLength(0);
  await login.fill('enter-test');
  await password.fill('test-password');
  await password.press('Enter');
  await expect.poll(() => requests.length).toBe(1);
  await password.press('Enter');
  expect(requests).toHaveLength(1);
  release();
  await expect(
    page.getByRole('button', { name: 'Войти', exact: true })
  ).toBeEnabled();
});

test('Enter в логине тоже запускает вход', async ({ page }) => {
  let requests = 0;
  await page.route('**/*credentials-login', async route => {
    requests++;
    await route.fulfill({ status: 401, json: { message: 'Тестовый ответ' } });
  });
  await page.goto(`/?organization=${encodeURIComponent(organization)}`);
  await page.getByTestId('AuthorizationScreen').waitFor();
  await page.getByPlaceholder('Введите пароль').fill('test-password');
  const login = page.getByPlaceholder('Введите логин');
  await login.fill('enter-test');
  await login.press('Enter');
  await expect.poll(() => requests).toBe(1);
});
