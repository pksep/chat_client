export type MastraStreamEvent = {
  type?: string;
  runId?: string;
  payload?: Record<string, any>;
};

const asErrorText = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return asErrorText(record.message) || asErrorText(record.errorText);
};

/** Возвращает ошибку выполнения инструмента независимо от варианта события Mastra. */
export const getMastraToolError = (event: MastraStreamEvent): string | null => {
  const payload = event.payload || {};
  const invocation =
    payload.toolInvocation && typeof payload.toolInvocation === 'object'
      ? (payload.toolInvocation as Record<string, unknown>)
      : {};
  const failed =
    event.type === 'tool-error' ||
    event.type === 'tool-call-error' ||
    payload.state === 'output-error' ||
    invocation.state === 'output-error';

  if (!failed) return null;

  return (
    asErrorText(payload.errorText) ||
    asErrorText(payload.error) ||
    asErrorText(invocation.errorText) ||
    asErrorText(invocation.error) ||
    asErrorText(payload.message) ||
    'Не удалось выполнить действие.'
  );
};

export const processMastraEventStream = async (
  response: Response,
  onEvent: (event: MastraStreamEvent) => void | Promise<void>
): Promise<void> => {
  if (!response.body) throw new Error('Пустой поток ответа AI-сервера');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = async (block: string): Promise<void> => {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') return;

    try {
      await onEvent(JSON.parse(data) as MastraStreamEvent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error('Не удалось разобрать событие AI-сервера');
        return;
      }
      throw error;
    }
  };

  let streamEnded = false;
  while (!streamEnded) {
    const { done, value } = await reader.read();
    streamEnded = done;
    buffer += decoder.decode(value, { stream: !streamEnded });

    let separator = /\r?\n\r?\n/.exec(buffer);
    while (separator) {
      const block = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      await processBlock(block);
      separator = /\r?\n\r?\n/.exec(buffer);
    }
  }

  if (buffer.trim()) await processBlock(buffer);
};
