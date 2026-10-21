import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAccessTokenFromResponse } from '../src/utils/auth-response-token';

test('раздельный вход выбирает токен Чата, а не токен ERP', (): void => {
  assert.equal(
    getAccessTokenFromResponse({
      accessToken: 'chat-access',
      token: 'chat-access',
      erpToken: 'erp-access'
    }),
    'chat-access'
  );
});

test('единая авторизация сохраняет общий токен', (): void => {
  assert.equal(
    getAccessTokenFromResponse({
      accessToken: 'shared-access',
      token: 'shared-access',
      erpToken: 'shared-access'
    }),
    'shared-access'
  );
});

test('поле token используется, если accessToken отсутствует', (): void => {
  assert.equal(
    getAccessTokenFromResponse({
      token: 'chat-access',
      erpToken: 'erp-access'
    }),
    'chat-access'
  );
});

test('сохранена совместимость с ответом, содержащим только erpToken', (): void => {
  assert.equal(
    getAccessTokenFromResponse({ erpToken: 'shared-access' }),
    'shared-access'
  );
});

test('пустые и некорректные значения не становятся токеном', (): void => {
  assert.equal(getAccessTokenFromResponse({}), '');
  assert.equal(
    getAccessTokenFromResponse({ accessToken: '', token: null, erpToken: 123 }),
    ''
  );
  assert.equal(
    getAccessTokenFromResponse({ accessToken: {}, token: 'chat-access' }),
    'chat-access'
  );
});
