import { speechFetch } from './aiSpeech';

export interface StreamingRecognition {
  result: Promise<string>;
  append: (audio: ArrayBuffer) => void;
  finish: () => void;
  cancel: () => void;
}

/** Передаёт звук во время речи. Частичный текст никогда не становится командой. */
export function startStreamingRecognition(
  partial: (text: string) => void = (): void => {},
  request: typeof speechFetch = speechFetch
): StreamingRecognition {
  const controller = new AbortController();
  const chunks: ArrayBuffer[] = [];
  let buffered = 0;
  let id = '';
  let sequence = 0;
  let ending = false;
  let uploading = false;
  let settled = false;
  let resolveResult: (text: string) => void = (): void => {};
  let rejectResult: (error: unknown) => void = (): void => {};
  const result = new Promise<string>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const timer = setTimeout(
    () => fail(new Error('Распознавание прервалось. Повторите реплику.')),
    40_000
  );

  const fail = (error: unknown): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    chunks.length = 0;
    controller.abort();
    rejectResult(error);
  };

  const upload = async (): Promise<void> => {
    if (uploading || !id || settled) return;
    uploading = true;

    try {
      while (!settled && (buffered >= 8_192 || ending)) {
        const batch: ArrayBuffer[] = [];
        let bytes = 0;
        while (chunks.length && bytes + chunks[0].byteLength <= 32_000) {
          const chunk = chunks.shift();
          if (!chunk) break;
          batch.push(chunk);
          bytes += chunk.byteLength;
        }
        const audio = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of batch) {
          audio.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }
        const finish = ending && !chunks.length;
        await request(
          `/speech/stream/${id}?sequence=${sequence}&finish=${finish}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: audio.buffer,
            signal: controller.signal
          }
        );
        buffered -= bytes;
        sequence++;
        if (finish) break;
      }
    } catch (error) {
      fail(error);
    } finally {
      uploading = false;
    }
  };

  const receive = async (): Promise<void> => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await request('/speech/stream', {
        method: 'POST',
        signal: controller.signal
      });
      reader = response.body?.getReader();
      if (!reader) throw new Error('Голосовой сервис не начал распознавание.');
      const decoder = new TextDecoder();
      let buffer = '';

      while (!settled) {
        const next = await reader.read();
        if (next.done) break;
        buffer += decoder.decode(next.value, { stream: true });
        if (buffer.length > 65_536)
          throw new Error('Некорректный ответ распознавания.');
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0 && !settled) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim())
            .join('\n');
          if (data) {
            const event: unknown = JSON.parse(data);
            if (!event || typeof event !== 'object' || !('type' in event))
              throw new Error('Некорректный ответ распознавания.');
            if (
              event.type === 'ready' &&
              'id' in event &&
              typeof event.id === 'string' &&
              /^[0-9a-f-]{36}$/i.test(event.id) &&
              !id
            ) {
              id = event.id;
              void upload();
            } else if (
              event.type === 'partial' &&
              'text' in event &&
              typeof event.text === 'string'
            ) {
              partial(event.text);
            } else if (
              event.type === 'final' &&
              'text' in event &&
              typeof event.text === 'string' &&
              ending
            ) {
              settled = true;
              clearTimeout(timer);
              resolveResult(event.text.trim());
            } else if (
              event.type === 'error' ||
              event.type === 'recognition-error'
            ) {
              throw new Error(
                'message' in event && typeof event.message === 'string'
                  ? event.message
                  : 'Распознавание прервалось.'
              );
            } else {
              throw new Error('Неполная голосовая реплика. Повторите её.');
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
      if (!settled)
        throw new Error('Распознавание прервалось. Повторите реплику.');
    } catch (error) {
      fail(error);
    } finally {
      await reader?.cancel().catch(() => undefined);
      reader?.releaseLock();
    }
  };

  void receive();

  return {
    result,
    append: (audio): void => {
      if (settled || ending) return;
      if (
        audio.byteLength > 32_000 ||
        audio.byteLength % 2 ||
        buffered + audio.byteLength > 64_000
      ) {
        fail(
          new Error(
            'Связь не успевает передать голос. Повторите реплику после восстановления сети.'
          )
        );
        return;
      }
      chunks.push(audio);
      buffered += audio.byteLength;
      void upload();
    },
    finish: (): void => {
      if (settled || ending) return;
      ending = true;
      void upload();
    },
    cancel: (): void =>
      fail(new DOMException('Распознавание отменено.', 'AbortError'))
  };
}
