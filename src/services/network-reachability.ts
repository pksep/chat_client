type NetworkReachabilityOptions = {
  isEnabled: () => boolean;
  probe: (signal: AbortSignal) => Promise<boolean>;
  onResult: (reachable: boolean) => void;
  timeoutMs: number;
};

export const createNetworkReachabilityCheck = (
  options: NetworkReachabilityOptions
) => {
  let pendingController: AbortController | null = null;

  const invalidate = (): void => {
    const controller = pendingController;
    pendingController = null;
    controller?.abort();
  };

  const check = async (): Promise<void> => {
    if (pendingController || !options.isEnabled()) return;

    const controller = new AbortController();
    pendingController = controller;
    const cancelled = new Promise<boolean>(resolve => {
      controller.signal.addEventListener('abort', () => resolve(false), {
        once: true
      });
    });
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const reachable = await Promise.race([
        Promise.resolve()
          .then(() => options.probe(controller.signal))
          .catch(() => false),
        cancelled
      ]);

      if (pendingController === controller && options.isEnabled()) {
        options.onResult(reachable);
      }
    } finally {
      clearTimeout(timeout);
      if (pendingController === controller) pendingController = null;
    }
  };

  return { check, invalidate };
};
