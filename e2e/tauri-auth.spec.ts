import { expect, test } from '@playwright/test';

test('Tauri использует нативный HTTP для входа, refresh и выхода', async ({
  page
}) => {
  await page.route('**/__tauri-auth', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  );
  await page.addInitScript(() => {
    const win = window as any;
    win.isTauri = true;
    win.authRequests = [];
    win.__TAURI_INTERNALS__ = {
      invoke: async (command: string, { options }: any) => {
        if (command !== 'desktop_auth_request') throw new Error(command);
        win.authRequests.push(options);
        return options.url.endsWith('/logout')
          ? { status: 204, body: '' }
          : options.url.endsWith('/refresh')
            ? { status: 401, body: '{"code":"CHAT_REFRESH_MISSING"}' }
            : { status: 200, body: '{"token":"test-access-token"}' };
      }
    };
  });
  await page.goto('/__tauri-auth');
  const result = await page.evaluate(async () => {
    const path = '/src/utils/auth-http.ts';
    const { fetchAuthWithCookies } = await import(/* @vite-ignore */ path);
    const origin = 'https://chat.example.test/api/auth';
    const login = await fetchAuthWithCookies(
      `${origin}/credentials-login`,
      'POST',
      {
        identifier: 'test-user',
        password: 'test-password'
      }
    );
    const refresh = await fetchAuthWithCookies(`${origin}/refresh`, 'POST');
    const logout = await fetchAuthWithCookies(`${origin}/logout`, 'POST');
    return {
      login: await login.json(),
      refreshStatus: refresh.status,
      refresh: await refresh.json(),
      logoutStatus: logout.status,
      logoutBody: await logout.text(),
      requests: (window as any).authRequests
    };
  });
  expect(result.login).toEqual({ token: 'test-access-token' });
  expect(result.refreshStatus).toBe(401);
  expect(result.refresh).toEqual({ code: 'CHAT_REFRESH_MISSING' });
  expect(result.logoutStatus).toBe(204);
  expect(result.logoutBody).toBe('');
  expect(result.requests).toHaveLength(3);
  expect(result.requests[0]).toMatchObject({
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: { identifier: 'test-user', password: 'test-password' }
  });
});

test('Tauri не скрывает ошибку нативной сети повторным браузерным входом', async ({
  page
}) => {
  await page.route('**/__tauri-auth', route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
  );
  await page.addInitScript(() => {
    const win = window as any;
    win.isTauri = true;
    win.__TAURI_INTERNALS__ = {
      invoke: async () => {
        throw 'Сервер недоступен';
      }
    };
  });
  await page.goto('/__tauri-auth');
  expect(
    await page.evaluate(async () => {
      const path = '/src/utils/auth-http.ts';
      const { fetchAuthWithCookies } = await import(/* @vite-ignore */ path);
      try {
        await fetchAuthWithCookies(
          'https://chat.example.test/api/auth/refresh',
          'POST'
        );
        return 'unexpected success';
      } catch (error) {
        return String(error);
      }
    })
  ).toBe('Сервер недоступен');
});
