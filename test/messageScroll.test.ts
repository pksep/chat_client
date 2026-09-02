import { describe, expect, test } from 'bun:test';
import {
  getMessageReactionLayoutSignature,
  shouldPinMessageAppendToBottom
} from '../src/utils/messageScroll';

describe('message layout signature', () => {
  test('changes when a reaction is added to the last message', () => {
    const withoutReaction = getMessageReactionLayoutSignature([]);
    const withReaction = getMessageReactionLayoutSignature([
      { id: 'reaction-id', senderUserId: 'user-id', text: '❤️' }
    ]);

    expect(withReaction).not.toBe(withoutReaction);
  });

  test('does not depend on reaction array order', () => {
    const first = { id: 'first', senderUserId: 'user-id', text: '❤️' };
    const second = { id: 'second', senderUserId: 'user-id', text: '👍' };

    expect(getMessageReactionLayoutSignature([first, second])).toBe(
      getMessageReactionLayoutSignature([second, first])
    );
  });
});

describe('message append scroll behavior', () => {
  test('keeps the live edge pinned after a temporary layout growth', () => {
    expect(
      shouldPinMessageAppendToBottom({
        isAppend: true,
        preserveViewportForDownPagination: false,
        isUserScrolling: false,
        viewportMode: 'live',
        isAtBottom: false,
        isNearBottom: true
      })
    ).toBe(true);
  });

  test('preserves the viewport while the user reads history', () => {
    expect(
      shouldPinMessageAppendToBottom({
        isAppend: true,
        preserveViewportForDownPagination: false,
        isUserScrolling: false,
        viewportMode: 'history',
        isAtBottom: false,
        isNearBottom: true
      })
    ).toBe(false);
  });

  test('does not override down-pagination viewport preservation', () => {
    expect(
      shouldPinMessageAppendToBottom({
        isAppend: true,
        preserveViewportForDownPagination: true,
        isUserScrolling: false,
        viewportMode: 'live',
        isAtBottom: true,
        isNearBottom: true
      })
    ).toBe(false);
  });

  test('does not pin a live viewport that is far from the bottom', () => {
    expect(
      shouldPinMessageAppendToBottom({
        isAppend: true,
        preserveViewportForDownPagination: false,
        isUserScrolling: false,
        viewportMode: 'live',
        isAtBottom: false,
        isNearBottom: false
      })
    ).toBe(false);
  });
});
