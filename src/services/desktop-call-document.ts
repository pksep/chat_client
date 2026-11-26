import type { CallRenderWindow } from '../components/Desktop/call-window-context';

export async function waitForDesktopCallDocument(
  host: CallRenderWindow,
  signal: AbortSignal,
  timeoutMs = 5000
): Promise<Document> {
  const deadline = performance.now() + timeoutMs;
  while (!signal.aborted && !host.closed && performance.now() < deadline) {
    try {
      const doc = host.document;
      // WKWebView сначала возвращает временный about:blank. Его DOM будет заменён
      // при завершении window.open, поэтому нельзя монтировать Vue сразу в body.
      if (
        doc.body &&
        doc.readyState === 'complete' &&
        (doc.URL === 'about:blank#sep-chat-call' ||
          doc.URL === 'about:blank%23sep-chat-call')
      )
        return doc;
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('name' in error) ||
        error.name !== 'SecurityError'
      )
        throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  if (signal.aborted) throw new DOMException('Открытие отменено', 'AbortError');
  throw new Error(
    host.closed ? 'Окно звонка закрыто' : 'Окно звонка не подготовилось'
  );
}
