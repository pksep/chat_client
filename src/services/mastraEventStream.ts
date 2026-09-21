export type MastraStreamEvent = {
  type?: string;
  runId?: string;
  payload?: Record<string, any>;
};

export const AI_TOOL_RESULT_UNCONFIRMED =
  'Не удалось получить итоговый ответ. Перед повтором нужно проверить, какие действия уже выполнены.';

const asErrorText = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return asErrorText(record.message) || asErrorText(record.errorText);
};

/** Проверяет только оболочки результата, не принимая строки таблицы за ошибки выполнения. */
const resultFailure = (
  value: unknown,
  depth = 0
): Record<string, unknown> | null => {
  if (depth > 4 || !value || typeof value !== 'object' || Array.isArray(value))
    return null;
  const record = value as Record<string, unknown>;
  if (
    record.isError === true ||
    record.success === false ||
    (['error', 'failed', 'failure'].includes(String(record.status)) &&
      (record.error !== undefined || record.errorCode !== undefined))
  )
    return record;
  for (const key of [
    'result',
    'output',
    'structuredContent',
    'toolInvocation'
  ]) {
    const nested = resultFailure(record[key], depth + 1);
    if (nested) return nested;
  }
  // MCP может вернуть ту же структурированную ошибку JSON-текстом.
  if (Array.isArray(record.content)) {
    for (const part of record.content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue;
      try {
        const nested = resultFailure(JSON.parse(part.text), depth + 1);
        if (nested) return nested;
      } catch {
        /* Обычный текст результата не является ошибкой. */
      }
    }
  }
  return null;
};

/** Возвращает ошибку выполнения инструмента независимо от варианта события Mastra. */
export const getMastraToolError = (event: MastraStreamEvent): string | null => {
  const payload = event.payload || {};
  const invocation =
    payload.toolInvocation && typeof payload.toolInvocation === 'object'
      ? (payload.toolInvocation as Record<string, unknown>)
      : {};
  const resultError = ['tool-result', 'tool-output'].includes(event.type || '')
    ? resultFailure(payload)
    : null;
  const failed =
    event.type === 'tool-error' ||
    event.type === 'tool-call-error' ||
    payload.state === 'output-error' ||
    invocation.state === 'output-error' ||
    Boolean(resultError);

  if (!failed) return null;

  return (
    asErrorText(resultError) ||
    asErrorText(resultError?.error) ||
    asErrorText(payload.errorText) ||
    asErrorText(payload.error) ||
    asErrorText(invocation.errorText) ||
    asErrorText(invocation.error) ||
    asErrorText(payload.message) ||
    AI_TOOL_RESULT_UNCONFIRMED
  );
};

export const processMastraEventStream = async (
  response: Response,
  onEvent: (event: MastraStreamEvent) => void | false | Promise<void | false>,
  signal?: AbortSignal
): Promise<void> => {
  if (!response.body) throw new Error('Пустой поток ответа AI-сервера');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopped = false;
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation ??= reader.cancel().catch(() => undefined);
    return cancellation;
  };
  const onAbort = () => {
    void cancel();
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  const processBlock = async (block: string): Promise<void> => {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') return;

    let event: MastraStreamEvent;
    try {
      event = JSON.parse(data) as MastraStreamEvent;
    } catch (error) {
      throw new Error(
        'Не удалось прочитать часть ответа ИИ. Перед повторным действием нужно проверить, что уже выполнено.'
      );
    }
    signal?.throwIfAborted();
    stopped = (await onEvent(event)) === false;
  };

  let streamEnded = false;
  try {
    signal?.throwIfAborted();
    while (!streamEnded && !stopped) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      streamEnded = done;
      buffer += decoder.decode(value, { stream: !streamEnded });

      let separator = /\r?\n\r?\n/.exec(buffer);
      while (separator && !stopped) {
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        await processBlock(block);
        separator = /\r?\n\r?\n/.exec(buffer);
      }
    }

    if (!stopped && buffer.trim()) await processBlock(buffer);
  } finally {
    // Терминальная ошибка закрывает чтение: поздние события не меняют уже
    // завершённое сообщение и не конкурируют со следующим запросом.
    signal?.removeEventListener('abort', onAbort);
    if (!streamEnded) await cancel();
    reader.releaseLock();
  }
};
