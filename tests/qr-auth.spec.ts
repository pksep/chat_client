import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseQrAuthPayload } from '../src/utils/qr-auth';

const code = 'A'.repeat(22);

test('короткий QR передаёт организацию без JWT и поддерживает префикс установки', (): void => {
  assert.deepEqual(
    parseQrAuthPayload(`https://chat.example.test/api/v2/q#qr=${code}`),
    {
      code,
      organization: 'https://chat.example.test'
    }
  );
  assert.deepEqual(
    parseQrAuthPayload(`https://chat.example.test/corp/api/v2/q#qr=${code}`),
    {
      code,
      organization: 'https://chat.example.test/corp'
    }
  );
});

test('после перехода обычной камерой читается тот же одноразовый код', (): void => {
  assert.deepEqual(
    parseQrAuthPayload(
      `https://web.example.test/?organization=https%3A%2F%2Fchat.example.test#qr=${code}`
    ),
    {
      code,
      organization: 'https://chat.example.test'
    }
  );
});

test('прежние QR с токеном и организациями продолжают распознаваться', (): void => {
  assert.deepEqual(
    parseQrAuthPayload(
      'https://web.example.test/?token=synthetic-token&organization=https%3A%2F%2Fchat.example.test'
    ),
    {
      token: 'synthetic-token',
      organization: 'https://chat.example.test'
    }
  );
  assert.deepEqual(parseQrAuthPayload('synthetic-token'), {
    token: 'synthetic-token'
  });
});

test('неполный QR и URL с секретом в организации отклоняются до запроса', (): void => {
  for (const value of [
    'https://chat.example.test/api/v2/q#qr=short',
    `https://web.example.test/#qr=${code}`,
    `ftp://chat.example.test/api/v2/q#qr=${code}`,
    `https://web.example.test/?organization=https%3A%2F%2Fuser%3Apassword%40chat.example.test#qr=${code}`
  ])
    assert.equal(parseQrAuthPayload(value), null);
});
