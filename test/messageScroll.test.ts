import { describe, expect, test } from 'bun:test';
import { shouldPinMessageAppendToBottom } from '../src/utils/messageScroll';

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
