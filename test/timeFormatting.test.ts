import { expect, test } from 'bun:test';
import {
  formatDay,
  formatListTime,
  formatTime
} from '../src/composables/useTime';

test('форматирование истории совпадает с ru-RU, включая границы суток, DST и смену пояса', () => {
  const previousTimezone = process.env.TZ;
  try {
    for (const timezone of [
      'UTC',
      'Asia/Yerevan',
      'America/New_York',
      'Asia/Kathmandu'
    ]) {
      process.env.TZ = timezone;
      for (const value of [
        '2024-02-29T23:59:00Z',
        '2024-03-10T06:59:00Z',
        '2024-03-10T07:00:00Z',
        '2024-11-03T06:00:00Z',
        '2025-12-31T23:00:00Z'
      ]) {
        const date = new Date(value);
        expect(formatTime(date)).toBe(
          date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
          })
        );
        expect(formatDay(date)).toBe(
          date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
        );
        expect(formatListTime(date)).toBe(
          date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
        );
      }
    }
    expect(formatTime(new Date(NaN))).toBe('Invalid Date');
    expect(formatDay(new Date(NaN))).toBe('Invalid Date');
    expect(formatListTime(new Date(NaN))).toBe('');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
