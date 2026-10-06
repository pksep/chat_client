export const CHAT_CONTENT_REQUEST_TIMEOUT_MS = 4000;

export const withNetworkTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = CHAT_CONTENT_REQUEST_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new DOMException('Сервер не ответил вовремя', 'TimeoutError'));
      controller.abort();
    }, timeoutMs);
  });

  try {
    // Ограничиваем также чтение тела и ожидание нативного моста.
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
};
