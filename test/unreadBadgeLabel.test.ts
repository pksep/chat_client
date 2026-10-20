import { expect, test } from 'bun:test';
import { unreadBadgeLabel } from '../src/utils/unread-badge-label';

test.each([0, 1, 8, 9])(
  'плашка сохраняет значение %i до девяти включительно',
  (count): void => {
    expect(unreadBadgeLabel(count)).toBe(String(count));
  }
);

test.each([10, 99, 100, 11242])(
  'плашка ограничивает подпись %i, не меняя счётчик',
  (count): void => {
    expect(unreadBadgeLabel(count)).toBe('9+');
    expect(count).toBeGreaterThan(9);
  }
);
