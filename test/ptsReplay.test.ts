import { expect, test } from 'bun:test';
import {
  createPtsReplayBudget,
  isPtsReplayStale,
  MAX_PTS_REPLAY_AGE_MS
} from '../src/utils/pts-replay';

test('старый, отсутствующий или некорректный курсор требует свежего снимка', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  expect(isPtsReplayStale('2026-09-21T12:00:00Z', now)).toBe(true);
  expect(isPtsReplayStale(undefined, now)).toBe(true);
  expect(isPtsReplayStale('не дата', now)).toBe(true);
  expect(isPtsReplayStale(new Date(now + 120_000).toISOString(), now)).toBe(
    true
  );
  expect(
    isPtsReplayStale(new Date(now - MAX_PTS_REPLAY_AGE_MS).toISOString(), now)
  ).toBe(true);
  expect(isPtsReplayStale(new Date(now - 60_000).toISOString(), now)).toBe(
    false
  );
});

test('небольшой replay проходит все страницы, большой ограничен общим бюджетом', () => {
  const budget = createPtsReplayBudget();
  budget.reset(10_000);
  for (let page = 0; page < 4; page++)
    expect(budget.needsSnapshot(200, true, 10_100 + page)).toBe(false);
  expect(budget.needsSnapshot(200, true, 10_200)).toBe(true);
  budget.reset(20_000);
  expect(budget.needsSnapshot(200, true, 20_100)).toBe(false);
  expect(budget.needsSnapshot(1, false, 20_200)).toBe(false);
});

test('медленный догон переключается на снимок, завершённый replay не перезапускается', () => {
  const budget = createPtsReplayBudget();
  budget.reset(10_000);
  expect(budget.needsSnapshot(200, true, 13_000)).toBe(true);
  budget.reset(20_000);
  expect(budget.needsSnapshot(200, false, 25_000)).toBe(false);
});
