export type MastraStreamEvent = {
  type?: string;
  runId?: string;
  payload?: Record<string, any>;
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
