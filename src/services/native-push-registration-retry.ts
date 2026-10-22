export type NativePushProvider = 'firebase' | 'rustore';
type Registration = {
  token: string;
  attempts: number;
  running?: Promise<void>;
};

export const createNativePushRegistrationRetry = (options: {
  enabled: () => boolean;
  register: (provider: NativePushProvider, token: string) => Promise<boolean>;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
}) => {
  const schedule = options.schedule || setTimeout;
  const cancel =
    options.cancel ||
    ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const pending = new Map<NativePushProvider, Registration>();
  const synced = new Map<NativePushProvider, string>();
  let timer: unknown;
  const cancelTimer = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const scheduleRetry = () => {
    if (timer !== undefined || !pending.size || !options.enabled()) return;
    const attempts = Math.min(...[...pending.values()].map(e => e.attempts));
    timer = schedule(
      () => {
        timer = undefined;
        void retryNow();
      },
      Math.min(60_000, 2000 * 2 ** Math.min(Math.max(0, attempts - 1), 5))
    );
  };
  const run = (
    provider: NativePushProvider,
    entry: Registration
  ): Promise<void> => {
    if (!options.enabled()) return Promise.resolve();
    if (entry.running) return entry.running;
    entry.running = Promise.resolve()
      .then(() =>
        pending.get(provider) === entry && options.enabled()
          ? options.register(provider, entry.token)
          : false
      )
      .catch(() => false)
      .then(success => {
        if (pending.get(provider) !== entry || !options.enabled()) return;
        if (success) {
          synced.set(provider, entry.token);
          pending.delete(provider);
        } else entry.attempts++;
      })
      .finally(() => {
        entry.running = undefined;
        if (!pending.size) cancelTimer();
        else scheduleRetry();
      });
    return entry.running;
  };
  const retryNow = async () => {
    cancelTimer();
    await Promise.all(
      [...pending].map(([provider, entry]) => run(provider, entry))
    );
  };
  return {
    async register(provider: NativePushProvider, token: string) {
      if (!options.enabled() || !token || synced.get(provider) === token)
        return;
      let entry = pending.get(provider);
      if (!entry || entry.token !== token) {
        entry = { token, attempts: 0 };
        pending.set(provider, entry);
      }
      await run(provider, entry);
    },
    retryNow,
    clear() {
      cancelTimer();
      pending.clear();
      synced.clear();
    }
  };
};
