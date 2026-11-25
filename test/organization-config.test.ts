import { afterEach, expect, test } from 'bun:test';
import {
  fetchOrganizationConfig,
  isOrganizationConfig,
  OrganizationConfigError,
  organizationConfigErrorMessage
} from '../src/utils/organization-config';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const parse = (body: string) => ({
  CHAT_API_DOMAIN: body.startsWith('VITE_CHAT_API_DOMAIN=')
    ? body.slice(21)
    : undefined
});

test('пустая конфигурация старой неверной организации не используется как offline fallback', () => {
  expect(isOrganizationConfig({})).toBe(false);
  expect(isOrganizationConfig(undefined)).toBe(false);
  expect(
    isOrganizationConfig({ CHAT_API_DOMAIN: 'https://api.fixture.invalid/api' })
  ).toBe(true);
});

test('не сохраняет HTML fallback и отсутствующий сервер как организацию', async () => {
  for (const response of [
    new Response('<!doctype html>'),
    new Response('', { status: 404 })
  ]) {
    globalThis.fetch = (async () => response) as typeof fetch;
    await expect(
      fetchOrganizationConfig('https://fixture.invalid/config', parse)
    ).rejects.toMatchObject({ kind: 'not-found' });
  }
  expect(
    organizationConfigErrorMessage(new OrganizationConfigError('not-found'))
  ).toContain('не найден');
});

test('отличает недоступный сервер от отсутствующего', async () => {
  globalThis.fetch = (async () =>
    new Response('', { status: 503 })) as typeof fetch;
  await expect(
    fetchOrganizationConfig('https://fixture.invalid/config', parse)
  ).rejects.toMatchObject({ kind: 'unavailable' });
  expect(
    organizationConfigErrorMessage(new OrganizationConfigError('unavailable'))
  ).toContain('временно недоступен');
});

test('принимает конфигурацию с адресом API', async () => {
  globalThis.fetch = (async () =>
    new Response(
      'VITE_CHAT_API_DOMAIN=https://api.fixture.invalid/api'
    )) as typeof fetch;
  expect(
    await fetchOrganizationConfig('https://fixture.invalid/config', parse)
  ).toEqual({ CHAT_API_DOMAIN: 'https://api.fixture.invalid/api' });
});
