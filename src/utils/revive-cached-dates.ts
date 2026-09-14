const DATE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'deletedAt',
  'lastOnline'
]);

// Только для собственных результатов IndexedDB/JSON.parse: они уже отделены
// от живого состояния. Меняем даты без повторного копирования всех полей.
export const reviveCachedDates = (
  value: unknown,
  dateKeys: ReadonlySet<string> = DATE_KEYS
): unknown => {
  const visited = new WeakSet<object>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== 'object' || visited.has(item)) return;
    visited.add(item);
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
      return;
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) return;
    const record = item as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const child = record[key];
      if (typeof child === 'string' && dateKeys.has(key)) {
        record[key] = new Date(child);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return value;
};
