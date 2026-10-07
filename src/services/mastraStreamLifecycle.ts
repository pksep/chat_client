export const AI_STREAM_TIMEOUT_MS = 180_000;

export type MastraStreamLifecycle = {
  controller: AbortController;
  startTimeout: () => void;
  dispose: () => void;
};

/** Объединяет таймаут и отмену вызывающей стороны в одном контроллере AI-запроса. */
export const createMastraStreamLifecycle = (
  externalSignal?: AbortSignal,
  timeoutMs = AI_STREAM_TIMEOUT_MS
): MastraStreamLifecycle => {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) forwardAbort();
  else externalSignal?.addEventListener('abort', forwardAbort, { once: true });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return {
    controller,
    startTimeout: () => {
      if (timeoutId !== undefined || controller.signal.aborted) return;
      timeoutId = setTimeout(() => {
        const error = new Error('ИИ не успел ответить за отведённое время.');
        error.name = 'TimeoutError';
        controller.abort(error);
      }, timeoutMs);
    },
    dispose: () => {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      externalSignal?.removeEventListener('abort', forwardAbort);
    }
  };
};
