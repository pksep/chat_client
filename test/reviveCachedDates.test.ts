import { expect, test } from 'bun:test';
import { reviveCachedDates } from '../src/utils/revive-cached-dates';

test('разные кеши сохраняют собственный набор полей даты', () => {
  const legacy = { timestamp: '2026-09-01T00:00:00Z' };
  const shadow = {
    timestamp: legacy.timestamp,
    nested: { receivedAt: legacy.timestamp }
  };
  reviveCachedDates(legacy);
  reviveCachedDates(shadow, new Set(['timestamp', 'receivedAt']));
  expect(typeof legacy.timestamp).toBe('string');
  expect(shadow.timestamp).toBeInstanceOf(Date);
  expect(shadow.nested.receivedAt).toBeInstanceOf(Date);
});

test('восстанавливает даты старого кеша, сохраняя вложения, неизвестные поля и идентичность объектов', () => {
  const payload = JSON.parse(
    '{"createdAt":"2026-09-01T00:00:00Z","nested":[{"lastOnline":"2026-09-02T00:00:00Z","deletedAt":null,"updatedAt":"invalid","text":"2026-09-01T00:00:00Z","media":[{"url":"https://example.test/a","size":123}]}],"__proto__":{"createdAt":"2026-09-03T00:00:00Z"}}'
  );
  const child = payload.nested[0];
  expect(reviveCachedDates(payload)).toBe(payload);
  expect(payload.nested[0]).toBe(child);
  expect(payload.createdAt.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  expect(child.lastOnline.toISOString()).toBe('2026-09-02T00:00:00.000Z');
  expect(Number.isNaN(child.updatedAt.getTime())).toBe(true);
  expect(child.deletedAt).toBeNull();
  expect(child.text).toBe('2026-09-01T00:00:00Z');
  expect(child.media).toEqual([{ url: 'https://example.test/a', size: 123 }]);
  expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
  expect(payload.__proto__.createdAt).toBeInstanceOf(Date);
  expect(Object.prototype).not.toHaveProperty('createdAt');
});

test('повторное чтение и native structured clone не портят Date, Blob, общие ссылки и циклы', () => {
  const date = new Date('2026-09-01T00:00:00Z');
  const blob = new Blob(['файл']);
  const shared = { updatedAt: '2026-09-02T00:00:00Z' };
  const payload: any = { date, blob, createdAt: date, shared, array: [shared] };
  payload.self = payload;
  reviveCachedDates(payload);
  reviveCachedDates(payload);
  expect(payload.date).toBe(date);
  expect(payload.createdAt).toBe(date);
  expect(payload.blob).toBe(blob);
  expect(payload.shared).toBe(payload.array[0]);
  expect(payload.shared.updatedAt).toBeInstanceOf(Date);
  expect(payload.self).toBe(payload);
});
