/** События resume/reconnect разделяют один цикл; новый разрыв требует повторения. */
export function createReconnectRefreshCoordinator<Reason>(options: {
  run: (reason: Reason) => Promise<void>;
  shouldContinue: () => boolean;
  onError: (error: unknown, reason: Reason) => void;
}) {
  let revision = 0;
  let pending: { reason: Reason; revision: number } | null = null;
  let running: Promise<void> | null = null;
  const getPending = () => pending;

  const drain = async () => {
    try {
      while (pending && options.shouldContinue()) {
        const current = pending;
        pending = null;
        try {
          await options.run(current.reason);
          // Повторные сигналы того же восстановления уже покрыты этим циклом.
          if (getPending()?.revision === current.revision) pending = null;
        } catch (error) {
          options.onError(error, current.reason);
        }
      }
      pending = null;
    } finally {
      running = null;
    }
  };

  return {
    invalidate() {
      revision++;
    },
    request(reason: Reason): Promise<void> {
      pending = { reason, revision };
      running ??= Promise.resolve().then(drain);
      return running;
    }
  };
}
