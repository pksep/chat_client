export const MAX_PTS_REPLAY_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PTS_REPLAY_EVENTS = 1000;
const MAX_PTS_REPLAY_DURATION_MS = 3000;

export const isPtsReplayStale = (
  timestamp: string | undefined,
  now = Date.now()
): boolean => {
  const savedAt = Date.parse(timestamp || '');
  return (
    !Number.isFinite(savedAt) ||
    savedAt > now + 60_000 ||
    now - savedAt >= MAX_PTS_REPLAY_AGE_MS
  );
};

export const createPtsReplayBudget = () => {
  let startedAt = 0;
  let events = 0;
  return {
    reset(now = Date.now()) {
      startedAt = now;
      events = 0;
    },
    needsSnapshot(eventCount: number, hasMore: boolean, now = Date.now()) {
      if (!startedAt) startedAt = now;
      events += eventCount;
      return (
        hasMore &&
        (events >= MAX_PTS_REPLAY_EVENTS ||
          now - startedAt >= MAX_PTS_REPLAY_DURATION_MS)
      );
    }
  };
};
