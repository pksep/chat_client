import { describe, expect, test } from 'bun:test';
import {
  latestManagerReplyContext,
  managerMessageChannel
} from '../src/utils/managerMessageChannel';

describe('automatic manager reply route', () => {
  test('uses the route from the latest customer message', () => {
    const messages = [
      {
        senderUserId: 'customer',
        ex: JSON.stringify({
          managerReplyRouteId: 'vk-route',
          managerChannel: 'vk'
        })
      },
      {
        senderUserId: 'manager',
        ex: JSON.stringify({
          managerReplyRouteId: 'vk-route',
          managerChannel: 'vk'
        })
      },
      {
        senderUserId: 'customer',
        ex: JSON.stringify({
          managerReplyRouteId: 'avito-route',
          managerChannel: 'avito'
        })
      }
    ];

    expect(latestManagerReplyContext(messages, 'customer')).toEqual({
      routeId: 'avito-route',
      channel: 'avito'
    });
  });

  test('ignores the latest message from another manager', () => {
    const messages = [
      {
        senderUserId: 'customer',
        ex: {
          managerReplyRouteId: 'site-route',
          managerChannel: 'widget'
        }
      },
      {
        senderUserId: 'another-manager',
        ex: {
          managerReplyRouteId: 'avito-route',
          managerChannel: 'avito'
        }
      }
    ];

    expect(latestManagerReplyContext(messages, 'customer')).toEqual({
      routeId: 'site-route',
      channel: 'widget'
    });
  });

  test('returns no route without a customer message', () => {
    expect(
      latestManagerReplyContext(
        [
          {
            senderUserId: 'manager',
            ex: {
              managerReplyRouteId: 'avito-route',
              managerChannel: 'avito'
            }
          }
        ],
        'customer'
      )
    ).toBeUndefined();
  });

  test('reads the platform shown in the author role', () => {
    expect(managerMessageChannel('{"managerChannel":"vk"}')).toBe('vk');
    expect(managerMessageChannel({ managerChannel: 'unknown' })).toBe('');
  });

  test('распознаёт WhatsApp и сохраняет адресата последнего сообщения клиента', (): void => {
    const message = {
      senderUserId: 'customer',
      ex: {
        managerChannel: 'whatsapp',
        managerReplyRouteId: 'whatsapp-route'
      }
    };

    expect(managerMessageChannel(message.ex)).toBe('whatsapp');
    expect(latestManagerReplyContext([message], 'customer')).toEqual({
      channel: 'whatsapp',
      routeId: 'whatsapp-route'
    });
  });
});
