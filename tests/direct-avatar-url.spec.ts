import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directAvatarUrl } from '../src/utils/direct-avatar-url';

test('внешний HTTPS-аватар сохраняет подписанную ссылку без преобразований', (): void => {
  const url =
    'https://sun9-1.userapi.com/avatar.jpg?signature=' + 'x'.repeat(1200);

  assert.equal(directAvatarUrl(url), url);
});

test('локальные изображения сохраняются, файлы Чата остаются в защищённом кеше', (): void => {
  assert.equal(
    directAvatarUrl('blob:https://chat.pksep.ru/avatar'),
    'blob:https://chat.pksep.ru/avatar'
  );
  assert.equal(
    directAvatarUrl('data:image/png;base64,test'),
    'data:image/png;base64,test'
  );

  for (const path of [
    'avatars/user.png',
    '/avatars/user.png',
    'manager-private/test',
    ''
  ])
    assert.equal(directAvatarUrl(path), null);
});

test('исполняемые, небезопасные и содержащие пароль адреса не загружаются напрямую', (): void => {
  for (const path of [
    'javascript:alert(1)',
    'http://sun9-1.userapi.com/avatar.jpg',
    'https://user:password@example.test/avatar',
    '//example.test/avatar',
    'not a URL'
  ])
    assert.equal(directAvatarUrl(path), null);
});
