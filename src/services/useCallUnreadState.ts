import { ref } from 'vue';

const callsSeenAt = ref(Date.now());
let activeStorageKey = '';

const getCallsSeenStorageKey = (userId?: string): string =>
  userId ? `sep:chat:missed-calls-seen-at:${userId}` : '';

const persistCallsSeenAt = (): void => {
  if (!activeStorageKey || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(activeStorageKey, String(callsSeenAt.value));
  } catch {
    // The shared in-memory value still keeps every mounted menu in sync.
  }
};

export const initializeCallsSeenState = (userId?: string): void => {
  const nextStorageKey = getCallsSeenStorageKey(userId);
  if (nextStorageKey === activeStorageKey) return;

  activeStorageKey = nextStorageKey;
  const now = Date.now();

  if (!activeStorageKey || typeof window === 'undefined') {
    callsSeenAt.value = now;
    return;
  }

  try {
    const storedTimestamp = Number(
      window.localStorage.getItem(activeStorageKey)
    );
    if (Number.isFinite(storedTimestamp) && storedTimestamp > 0) {
      callsSeenAt.value = storedTimestamp;
      return;
    }
  } catch {
    callsSeenAt.value = now;
    return;
  }

  callsSeenAt.value = now;
  persistCallsSeenAt();
};

export const markCallsSeen = (
  timestamp = Date.now(),
  userId?: string
): void => {
  if (userId !== undefined) initializeCallsSeenState(userId);

  const normalizedTimestamp = Number.isFinite(timestamp)
    ? timestamp
    : Date.now();
  callsSeenAt.value = Math.max(callsSeenAt.value, normalizedTimestamp);
  persistCallsSeenAt();
};

export const useCallUnreadState = () => ({
  callsSeenAt,
  initializeCallsSeenState,
  markCallsSeen
});
