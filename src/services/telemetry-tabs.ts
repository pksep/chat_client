export const TELEMETRY_TAB_KEY_PREFIX = 'chat.telemetry.tab.v1.';
export const TELEMETRY_TAB_HEARTBEAT_MS = 15_000;
export const TELEMETRY_TAB_STALE_MS = 90_000;
const TAB_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTED_TABS = 20;

type TabState = {
  userId: string | null;
  visibility: string;
  hasFocus: boolean;
  callRoomId: string | null;
  callState: 'none' | 'incoming' | 'dialing' | 'active';
};

type StoredTab = TabState & {
  pageInstanceId: string;
  lastSeenAt: number;
};

export const createTelemetryTabs = (options: {
  pageInstanceId: string;
  getStorage: () => Storage | null;
  getState: () => TabState;
  now?: () => number;
}) => {
  const now = options.now ?? Date.now;
  const ownKey = `${TELEMETRY_TAB_KEY_PREFIX}${options.pageInstanceId}`;
  let lastWrittenSignature = '';
  let lastWrittenAt = 0;
  let suspended = false;

  const remove = () => {
    lastWrittenSignature = '';
    try {
      options.getStorage()?.removeItem(ownKey);
    } catch {
      // Отказ хранилища не должен влиять на работу чата.
    }
  };

  return {
    suspend() {
      suspended = true;
      remove();
    },
    resume() {
      suspended = false;
    },
    snapshot() {
      const base = {
        scope: 'same-origin-user-browser-profile',
        countQuality: 'recent-heartbeats',
        heartbeatIntervalMs: TELEMETRY_TAB_HEARTBEAT_MS,
        staleAfterMs: TELEMETRY_TAB_STALE_MS
      };
      try {
        const state = options.getState();
        const storage = options.getStorage();
        if (!state.userId || suspended || !storage) {
          if (!state.userId) remove();
          return {
            ...base,
            status: suspended
              ? ('suspended' as const)
              : !state.userId
                ? ('unauthenticated' as const)
                : ('storage-unavailable' as const),
            openTabCount: null
          };
        }

        const currentTime = now();
        const signature = JSON.stringify(state);
        if (
          signature !== lastWrittenSignature ||
          currentTime - lastWrittenAt >= TELEMETRY_TAB_HEARTBEAT_MS
        ) {
          // У каждой страницы свой ключ: вкладки не перезаписывают общий список.
          storage.setItem(
            ownKey,
            JSON.stringify({
              ...state,
              pageInstanceId: options.pageInstanceId,
              lastSeenAt: currentTime
            } satisfies StoredTab)
          );
          lastWrittenSignature = signature;
          lastWrittenAt = currentTime;
        }

        const tabs: StoredTab[] = [];
        const expiredKeys: string[] = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(TELEMETRY_TAB_KEY_PREFIX)) continue;
          let tab: StoredTab;
          try {
            tab = JSON.parse(storage.getItem(key) || 'null');
          } catch {
            continue;
          }
          if (
            !tab ||
            key !== `${TELEMETRY_TAB_KEY_PREFIX}${tab.pageInstanceId}` ||
            !Number.isFinite(tab.lastSeenAt)
          ) {
            continue;
          }
          if (currentTime - tab.lastSeenAt > TAB_RETENTION_MS) {
            expiredKeys.push(key);
          } else if (tab.userId === state.userId) {
            tabs.push(tab);
          }
        }
        expiredKeys.forEach(key => storage.removeItem(key));

        const isRecent = (tab: StoredTab) =>
          Math.abs(currentTime - tab.lastSeenAt) <= TELEMETRY_TAB_STALE_MS;
        const recentTabs = tabs.filter(isRecent);
        const reportedTabs = tabs
          .sort((a, b) => {
            if (a.pageInstanceId === options.pageInstanceId) return -1;
            if (b.pageInstanceId === options.pageInstanceId) return 1;
            return b.lastSeenAt - a.lastSeenAt;
          })
          .slice(0, MAX_REPORTED_TABS)
          .map(tab => ({
            pageInstanceId: tab.pageInstanceId,
            visibility: tab.visibility,
            hasFocus: tab.hasFocus,
            callRoomId: tab.callRoomId,
            callState: tab.callState,
            lastSeenAt: new Date(tab.lastSeenAt).toISOString(),
            heartbeatAgeMs: Math.max(0, currentTime - tab.lastSeenAt),
            presence: isRecent(tab) ? 'recent' : 'stale'
          }));

        return {
          ...base,
          status: 'available' as const,
          openTabCount: recentTabs.length,
          staleTabCount: tabs.length - recentTabs.length,
          visibleTabCount: recentTabs.filter(
            tab => tab.visibility === 'visible'
          ).length,
          tabsWithCallCount: recentTabs.filter(
            tab => tab.callRoomId && tab.callState !== 'none'
          ).length,
          omittedTabCount: tabs.length - reportedTabs.length,
          tabs: reportedTabs
        };
      } catch {
        return {
          ...base,
          status: 'storage-unavailable' as const,
          openTabCount: null
        };
      }
    }
  };
};
