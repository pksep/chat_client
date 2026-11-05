import { afterEach, expect, mock, test } from 'bun:test';

const nativeRequest = mock(async (_options: Record<string, unknown>) => ({
  status: 200,
  data: {},
  headers: {}
}));
mock.module('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  CapacitorHttp: { request: nativeRequest }
}));
const { fetchAuthWithCookies } = await import('../src/utils/auth-http');
afterEach(() => nativeRequest.mockReset());

test('QR-обмен и refresh в Capacitor Android используют один нативный транспорт cookie', async () => {
  const calls: Record<string, unknown>[] = [];
  nativeRequest.mockImplementation(async options => {
    calls.push(options);
    return {
      status: 200,
      data: { token: calls.length === 1 ? 'phone-access' : 'phone-renewed' },
      headers: {}
    };
  });
  const exchange = await fetchAuthWithCookies(
    'https://corporate.test/api/auth/qr-login',
    'POST',
    {},
    { Authorization: 'Bearer computer-access' }
  );
  const refresh = await fetchAuthWithCookies(
    'https://corporate.test/api/auth/refresh',
    'POST'
  );
  expect(await exchange.json()).toEqual({ token: 'phone-access' });
  expect(await refresh.json()).toEqual({ token: 'phone-renewed' });
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({
    method: 'POST',
    data: {},
    disableRedirects: true,
    headers: { Authorization: 'Bearer computer-access' }
  });
  expect(calls[1]).toMatchObject({
    method: 'POST',
    disableRedirects: true,
    headers: { 'Cache-Control': 'no-store' }
  });
  expect(calls[1].headers).not.toHaveProperty('Authorization');
  expect(calls[1].headers).not.toHaveProperty('Cookie');
});

test('Capacitor возвращает отказ QR без подмены успешным ответом', async () => {
  nativeRequest.mockResolvedValue({
    status: 401,
    data: { code: 'AUTH_INACTIVE' },
    headers: {}
  });
  const response = await fetchAuthWithCookies(
    'https://corporate.test/api/auth/qr-login',
    'POST',
    {},
    { Authorization: 'Bearer expired-access' }
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: 'AUTH_INACTIVE' });
});
