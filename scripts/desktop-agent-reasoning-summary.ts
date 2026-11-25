interface PublishedSummary {
  id: string;
  text: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// События thinking_delta в Pi объединяют два разных потока. В интерфейс
// передаём только summary_text, который провайдер публикует для пользователя.
export function createReasoningSummaryReporter(
  publish: (summary: PublishedSummary) => void
): { receiveEvent: (event: unknown) => void; summaries: () => string[] } {
  const parts = new Map<
    string,
    { text: string; sent: string; sentAt: number }
  >();

  function receive(
    itemId: unknown,
    index: unknown,
    value: unknown,
    delta = false
  ): void {
    if (
      typeof itemId !== 'string' ||
      typeof index !== 'number' ||
      typeof value !== 'string'
    )
      return;
    const id = `${itemId}:${index}`;
    const part = parts.get(id) ?? { text: '', sent: '', sentAt: 0 };
    part.text = delta ? part.text + value : value;
    parts.set(id, part);

    const now = Date.now();
    if (part.text === part.sent || (delta && now - part.sentAt < 200)) return;

    part.sent = part.text;
    part.sentAt = now;
    publish({ id, text: part.text });
  }

  function receiveItem(item: unknown): void {
    if (
      !record(item) ||
      item.type !== 'reasoning' ||
      !Array.isArray(item.summary)
    )
      return;
    item.summary.forEach((part: unknown, index: number): void => {
      if (record(part) && part.type === 'summary_text')
        receive(item.id, index, part.text);
    });
  }

  function receiveEvent(event: unknown): void {
    if (!record(event)) return;
    switch (event.type) {
      case 'response.reasoning_summary_text.delta':
        receive(event.item_id, event.summary_index, event.delta, true);
        break;
      case 'response.reasoning_summary_text.done':
        receive(event.item_id, event.summary_index, event.text);
        break;
      case 'response.reasoning_summary_part.done':
        if (record(event.part) && event.part.type === 'summary_text') {
          receive(event.item_id, event.summary_index, event.part.text);
        }
        break;
      case 'response.output_item.done':
        receiveItem(event.item);
        break;
      case 'response.completed':
        if (record(event.response) && Array.isArray(event.response.output)) {
          event.response.output.forEach(receiveItem);
        }
        break;
    }
  }

  function summaries(): string[] {
    return Array.from(parts.values(), part => part.text.trim()).filter(Boolean);
  }

  return { receiveEvent, summaries };
}
