import { describe, expect, test } from 'bun:test';
import { createMastraStreamLifecycle } from '../src/services/mastraStreamLifecycle';
import { processMastraEventStream } from '../src/services/mastraEventStream';

const createPendingStream = () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel: () => {
        cancelled = true;
      }
    })
  );

  return {
    response,
    wasCancelled: () => cancelled
  };
};

describe('Mastra stream lifecycle', () => {
  test('отменяет зависший stream по таймауту', async () => {
    const lifecycle = createMastraStreamLifecycle(undefined, 10);
    const stream = createPendingStream();
    lifecycle.startTimeout();

    try {
      await expect(
        processMastraEventStream(
          stream.response,
          () => undefined,
          lifecycle.controller.signal
        )
      ).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(stream.wasCancelled()).toBe(true);
    } finally {
      lifecycle.dispose();
    }
  });

  test('передаёт пользовательскую отмену в тот же stream controller', async () => {
    const externalController = new AbortController();
    const lifecycle = createMastraStreamLifecycle(
      externalController.signal,
      10_000
    );
    const stream = createPendingStream();
    const processing = processMastraEventStream(
      stream.response,
      () => undefined,
      lifecycle.controller.signal
    );
    const reason = new DOMException('Отменено пользователем', 'AbortError');
    lifecycle.startTimeout();

    externalController.abort(reason);

    try {
      await expect(processing).rejects.toBe(reason);
      expect(lifecycle.controller.signal.reason).toBe(reason);
      expect(stream.wasCancelled()).toBe(true);
    } finally {
      lifecycle.dispose();
    }
  });

  test('очищает таймаут после завершения stream', async () => {
    const lifecycle = createMastraStreamLifecycle(undefined, 10);
    const response = new Response('data: {"type":"finish"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' }
    });
    lifecycle.startTimeout();

    try {
      await processMastraEventStream(
        response,
        () => false,
        lifecycle.controller.signal
      );
    } finally {
      lifecycle.dispose();
    }

    await new Promise(resolve => setTimeout(resolve, 25));

    expect(lifecycle.controller.signal.aborted).toBe(false);
  });
});
