export const OUTGOING_ACK_WAIT_MS = 15_000;

export const createOutgoingSendGate = () => {
  const attempts = new Map<
    string,
    {
      until: number;
      request?: Promise<boolean>;
    }
  >();
  const prune = (now: number) => {
    attempts.forEach((attempt, key) => {
      if (!attempt.request && attempt.until <= now) attempts.delete(key);
    });
  };
  return {
    delay(key: string, now = Date.now()): number {
      prune(now);
      const attempt = attempts.get(key);
      return attempt?.request
        ? OUTGOING_ACK_WAIT_MS
        : Math.max(0, (attempt?.until || 0) - now);
    },
    async send(key: string, send: () => Promise<boolean>): Promise<boolean> {
      prune(Date.now());
      const previous = attempts.get(key);
      if (previous?.request) return previous.request;
      if (previous && previous.until > Date.now()) return true;

      const attempt = {
        until: 0,
        request: undefined as Promise<boolean> | undefined
      };
      attempts.set(key, attempt);
      attempt.request = Promise.resolve()
        .then(send)
        .then(
          sent => {
            if (sent) attempt.until = Date.now() + OUTGOING_ACK_WAIT_MS;
            else attempts.delete(key);
            return sent;
          },
          error => {
            attempts.delete(key);
            throw error;
          }
        )
        .finally(() => {
          attempt.request = undefined;
        });
      return attempt.request;
    }
  };
};

export const outgoingSendGate = createOutgoingSendGate();
export const outgoingSendKey = (
  userId: string,
  topicId: string,
  clientId: string
) => JSON.stringify([userId, topicId, clientId]);
