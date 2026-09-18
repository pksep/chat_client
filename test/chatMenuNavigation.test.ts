import { describe, expect, test } from 'bun:test';
import { RouteTypes } from '../src/composables/navigation/useUrlRouting';
import { resolveChatMenuSectionForRoute } from '../src/utils/chatMenuNavigation';

describe('chat menu navigation', () => {
  test('keeps the selected menu section when a chat list has no open topic', () => {
    expect(
      resolveChatMenuSectionForRoute(RouteTypes.GROUP, null, false)
    ).toBeNull();
    expect(
      resolveChatMenuSectionForRoute(RouteTypes.DIALOGS, null, false)
    ).toBeNull();
  });

  test('opens a client topic in the clients section', () => {
    expect(
      resolveChatMenuSectionForRoute(RouteTypes.GROUP, 'client-topic', true)
    ).toBe('clients');
  });

  test('opens a regular topic in the chats section', () => {
    expect(
      resolveChatMenuSectionForRoute(RouteTypes.DIALOGS, 'chat-topic', false)
    ).toBe('chats');
  });
});
