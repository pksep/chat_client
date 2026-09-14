export interface QueuedGroupCallInvite {
  key: string;
  url: string;
}

const MAX_REMEMBERED_INVITES = 8;
const DUPLICATE_INVITE_WINDOW_MS = 30_000;

export const createGroupCallInviteQueue = (options?: {
  duplicateWindowMs?: number;
  now?: () => number;
}) => {
  const duplicateWindowMs =
    options?.duplicateWindowMs ?? DUPLICATE_INVITE_WINDOW_MS;
  const now = options?.now ?? Date.now;
  let pendingInvite: QueuedGroupCallInvite | null = null;
  let activeInviteKey: string | null = null;
  let flushPromise: Promise<boolean> | null = null;
  const consumedInviteKeys = new Map<string, number>();

  const forgetExpiredInvites = (now: number): void => {
    consumedInviteKeys.forEach((consumedAt, key) => {
      if (now - consumedAt >= duplicateWindowMs) {
        consumedInviteKeys.delete(key);
      }
    });
  };

  const rememberConsumedInvite = (key: string): void => {
    consumedInviteKeys.set(key, now());

    while (consumedInviteKeys.size > MAX_REMEMBERED_INVITES) {
      const oldestKey = consumedInviteKeys.keys().next().value;

      if (typeof oldestKey !== 'string') {
        break;
      }

      consumedInviteKeys.delete(oldestKey);
    }
  };

  const enqueue = (invite: QueuedGroupCallInvite): boolean => {
    forgetExpiredInvites(now());

    if (
      consumedInviteKeys.has(invite.key) ||
      activeInviteKey === invite.key ||
      pendingInvite?.key === invite.key
    ) {
      return false;
    }

    // If Android delivers two different links before the app is ready, the
    // latest user action is the one that should be opened.
    pendingInvite = invite;
    return true;
  };

  const flush = (
    isReady: () => boolean,
    consume: (url: string) => Promise<boolean>
  ): Promise<boolean> => {
    if (flushPromise) {
      return flushPromise;
    }

    if (!pendingInvite || !isReady()) {
      return Promise.resolve(false);
    }

    flushPromise = (async () => {
      let result = false;

      while (pendingInvite && isReady()) {
        const invite = pendingInvite;
        pendingInvite = null;
        activeInviteKey = invite.key;
        rememberConsumedInvite(invite.key);

        try {
          result = await consume(invite.url);
        } finally {
          activeInviteKey = null;
        }
      }

      return result;
    })().finally(() => {
      flushPromise = null;
    });

    return flushPromise;
  };

  return { enqueue, flush };
};
