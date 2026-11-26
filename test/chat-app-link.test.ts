import { describe, expect, test } from 'bun:test';
import {
  buildChatAppUrl,
  parseDesktopChatAppUrl
} from '../src/utils/chat-app-link';

describe('переход из веба в приложение', () => {
  test('обычный адрес сохраняет маршрут и организацию без токена и QR', () => {
    const link = buildChatAppUrl(
      'https://chat.pksep.ru/dialogs/person?organization=https%3A%2F%2Ferp.example.test&token=secret#qr=one-time'
    );
    expect(link).toBe(
      'sepchat://open?path=%2Fdialogs%2Fperson&organization=https%3A%2F%2Ferp.example.test'
    );
    const target = parseDesktopChatAppUrl(link)!;
    expect(target.pathname).toBe('/dialogs/person');
    expect(target.searchParams.get('organization')).toBe(
      'https://erp.example.test'
    );
    expect(target.href).not.toMatch(/secret|one-time/);
  });

  test('приглашение сохраняет токен звонка и точную комнату', () => {
    const link = buildChatAppUrl(
      'https://chat.pksep.ru/?callRoom=room&callInvite=signed%2Btoken&token=erp-secret'
    );
    expect(link).toBe(
      'sepchat://invite?callRoom=room&callInvite=signed%2Btoken'
    );
  });

  test('Android без установленного пакета возвращается в веб', () => {
    const link = buildChatAppUrl(
      'https://chat.pksep.ru/group/team?token=secret',
      true
    );
    expect(link).toContain(
      'intent://chat.pksep.ru/group/team#Intent;scheme=https;package=sep.pksep.app;'
    );
    expect(link).toContain(
      encodeURIComponent('https://chat.pksep.ru/group/team?appClient=web')
    );
    expect(link).not.toContain('secret');
  });

  test.each([
    'https://chat.pksep.ru/',
    'sepchat://open@evil.test',
    'sepchat://open?path=//evil.test',
    'sepchat://open?path=/dialogs/../evil',
    'sepchat://open?path=/dialogs/one&path=/dialogs/two',
    'sepchat://open?organization=javascript:alert(1)',
    'sepchat://open?organization=https://name:password@example.test'
  ])('не принимает произвольный переход: %s', value => {
    expect(parseDesktopChatAppUrl(value)).toBeNull();
  });
});
