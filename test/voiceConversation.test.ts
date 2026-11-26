import { describe, expect, mock, test } from 'bun:test';
import {
  VoiceActivity,
  type VoiceActivityCallbacks
} from '../src/services/voiceActivity';
import type { VoiceReplyOptions } from '../src/services/voiceReply';
import {
  isVoiceFarewell,
  VOICE_FAREWELL_REPLY
} from '../src/services/voice-farewell';
import {
  VoiceActionFeedback,
  actionTaskVoiceReply
} from '../src/services/aiActionTaskPresentation';
import type { AiActionTask } from '../src/services/aiActionTaskContract';

mock.module('../src/composables/useChatAccess', () => ({
  fetchWithAiAccess: fetch
}));
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: (): string => 'test-token'
}));
mock.module('../src/services/useConfig', () => ({
  getConfig: (): { CHAT_MASTRA_URL: string } => ({
    CHAT_MASTRA_URL: 'https://test.invalid'
  })
}));

const { startStreamingRecognition } = await import(
  '../src/services/voiceRecognition'
);
const { VoiceSpeechQueue } = await import('../src/services/voiceSpeechQueue');
const { VoiceConversation } = await import('../src/services/voiceConversation');

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve: (value: T) => void = (): void => {};
  let reject: (error: unknown) => void = (): void => {};
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });

  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let count = 0; count < 100; count++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Condition not reached');
}

describe('voice activity', (): void => {
  test('ignores clicks, preserves the start of words and ends after 650 ms of silence', (): void => {
    const start = mock((): void => {});
    const audio = mock((_chunk: ArrayBuffer): void => {});
    const end = mock((): void => {});
    const activity = new VoiceActivity({
      start,
      audio,
      end,
      overflow: (): void => {}
    });
    const chunk = new ArrayBuffer(2048); // 64 ms at 16 kHz mono PCM.
    activity.push(chunk, 0.1);
    activity.push(chunk, 0);
    expect(start).not.toHaveBeenCalled();
    activity.push(chunk, 0.1);
    activity.push(chunk, 0.1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(audio).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 11; index++) activity.push(chunk, 0);
    expect(end).toHaveBeenCalledTimes(1);
  });

  test('rejects long utterances instead of executing a truncated command', (): void => {
    const end = mock((): void => {});
    const overflow = mock((): void => {});
    const activity = new VoiceActivity({
      start: (): void => {},
      audio: (): void => {},
      end,
      overflow
    });
    for (let index = 0; index < 800; index++)
      activity.push(new ArrayBuffer(2048), 0.1);
    expect(overflow).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();
  });
});

describe('streaming recognition transport', (): void => {
  test('rejects a recognition-error without turning a partial into a command', async (): Promise<void> => {
    const recognition = startStreamingRecognition(
      undefined,
      async (): Promise<Response> =>
        new Response(
          'data: {"type":"partial","text":"Создай задачу"}\n\n' +
            'data: {"type":"recognition-error","message":"Сервис недоступен"}\n\n'
        )
    );

    await expect(recognition.result).rejects.toThrow('Сервис недоступен');
  });

  test('uploads before finishing, keeps sequence and does not submit partials', async (): Promise<void> => {
    let events: ReadableStreamDefaultController<Uint8Array> | undefined;
    const uploads: string[] = [];
    const emit = (event: object): void =>
      events?.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
      );
    const partial = mock((_text: string): void => {});
    const recognition = startStreamingRecognition(
      partial,
      async (path, init): Promise<Response> => {
        if (path === '/speech/stream')
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                events = controller;
                emit({
                  type: 'ready',
                  id: '00000000-0000-4000-8000-000000000000'
                });
              }
            })
          );
        expect(init.signal?.aborted).toBe(false);
        uploads.push(path);
        if (path.endsWith('finish=true')) {
          emit({ type: 'final', text: 'Найди задачу.' });
          events?.close();
        } else emit({ type: 'partial', text: 'Найди' });
        return Response.json({ accepted: true });
      }
    );
    let finished = false;
    void recognition.result.then((): void => {
      finished = true;
    });
    recognition.append(new ArrayBuffer(8_192));
    await waitFor(() => partial.mock.calls.length === 1);
    expect(finished).toBe(false);
    expect(uploads[0]).toEndWith('sequence=0&finish=false');
    recognition.finish();
    await expect(recognition.result).resolves.toBe('Найди задачу.');
    expect(uploads[1]).toEndWith('sequence=1&finish=true');
  });

  test('rejects EOF without final and never retries failed uploads', async (): Promise<void> => {
    let uploads = 0;
    const recognition = startStreamingRecognition(
      undefined,
      async (path): Promise<Response> => {
        if (path === '/speech/stream')
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller): void {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"type":"ready","id":"00000000-0000-4000-8000-000000000000"}\n\n'
                  )
                );
              }
            })
          );
        uploads++;
        throw new Error('Network lost');
      }
    );
    recognition.append(new ArrayBuffer(8_192));
    await expect(recognition.result).rejects.toThrow('Network lost');
    expect(uploads).toBe(1);
    const truncated = startStreamingRecognition(
      undefined,
      async (): Promise<Response> =>
        new Response('data: {"type":"partial","text":"удали"}\n\n')
    );
    await expect(truncated.result).rejects.toThrow('прервалось');
  });

  test('bounds unsent audio and cancels a muted utterance', async (): Promise<void> => {
    const request = async (
      _path: string,
      init: RequestInit
    ): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', (): void =>
          reject(new DOMException('Aborted', 'AbortError'))
        );
      });
    const recognition = startStreamingRecognition(undefined, request);
    recognition.append(new ArrayBuffer(32_000));
    recognition.append(new ArrayBuffer(32_000));
    recognition.append(new ArrayBuffer(2));
    await expect(recognition.result).rejects.toThrow('не успевает');
    const cancelled = startStreamingRecognition(undefined, request);
    cancelled.cancel();
    await expect(cancelled.result).rejects.toMatchObject({
      name: 'AbortError'
    });
  });
});

describe('sentence speech queue', (): void => {
  test('pauses the current segment and resumes it without new synthesis or playback', async (): Promise<void> => {
    const completion = deferred<void>();
    const pause = mock((): void => {});
    const resume = mock((): void => {});
    const stop = mock((): void => completion.resolve());
    const synthesize = mock(async (): Promise<Blob> => new Blob());
    const play = mock(() => ({
      done: completion.promise,
      pause,
      resume,
      stop
    }));
    const queue = new VoiceSpeechQueue({
      synthesize,
      play,
      speaking: (): void => {},
      error: (): void => {}
    });
    queue.finish('Здравствуйте. Я помогу вам.');
    await waitFor(() => play.mock.calls.length === 1);
    queue.pause();
    queue.pause();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    queue.resume();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    completion.resolve();
    await queue.done;
  });

  test.each([false, true])(
    'late synthesis waits for noise recognition; closing never resumes it: %s',
    async (close): Promise<void> => {
      const synthesis = deferred<Blob>();
      const play = mock(() => ({
        done: Promise.resolve(),
        pause: (): void => {},
        resume: (): void => {},
        stop: (): void => {}
      }));
      const queue = new VoiceSpeechQueue({
        synthesize: (): Promise<Blob> => synthesis.promise,
        play,
        speaking: (): void => {},
        error: (): void => {}
      });
      queue.append('Ответ. ');
      queue.pause();
      synthesis.resolve(new Blob());
      queue.finish('Ответ.');
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(play).not.toHaveBeenCalled();
      if (close) queue.stop();
      queue.resume();
      await queue.done;
      expect(play).toHaveBeenCalledTimes(close ? 0 : 1);
    }
  );

  test('keeps streamed initials and decimal quantities together', async (): Promise<void> => {
    const texts: string[] = [];
    const queue = new VoiceSpeechQueue({
      synthesize: async (text): Promise<Blob> => {
        texts.push(text);
        return new Blob();
      },
      play: () => ({
        done: Promise.resolve(),
        pause: (): void => {},
        resume: (): void => {},
        stop: (): void => {}
      }),
      speaking: (): void => {},
      error: (error): never => {
        throw error;
      }
    });
    queue.append('Ответственный Перов Д. ');
    await Promise.resolve();
    expect(texts).toEqual([]);
    queue.append('А. Количество 1.5 шт. ');
    queue.append('Записано.');
    queue.finish('Ответственный Перов Д. А. Количество 1.5 шт. Записано.');
    await queue.done;
    expect(texts).toEqual([
      'Ответственный Перов Д. А. Количество 1.5 шт. Записано.'
    ]);
  });

  test('starts before completion and does not repeat the final answer', async (): Promise<void> => {
    const texts: string[] = [];
    const queue = new VoiceSpeechQueue({
      synthesize: async (text): Promise<Blob> => {
        texts.push(text);
        return new Blob([text]);
      },
      play: () => ({
        pause: (): void => {},
        resume: (): void => {},
        done: Promise.resolve(),
        stop: (): void => {}
      }),
      speaking: (): void => {},
      error: (error): never => {
        throw error;
      }
    });
    queue.append('Нашёл задачу. ');
    await waitFor(() => texts.length === 1);
    queue.append('Она в работе.');
    queue.finish('Нашёл задачу. Она в работе.');
    await queue.done;
    expect(texts).toEqual(['Нашёл задачу.', 'Она в работе.']);
  });

  test('interruption suppresses late synthesis and subsequent deltas', async (): Promise<void> => {
    const synthesis = deferred<Blob>();
    const play = mock(() => ({
      pause: (): void => {},
      resume: (): void => {},
      done: Promise.resolve(),
      stop: (): void => {}
    }));
    const queue = new VoiceSpeechQueue({
      synthesize: (): Promise<Blob> => synthesis.promise,
      play,
      speaking: (): void => {},
      error: (): void => {}
    });
    queue.append('Первое предложение. ');
    queue.stop();
    synthesis.resolve(new Blob(['old']));
    queue.append('Второе предложение. ');
    queue.finish('Первое предложение. Второе предложение.');
    await queue.done;
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
  });

  test('does not pronounce an unfinished code block', async (): Promise<void> => {
    const spoken: string[] = [];
    const queue = new VoiceSpeechQueue({
      synthesize: async (text): Promise<Blob> => {
        spoken.push(text);
        return new Blob();
      },
      play: () => ({
        done: Promise.resolve(),
        pause: (): void => {},
        resume: (): void => {},
        stop: (): void => {}
      }),
      speaking: (): void => {},
      error: (): void => {}
    });
    queue.append('```js\nsecret.run();\n');
    expect(spoken).toEqual([]);
    queue.append('```\nГотово.');
    queue.finish('```js\nsecret.run();\n```\nГотово.');
    await queue.done;
    expect(spoken.join(' ')).not.toContain('secret');
  });
});

describe('voice approval feedback', (): void => {
  const task = (status: AiActionTask['status']): AiActionTask => ({
    id: 'task',
    requestId: 'request',
    title: 'Добавление корпуса насоса, 1 штука',
    revision: 1,
    version: 2,
    digest: 'a'.repeat(64),
    approved: true,
    createdAt: 1,
    updatedAt: 2,
    completed: status === 'completed' ? 1 : 0,
    status,
    steps: []
  });

  test('only speaks tracked decisions, once, including a later verified result', (): void => {
    const feedback = new VoiceActionFeedback();
    expect(feedback.update([task('completed')])).toEqual([]);
    feedback.track('task');
    expect(
      feedback.update([task('waiting_approval'), task('running')])
    ).toEqual([]);
    expect(feedback.update([task('needs_review')])).toHaveLength(1);
    expect(feedback.update([task('needs_review')])).toEqual([]);
    expect(feedback.update([task('completed')])).toEqual([
      'Выполнено: Добавление корпуса насоса, 1 штука.'
    ]);
    expect(feedback.update([task('completed')])).toEqual([]);
    feedback.track('task');
    feedback.clear();
    expect(feedback.update([task('completed')])).toEqual([]);
    expect(actionTaskVoiceReply(task('waiting_approval'))).toContain(
      'Подтвердить'
    );
  });

  test('does not announce success or cancellation for a failed or partial action', (): void => {
    expect(actionTaskVoiceReply(task('failed'))).toContain(
      'Действие не выполнено'
    );
    const partial: AiActionTask = {
      ...task('partial'),
      completed: 1,
      steps: [
        {
          key: 'one',
          title: 'Первый шаг',
          status: 'completed',
          dependencies: [],
          details: { toolName: 'test', input: {} }
        },
        {
          key: 'two',
          title: 'Второй шаг',
          status: 'failed',
          message: 'Сервис недоступен',
          dependencies: [],
          details: { toolName: 'test', input: {} }
        }
      ]
    };
    expect(actionTaskVoiceReply(partial)).toContain('Выполнено шагов: 1 из 2');
    expect(actionTaskVoiceReply(partial)).toContain('Сервис недоступен');
    expect(
      actionTaskVoiceReply({
        ...partial,
        completed: 0,
        steps: partial.steps.map(step => ({ ...step, status: 'cancelled' }))
      })
    ).toBe('Действие отменено.');
  });

  test('null is a valid approval handoff; button result speaks and remains interruptible', async (): Promise<void> => {
    const texts: string[] = [];
    const errors: unknown[] = [];
    const conversation = new VoiceConversation({
      send: async (): Promise<null> => null,
      state: (): void => {},
      error: (error): void => {
        errors.push(error);
      },
      speech: (speaking, error) =>
        new VoiceSpeechQueue({
          synthesize: async (text): Promise<Blob> => {
            texts.push(text);
            return new Blob();
          },
          play: () => ({
            done: Promise.resolve(),
            pause: (): void => {},
            resume: (): void => {},
            stop: (): void => {}
          }),
          speaking,
          error
        })
    });
    await conversation.respond(async (): Promise<null> => null);
    await conversation.respond(
      async (): Promise<string> => 'Деталь добавлена.'
    );
    expect(errors).toEqual([]);
    expect(texts).toEqual(['Деталь добавлена.']);
    conversation.stop();
    await conversation.respond(async (): Promise<string> => 'Уже закрыто.');
    expect(texts).toHaveLength(1);
  });

  test.each([false, true])('waits for a text request without a busy toast; closing cancels only unsent input: %s', async (close): Promise<void> => {
    let capture: VoiceActivityCallbacks | undefined;
    let busy = true;
    const recognition = deferred<string>();
    const send = mock(async (): Promise<null> => null);
    const error = mock((): void => {});
    const conversation = new VoiceConversation({
      microphone: async callbacks => {
        capture = callbacks;
        return { mute: (): void => {}, stop: (): void => {} };
      },
      recognize: () => ({
        result: recognition.promise, append: (): void => {}, finish: (): void => {},
        cancel: (): void => recognition.resolve('')
      }),
      isBusy: (): boolean => busy,
      send, error, state: (): void => {}
    });
    await conversation.start();
    capture?.start();
    capture?.end();
    recognition.resolve('Покажи задачи');
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(send).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    if (close) conversation.stop();
    busy = false;
    await new Promise(resolve => setTimeout(resolve, 130));
    expect(send).toHaveBeenCalledTimes(close ? 0 : 1);
    expect(error).not.toHaveBeenCalled();
    conversation.stop();
  });

  test('empty captures release capacity; full queue sets one inline notice without error toasts', async (): Promise<void> => {
    let capture: VoiceActivityCallbacks | undefined;
    const requests: ReturnType<typeof deferred<string>>[] = [];
    const answer = deferred<string | null>();
    const errors: unknown[] = [];
    const sent: string[] = [];
    const notices: string[] = [];
    const conversation = new VoiceConversation({
      microphone: async callbacks => {
        capture = callbacks;
        return { mute: (): void => {}, stop: (): void => {} };
      },
      recognize: () => {
        const request = deferred<string>();
        requests.push(request);
        return {
          result: request.promise,
          append: (): void => {},
          finish: (): void => {},
          cancel: (): void => request.resolve('')
        };
      },
      send: async (text): Promise<string | null> => {
        sent.push(text);
        return answer.promise;
      },
      state: (): void => {},
      notice: (text): void => { if (text) notices.push(text); },
      error: (error): void => {
        errors.push(error);
      }
    });
    await conversation.start();
    capture?.start();
    capture?.end();
    requests[0].resolve('Создай сборку');
    await waitFor(() => sent.length === 1);
    for (let index = 0; index < 8; index++) {
      capture?.start();
      capture?.end();
      requests.at(-1)?.resolve('');
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(errors).toEqual([]);
    for (let index = 0; index < 2; index++) {
      capture?.start();
      capture?.end();
      requests.at(-1)?.resolve('Найди сборку');
    }
    for (let index = 0; index < 8; index++) {
      capture?.start();
      capture?.end();
      requests.at(-1)?.resolve('Ещё одна команда');
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    expect(errors).toEqual([]);
    expect(notices).toEqual(['Последняя фраза не отправлена. Повторите её после ответа.']);
    answer.resolve(null);
    await waitFor(() => sent.length === 3);
    expect(sent).toEqual(['Создай сборку', 'Найди сборку', 'Найди сборку']);
    conversation.stop();
  });
});

describe('voice farewell', (): void => {
  test.each([
    'Пока!',
    'Пока-пока.',
    'До свидания',
    'досвидания',
    'Ну всё, давай пока.',
    'Хорошо, тогда до свидания!',
    'Спасибо за помощь, до встречи.',
    'До связи, СЭПи',
    'Всего хорошего',
    'Всего доброго!',
    'Спокойной ночи',
    'Увидимся',
    'Хорошего дня',
    'Сэпи, заверши разговор, пожалуйста.',
    'Давай закончим разговор',
    'Закрой голосовой режим',
    'На этом всё',
    'Давай на этом закончим',
    'Отключайся',
    'Бай-бай',
    'До завтра',
    'До скорого',
    'До новых встреч',
    'Давай закончим на этом'
  ])('recognizes a complete farewell: %s', (text): void => {
    expect(isVoiceFarewell(text)).toBe(true);
  });

  test.each([
    'Пока не закрывай',
    'Пока покажи задачу',
    'Я пока думаю',
    'Не заверши разговор',
    'Не говори пока',
    'Скажи «до свидания» по-английски',
    'Создай задачу Пока',
    'Создай задачу с названием «До свидания»',
    'Когда я говорю пока, что ты делаешь?',
    'Что значит до свидания?',
    'Спасибо',
    'Всё',
    'Стоп',
    'Отмена',
    'Пока не до свидания',
    'До встречи нужно создать деталь',
    '',
    'До завтра нужно сделать отчёт'
  ])(
    'keeps conversation open for a mention or another command: %s',
    (text): void => {
      expect(isVoiceFarewell(text)).toBe(false);
    }
  );

  test.each(['Пока', 'Спасибо, до свидания'])(
    'speaks %s before closing, releases microphone immediately',
    async (text): Promise<void> => {
      let capture: VoiceActivityCallbacks | undefined;
      const input = deferred<string>();
      const playback = deferred<void>();
      const micStop = mock((): void => {});
      const ended = mock((): void => {});
      const spoken: string[] = [];
      const send = mock(async (): Promise<string> => 'Не должен вызываться');
      const conversation = new VoiceConversation({
        microphone: async callbacks => {
          capture = callbacks;
          return { mute: (): void => {}, stop: micStop };
        },
        recognize: () => ({
          result: input.promise,
          append: (): void => {},
          finish: (): void => {},
          cancel: (): void => {}
        }),
        speech: (speaking, error) =>
          new VoiceSpeechQueue({
            synthesize: async (value): Promise<Blob> => {
              spoken.push(value);
              return new Blob();
            },
            play: () => ({
              pause: (): void => {},
              resume: (): void => {},
              done: playback.promise,
              stop: (): void => playback.resolve()
            }),
            speaking,
            error
          }),
        send,
        ended,
        state: (): void => {},
        error: (error): never => {
          throw error;
        }
      });
      await conversation.start();
      capture?.start();
      capture?.end();
      input.resolve(text);
      await waitFor(() => spoken.length === 1);
      expect(spoken).toEqual([VOICE_FAREWELL_REPLY]);
      expect(micStop).toHaveBeenCalledTimes(1);
      expect(ended).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      capture?.start();
      playback.resolve();
      await waitFor(() => ended.mock.calls.length === 1);
      expect(send).not.toHaveBeenCalled();
      expect(micStop).toHaveBeenCalledTimes(1);
    }
  );

  test('farewell bypasses a full queue without cancelling or repeating a submitted action', async (): Promise<void> => {
    let capture: VoiceActivityCallbacks | undefined;
    let reply: VoiceReplyOptions | undefined;
    const requests: ReturnType<typeof deferred<string>>[] = [];
    const action = deferred<string>();
    const playback = deferred<void>();
    const played = mock(() => ({
      pause: (): void => {},
      resume: (): void => {},
      done: playback.promise,
      stop: (): void => playback.resolve()
    }));
    const ended = mock((): void => {});
    const errors: unknown[] = [];
    const send = mock(
      async (_text: string, options: VoiceReplyOptions): Promise<string> => {
        reply = options;
        return action.promise;
      }
    );
    const conversation = new VoiceConversation({
      microphone: async callbacks => {
        capture = callbacks;
        return { mute: (): void => {}, stop: (): void => {} };
      },
      recognize: () => {
        const input = deferred<string>();
        requests.push(input);
        return {
          result: input.promise,
          append: (): void => {},
          finish: (): void => {},
          cancel: (): void => input.resolve('')
        };
      },
      speech: (speaking, error) =>
        new VoiceSpeechQueue({
          synthesize: async (): Promise<Blob> => new Blob(),
          play: played,
          speaking,
          error
        }),
      send,
      ended,
      state: (): void => {},
      error: (error): void => {
        errors.push(error);
      }
    });
    await conversation.start();
    capture?.start();
    capture?.end();
    requests[0].resolve('Создай сборку');
    await waitFor(() => send.mock.calls.length === 1);
    for (const text of ['Покажи сборку', 'Покажи детали', 'До свидания']) {
      capture?.start();
      capture?.end();
      requests.at(-1)?.resolve(text);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await waitFor(() => played.mock.calls.length === 1);
    reply?.onReset();
    reply?.onText('Поздний ответ. ');
    expect(ended).not.toHaveBeenCalled();
    playback.resolve();
    await waitFor(() => ended.mock.calls.length === 1);
    action.resolve('Сборка создана.');
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(send).toHaveBeenCalledTimes(1);
    expect(played).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  test.each([true, false])(
    'always releases a farewell on audio failure or manual close: %s',
    async (fail): Promise<void> => {
      let capture: VoiceActivityCallbacks | undefined;
      const input = deferred<string>();
      const synthesis = deferred<Blob>();
      const ended = mock((): void => {});
      const micStop = mock((): void => {});
      const errors: unknown[] = [];
      const conversation = new VoiceConversation({
        microphone: async callbacks => {
          capture = callbacks;
          return { mute: (): void => {}, stop: micStop };
        },
        recognize: () => ({
          result: input.promise,
          append: (): void => {},
          finish: (): void => {},
          cancel: (): void => {}
        }),
        speech: (speaking, error) =>
          new VoiceSpeechQueue({
            synthesize: (): Promise<Blob> => synthesis.promise,
            play: () => ({
              done: Promise.resolve(),
              pause: (): void => {},
              resume: (): void => {},
              stop: (): void => {}
            }),
            speaking,
            error
          }),
        send: async (): Promise<null> => null,
        ended,
        state: (): void => {},
        error: (error): void => {
          errors.push(error);
        }
      });
      await conversation.start();
      capture?.start();
      capture?.end();
      input.resolve('Пока');
      await waitFor(() => micStop.mock.calls.length === 1);
      if (fail) synthesis.reject(new Error('Speech unavailable'));
      else {
        conversation.stop();
        synthesis.resolve(new Blob());
      }
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(ended).toHaveBeenCalledTimes(fail ? 1 : 0);
      expect(errors).toHaveLength(fail ? 1 : 0);
    }
  );
});

describe('voice commands lifecycle', (): void => {
  test.each(['empty', 'failure', 'mute', 'close', 'overlap'])(
    'noise while speaking preserves the answer: %s',
    async (outcome): Promise<void> => {
      let capture: VoiceActivityCallbacks | undefined;
      const requests: ReturnType<typeof deferred<string>>[] = [];
      const playback = deferred<void>();
      const pause = mock((): void => {});
      const resume = mock((): void => {});
      const stop = mock((): void => playback.resolve());
      const play = mock(() => ({
        done: playback.promise,
        pause,
        resume,
        stop
      }));
      const send = mock(
        async (): Promise<string> =>
          'Здравствуйте! Я помогу с вопросами по производству.'
      );
      const errors: unknown[] = [];
      const conversation = new VoiceConversation({
        microphone: async callbacks => {
          capture = callbacks;
          return { mute: (): void => {}, stop: (): void => {} };
        },
        recognize: () => {
          const input = deferred<string>();
          requests.push(input);
          return {
            result: input.promise,
            append: (): void => {},
            finish: (): void => {},
            cancel: (): void =>
              input.reject(new DOMException('Aborted', 'AbortError'))
          };
        },
        speech: (speaking, error) =>
          new VoiceSpeechQueue({
            synthesize: async (): Promise<Blob> => new Blob(),
            play,
            speaking,
            error
          }),
        send,
        state: (): void => {},
        error: (error): void => {
          errors.push(error);
        }
      });
      await conversation.start();
      capture?.start();
      capture?.end();
      requests[0].resolve('Здравствуйте');
      await waitFor(() => play.mock.calls.length === 1);
      capture?.start();
      capture?.end();
      expect(pause).toHaveBeenCalledTimes(1);
      expect(stop).not.toHaveBeenCalled();
      if (outcome === 'close') conversation.stop();
      else if (outcome === 'mute') conversation.mute(true);
      else if (outcome === 'overlap') {
        capture?.start();
        capture?.end();
      }
      // Запись уже закончена, но её распознавание ещё может выполняться.
      if (outcome === 'failure')
        requests[1].reject(new Error('Recognition unavailable'));
      else requests[1].resolve('');
      if (outcome === 'overlap') {
        await new Promise(resolve => setTimeout(resolve, 5));
        expect(resume).not.toHaveBeenCalled();
        requests[2].resolve('');
      }
      if (outcome !== 'close')
        await waitFor(() => resume.mock.calls.length === 1);
      else await new Promise(resolve => setTimeout(resolve, 5));
      expect(resume).toHaveBeenCalledTimes(outcome === 'close' ? 0 : 1);
      expect(send).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalledTimes(outcome === 'close' ? 1 : 0);
      playback.resolve();
      await new Promise(resolve => setTimeout(resolve, 5));
      expect(errors).toHaveLength(outcome === 'failure' ? 1 : 0);
      conversation.stop();
    }
  );

  test('barge-in stops sound but never retries or aborts the accepted business request', async (): Promise<void> => {
    let capture: VoiceActivityCallbacks | undefined;
    const requests: Array<ReturnType<typeof deferred<string>>> = [];
    const sends: string[] = [];
    const firstAnswer = deferred<string>();
    const playbackStopped = mock((): void => {});
    const playbackDone = deferred<void>();
    const errors: unknown[] = [];
    const conversation = new VoiceConversation({
      microphone: async callbacks => {
        capture = callbacks;
        return { mute: (): void => {}, stop: (): void => {} };
      },
      recognize: () => {
        const request = deferred<string>();
        requests.push(request);
        return {
          result: request.promise,
          append: (): void => {},
          finish: (): void => {},
          cancel: (): void =>
            request.reject(new DOMException('Aborted', 'AbortError'))
        };
      },
      speech: (speaking, error) =>
        new VoiceSpeechQueue({
          synthesize: async (): Promise<Blob> => new Blob(),
          speaking,
          error,
          play: () => ({
            pause: (): void => {},
            resume: (): void => {},
            done: playbackDone.promise,
            stop: (): void => {
              playbackStopped();
              playbackDone.resolve();
            }
          })
        }),
      send: async (text, options: VoiceReplyOptions): Promise<string> => {
        sends.push(text);
        if (sends.length === 1) {
          options.onText('Проверяю доску. ');
          return firstAnswer.promise;
        }
        return 'Нашёл задачу.';
      },
      state: (): void => {},
      error: (error): void => {
        errors.push(error);
      }
    });
    await conversation.start();
    capture?.start();
    capture?.end();
    requests[0].resolve('Создай задачу');
    await waitFor(() => sends.length === 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    capture?.start();
    capture?.end();
    requests[1].resolve('Найди её');
    await waitFor(() => playbackStopped.mock.calls.length === 1);
    expect(sends).toEqual(['Создай задачу']);
    expect(playbackStopped).toHaveBeenCalledTimes(1);
    firstAnswer.resolve('Проверяю доску. Нужна кнопка подтверждения.');
    await waitFor(() => sends.length === 2);
    expect(sends).toEqual(['Создай задачу', 'Найди её']);
    conversation.stop();
    expect(errors).toEqual([]);
  });

  test('mute cancels partial input; closing cancels pending microphone acquisition', async (): Promise<void> => {
    let capture: VoiceActivityCallbacks | undefined;
    const input = deferred<string>();
    const send = mock(async (): Promise<string> => 'Unexpected');
    const stop = mock((): void => {});
    const microphone = deferred<{
      mute: (muted: boolean) => void;
      stop: () => void;
    }>();
    const conversation = new VoiceConversation({
      microphone: async callbacks => {
        capture = callbacks;
        return microphone.promise;
      },
      recognize: () => ({
        result: input.promise,
        append: (): void => {},
        finish: (): void => {},
        cancel: (): void =>
          input.reject(new DOMException('Aborted', 'AbortError'))
      }),
      send,
      state: (): void => {},
      error: (): void => {}
    });
    const starting = conversation.start();
    capture?.start();
    conversation.mute(true);
    conversation.stop();
    microphone.resolve({ mute: (): void => {}, stop });
    await starting;
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
