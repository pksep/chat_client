import { expect, test } from '@playwright/test';

const erpOrigin = 'http://localhost:65432';
const user = { id: 'erp-auth-user', nickname: '001', initials: 'Тест Т.Т.' };

const sharedToken = (iat: number, exp: number, suffix: string): string => {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'RS256', kid: 'test-key' }),
    encode({ sub: user.id, iat, exp }),
    suffix
  ].join('.');
};

for (const initialStatus of [200, 503]) {
  test(`ERP-вход продлевается до истечения при часах +6 секунд, ответ ${initialStatus}`, async ({
    page,
    context
  }) => {
    const serverNow = Math.floor(Date.now() / 1000);
    const browserNow = (serverNow + 6) * 1000;
    const oldToken = sharedToken(serverNow - 780, serverNow + 120, 'old');
    const newToken = sharedToken(serverNow + 60, serverNow + 960, 'new');
    const requests: string[] = [];
    let refreshStatus = initialStatus;
    await context.addCookies([
      {
        name: 'refresh_token',
        value: 'test-erp-refresh-cookie',
        url: erpOrigin,
        httpOnly: true,
        sameSite: 'Lax'
      }
    ]);
    await page.route('**/__erp-auth-refresh', route =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    );
    await page.route(`${erpOrigin}/api/auth/**`, async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push(`${request.method()} ERP ${path}`);
      const headers = {
        'Access-Control-Allow-Origin': new URL(page.url()).origin,
        'Access-Control-Allow-Credentials': 'true'
      };
      if (path === '/api/auth/session') {
        return route.fulfill({ headers, json: { ok: true, token: oldToken } });
      }
      expect(request.method()).toBe('POST');
      expect(request.headers().cookie).toContain(
        'refresh_token=test-erp-refresh-cookie'
      );
      return route.fulfill({
        headers,
        status: refreshStatus,
        json:
          refreshStatus === 200
            ? { ok: true, token: newToken }
            : { code: 'AUTH_UNAVAILABLE' }
      });
    });
    await page.route('**/auth-test-api/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push(`${request.method()} CHAT ${path}`);
      if (path.endsWith('/auth/session')) {
        return route.fulfill({
          status:
            request.headers().authorization === `Bearer ${newToken}`
              ? 200
              : 401,
          json: user
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.clock.install({ time: browserNow });
    await page.clock.pauseAt(browserNow + 1000);
    await page.goto('/__erp-auth-refresh');
    await page.evaluate(
      async ({ oldToken, user, erpOrigin }) => {
        const authPath = '/src/composables/useAuth.ts';
        const loginPath = '/src/composables/useLogin.ts';
        const configPath = '/src/services/useConfig.ts';
        const [auth, login, config] = await Promise.all([
          import(/* @vite-ignore */ authPath),
          import(/* @vite-ignore */ loginPath),
          import(/* @vite-ignore */ configPath)
        ]);
        config.setConfig({
          CHAT_API_DOMAIN: `${location.origin}/auth-test-api`,
          CHAT_ERP_URL: erpOrigin
        });
        login.setAuthToken(oldToken, 113);
        auth.saveChatAuthSession({
          token: oldToken,
          user,
          source: 'erp_bootstrap'
        });
      },
      { oldToken, user, erpOrigin }
    );

    await page.clock.fastForward(60_000);
    await expect
      .poll(() => requests.filter(request => request.includes(' ERP ')).length)
      .toBe(1);
    if (initialStatus === 503) {
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
        )
      ).toMatchObject({ token: oldToken, source: 'erp_bootstrap' });
      refreshStatus = 200;
      await page.clock.runFor(5500);
    }
    await expect
      .poll(() =>
        page.evaluate(() =>
          JSON.parse(localStorage.getItem('chat_auth_session') || '{}')
        )
      )
      .toMatchObject({ token: newToken, source: 'erp_bootstrap', user });
    expect(requests.filter(request => request.includes(' ERP '))).toEqual(
      Array.from(
        { length: initialStatus === 503 ? 2 : 1 },
        () => 'POST ERP /api/auth/refresh'
      )
    );
    expect(requests).toContain('GET CHAT /auth-test-api/auth/session');
    expect(requests.some(request => request.includes('/auth/logout'))).toBe(
      false
    );
    expect(page.url()).toContain('/__erp-auth-refresh');
    await page.clock.runFor(10_000);
    expect(requests.filter(request => request.includes(' ERP '))).toHaveLength(
      initialStatus === 503 ? 2 : 1
    );
  });
}
