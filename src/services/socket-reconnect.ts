type ReconnectSocket = {
  connected: boolean;
  active: boolean;
  connect: () => unknown;
};

export const createSocketReconnectScheduler = (options: {
  getSocket: () => ReconnectSocket | null;
  isEnabled: () => boolean;
  onAttempt: (reason: string, attempt: number) => void;
  initialDelayMs?: number;
  maxDelayMs?: number;
}) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  return {
    schedule(reason: string): void {
      const socket = options.getSocket();
      if (
        timer ||
        !options.isEnabled() ||
        !socket ||
        socket.connected ||
        socket.active
      )
        return;

      const delay = Math.min(
        (options.initialDelayMs ?? 1000) * 2 ** Math.min(attempt, 10),
        options.maxDelayMs ?? 10000
      );
      attempt++;
      timer = setTimeout(() => {
        timer = null;
        if (
          !options.isEnabled() ||
          options.getSocket() !== socket ||
          socket.connected ||
          socket.active
        )
          return;

        options.onAttempt(reason, attempt);
        socket.connect();
      }, delay);
    },
    reset(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      attempt = 0;
    }
  };
};
