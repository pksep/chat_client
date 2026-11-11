import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const user = { id: 'qr-session-user', nickname: '0042', initials: 'Тест QR' };
const jwt = (iat: number, exp: number, signature: string): string => {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'RS256', kid: 'qr-test-key' }),
    encode({ sub: '42', iat, exp }),
    signature
  ].join('.');
};

test('телефон продлевает собственную QR-сессию после истечения access компьютера и перезапуска', async ({
  page,
  context
}, testInfo) => {
  const moduleOrigin = new URL(
    testInfo.project.use.baseURL || 'http://localhost:5173'
  ).origin;
  const now = Math.floor(Date.now() / 1000);
  const computer = jwt(now - 870, now + 30, 'computer');
  const phone = jwt(now - 780, now + 120, 'phone');
  const renewed = jwt(now + 60, now + 960, 'phone-renewed');
  const requests: string[] = [];
  const cookies: string[] = [];
  const authorizations: string[] = [];
  // Настоящий HTTP-сервер проверяет отправленную cookie, включая WebKit.
  const server = createServer((request, response) => {
    if (request.url === '/__qr-session') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html>');
      return;
    }
    response.setHeader(
      'Access-Control-Allow-Origin',
      request.headers.origin || '*'
    );
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type'
    );
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const path = request.url || '';
    if (!path.includes('/auth/')) {
      response.end('{}');
      return;
    }
    requests.push(path);
    cookies.push(request.headers.cookie || '');
    authorizations.push(request.headers.authorization || '');
    if (path.endsWith('/qr-login')) {
      response.setHeader(
        'Set-Cookie',
        'chat_refresh_token=synthetic-phone-refresh; Path=/qr-test-api/auth; HttpOnly; SameSite=Lax'
      );
      response.end(
        JSON.stringify({
          token: phone,
          user,
          expireTimeSeconds: 120,
          source: 'chat_qr'
        })
      );
      return;
    }
    response.end(
      JSON.stringify({ token: renewed, user, expireTimeSeconds: 900 })
    );
  });
  await new Promise<void>(resolve => server.listen(0, resolve));
  const apiUrl = `http://localhost:${(server.address() as AddressInfo).port}/qr-test-api`;
  try {
    await page.clock.install({ time: now * 1000 });
    await page.clock.pauseAt(now * 1000 + 1000);
    await page.goto(new URL('/__qr-session', apiUrl).href);
    await page.evaluate(
      async ({ computer, apiUrl, moduleOrigin }) => {
        const authPath = `${moduleOrigin}/src/composables/useAuth.ts`;
        const configPath = `${moduleOrigin}/src/services/useConfig.ts`;
        const loginPath = `${moduleOrigin}/src/composables/useLogin.ts`;
        const [auth, config, login] = await Promise.all([
          import(/* @vite-ignore */ authPath),
          import(/* @vite-ignore */ configPath),
          import(/* @vite-ignore */ loginPath)
        ]);
        config.setConfig({
          CHAT_API_DOMAIN: apiUrl,
          CHAT_ERP_URL: `${location.origin}/unexpected-erp`
        });
        const session = await auth.loginWithQrToken(computer);
        login.setAuthToken(session.token, session.expireTimeSeconds);
        auth.saveChatAuthSession(session);
      },
      { computer, apiUrl, moduleOrigin }
    );
    const cookie = (await context.cookies()).find(
      cookie => cookie.name === 'chat_refresh_token'
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      'synthetic-phone-refresh'
    );
    await page.clock.fastForward(60_000);
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
        )
      )
      .toMatchObject({ token: renewed, source: 'chat_qr', user });
    expect(requests).toEqual([
      '/qr-test-api/auth/qr-login',
      '/qr-test-api/auth/refresh'
    ]);
    expect(authorizations[0]).toBe(`Bearer ${computer}`);
    expect(cookies[0]).toBe('');
    expect(cookies[1]).toContain('chat_refresh_token=synthetic-phone-refresh');
    await page.reload();
    await page.evaluate(
      async ({ apiUrl, moduleOrigin }) => {
        const configPath = `${moduleOrigin}/src/services/useConfig.ts`;
        const authPath = `${moduleOrigin}/src/composables/useAuth.ts`;
        const [auth, config] = await Promise.all([
          import(/* @vite-ignore */ authPath),
          import(/* @vite-ignore */ configPath)
        ]);
        config.setConfig({
          CHAT_API_DOMAIN: apiUrl,
          CHAT_ERP_URL: `${location.origin}/unexpected-erp`
        });
        await auth.tryRefreshErpSession();
      },
      { apiUrl, moduleOrigin }
    );
    expect(requests).toEqual([
      '/qr-test-api/auth/qr-login',
      '/qr-test-api/auth/refresh',
      '/qr-test-api/auth/refresh'
    ]);
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}').source
      )
    ).toBe('chat_qr');
    expect(cookies[2]).toContain('chat_refresh_token=synthetic-phone-refresh');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
});
