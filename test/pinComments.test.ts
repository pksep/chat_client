import { describe, test, expect } from 'bun:test';
import {
  createPinComments,
  type PinComment,
  type PinCommentAck,
  type PinCommentCommand,
  type PinCommentSnapshot
} from '../src/services/pin-comments';
import type { IMessage } from '../src/components/interfaces/interfaces';

const topicId = '60b7d096-a51e-4b82-b245-2caa2e781001';
const messageId = '60b7d096-a51e-4b82-b245-2caa2e781002';
const ownerId = '60b7d096-a51e-4b82-b245-2caa2e781003';
const commentId = '60b7d096-a51e-4b82-b245-2caa2e781004';
const original = {
  id: messageId,
  topicId,
  text: 'Оригинал',
  senderUserId: ownerId,
  createdAt: new Date(),
  updatedAt: new Date(),
  isPin: false,
  isPinnedForAll: false
} as IMessage;
const note = (extra: Partial<PinComment> = {}): PinComment => ({
  id: commentId,
  topicId,
  messageId,
  authorId: ownerId,
  authorName: 'Тест',
  authorAvatarUrl: null,
  scope: 'ALL',
  text: 'Заметка',
  revision: '9007199254740993',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...extra
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
const error = (status: number) =>
  Object.assign(new Error('Синтетическая ошибка'), { status });
async function fixture() {
  let session: { ownerId: string; key: string; generation: number } | null = {
    ownerId,
    key: `test:${ownerId}`,
    generation: 1
  };
  let connected = false;
  let message: IMessage | undefined = { ...original };
  let remote: PinComment[] = [];
  let snapshot: PinCommentSnapshot | null = null;
  let get = async () => ({ version: 1, comments: remote });
  const sent: PinCommentCommand[] = [];
  const refreshed: string[] = [];
  let send = async (command: PinCommentCommand): Promise<PinCommentAck> => ({
    ...command,
    commentId,
    revision: '9007199254740993',
    version: 1,
    comments: [note({ text: 'text' in command ? command.text : '' })],
    message: { ...original, isPin: true, isPinnedForAll: true }
  });
  let save = async (value: PinCommentSnapshot) => {
    snapshot = structuredClone(value);
  };
  const build = () =>
    createPinComments({
      session: () => session,
      authorName: () => 'Тест',
      connected: () => connected,
      load: async () => snapshot,
      save: async (_owner, _topic, value) => save(value),
      list: async () => get(),
      send: async (_topic, command) => {
        sent.push(structuredClone(command));
        return send(command);
      },
      message: () => message,
      isDeleted: () => !message,
      applyMessage: value => {
        message = value;
      },
      refreshPins: async id => {
        refreshed.push(id);
      }
    });
  const store = build();
  await store.refresh(topicId);
  return {
    store,
    build,
    sent,
    refreshed,
    get snapshot() {
      return snapshot;
    },
    get message() {
      return message;
    },
    network(value: boolean) {
      connected = value;
    },
    session(value: typeof session) {
      session = value;
    },
    original(value: IMessage | undefined) {
      message = value;
    },
    remote(value: PinComment[]) {
      remote = value;
    },
    get(value: typeof get) {
      get = value;
    },
    send(value: typeof send) {
      send = value;
    },
    save(value: typeof save) {
      save = value;
    }
  };
}

describe('CHAT-561: очередь заметок', () => {
  test('перезапуск восстанавливает исходник из очереди и проверяет его через around перед отправкой', async () => {
    const f = await fixture();
    const commandId = f.store.pin(topicId, messageId, 'ALL', 'До перезапуска');
    await new Promise(resolve => setTimeout(resolve, 0));
    let currentMessage: IMessage | undefined;
    let checks = 0;
    const sent: PinCommentCommand[] = [];
    const recovered = createPinComments({
      session: () => ({ ownerId, key: `test:${ownerId}`, generation: 2 }),
      authorName: () => 'Тест',
      load: async () => f.snapshot,
      save: async () => {},
      connected: () => true,
      list: async () => ({ version: 1, comments: [] }),
      message: () => currentMessage,
      isDeleted: () => false,
      resolveMessage: async () => {
        checks++;
        return original;
      },
      applyMessage: message => {
        currentMessage = message;
      },
      refreshPins: async () => {},
      send: async (_topic, command) => {
        sent.push(command);
        return {
          ...command,
          version: 1,
          commentId,
          revision: '1',
          comments: [note()],
          message: { ...original, isPin: true, isPinnedForAll: true }
        };
      }
    });
    await recovered.hydrate(topicId);
    expect(recovered.projectPins(topicId, [])).toHaveLength(1);
    await recovered.flush(topicId);
    expect(checks).toBe(1);
    expect(sent[0].commandId).toBe(commandId);
    expect(currentMessage?.isPin).toBe(true);
  });

  test('поддельная идентичность ACK не применяется и не удаляет команду', async () => {
    const f = await fixture();
    f.send(async command => ({
      ...command,
      commandId: crypto.randomUUID(),
      commentId,
      revision: '1',
      version: 1,
      comments: [note()],
      message: { ...original, isPin: true }
    }));
    f.store.pin(topicId, messageId, 'ALL', 'Сохранить');
    f.network(true);
    await f.store.flush(topicId);
    expect(f.message?.isPin).toBe(false);
    expect(f.store.state(topicId).value.operations[0].status).toBe('retryable');
  });

  test('ошибка локального хранилища не отправляет неперсистентную команду', async () => {
    const f = await fixture();
    f.save(async () => {
      throw new Error('Quota');
    });
    f.store.pin(topicId, messageId, 'ALL', 'Текст для восстановления');
    f.network(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.sent).toHaveLength(0);
    expect(f.store.state(topicId).value.operations[0]).toMatchObject({
      status: 'failed',
      command: { text: 'Текст для восстановления' }
    });
  });
  test('локальное принятие мгновенное, PIN с заметкой — одна сохранённая команда UUID', async () => {
    const f = await fixture();
    const id = f.store.pin(topicId, messageId, 'ALL', '  Текст  ');
    expect(id).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/
    );
    expect(f.sent).toHaveLength(0);
    expect(f.store.commentsFor(topicId, messageId)[0]).toMatchObject({
      text: 'Текст',
      pending: true
    });
    expect(f.store.projectPins(topicId, [])).toHaveLength(1);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.snapshot?.operations[0].command.commandId).toBe(id);
    f.network(true);
    await f.store.flush(topicId);
    expect(f.sent).toHaveLength(1);
    expect(f.store.commentsFor(topicId, messageId)).toHaveLength(1);
    expect(f.store.commentsFor(topicId, messageId)[0].pending).toBeUndefined();
    expect(f.store.state(topicId).value.operations).toEqual([]);
  });
  test('обрыв после отправки: повтор и перезапуск сохраняют commandId и не дублируют ACK', async () => {
    const f = await fixture();
    f.store.pin(topicId, messageId, 'ALL', 'Текст');
    f.send(async () => {
      throw new TypeError('Обрыв после записи');
    });
    f.network(true);
    await f.store.flush(topicId);
    const command = f.sent[0];
    expect(f.snapshot?.operations[0].status).toBe('retryable');
    const restarted = f.build();
    await restarted.hydrate(topicId);
    f.send(async cmd => ({
      ...cmd,
      commentId,
      revision: '1',
      version: 1,
      comments: [note({ text: 'Текст' })],
      message: { ...original, isPin: true, isPinnedForAll: true }
    }));
    await restarted.flush(topicId);
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1]).toEqual(command);
    expect(restarted.commentsFor(topicId, messageId)).toHaveLength(1);
  });
  test('запоздалый GET не отменяет ACK', async () => {
    const f = await fixture();
    const read = deferred<{ version: number; comments: PinComment[] }>();
    f.get(() => read.promise);
    const reading = f.store.refresh(topicId);
    await Promise.resolve();
    await Promise.resolve();
    f.store.pin(topicId, messageId, 'ALL', 'Свежая');
    f.network(true);
    await f.store.flush(topicId);
    read.resolve({ version: 1, comments: [] });
    await reading;
    expect(f.store.state(topicId).value.comments[0].text).toBe('Свежая');
  });
  test('409 возвращает подтверждённые заметки и сохраняет введённый текст', async () => {
    const f = await fixture();
    f.original({ ...original, isPin: true, isPinnedForAll: true });
    f.remote([note()]);
    await f.store.refresh(topicId);
    f.store.enqueue(topicId, {
      commandId: crypto.randomUUID(),
      messageId,
      scope: 'ALL',
      action: 'EDIT',
      commentId,
      expectedRevision: note().revision,
      text: 'Мой несохранённый текст'
    });
    f.send(async () => {
      throw error(409);
    });
    f.remote([
      note({ text: 'Изменено другим сеансом', revision: '9007199254740994' })
    ]);
    f.network(true);
    await f.store.flush(topicId);
    expect(f.store.commentsFor(topicId, messageId)[0].text).toBe(
      'Изменено другим сеансом'
    );
    expect(f.store.state(topicId).value.operations[0]).toMatchObject({
      status: 'conflict',
      command: { text: 'Мой несохранённый текст' }
    });
    expect(f.refreshed).toEqual([topicId]);
    await f.store.flush(topicId);
    expect(f.sent).toHaveLength(1);
  });
  test('revision остаётся точной строкой за пределом Number.MAX_SAFE_INTEGER', async () => {
    const f = await fixture();
    f.remote([note()]);
    await f.store.refresh(topicId);
    f.store.enqueue(topicId, {
      commandId: crypto.randomUUID(),
      messageId,
      scope: 'ALL',
      action: 'DELETE',
      commentId,
      expectedRevision: '9007199254740993'
    });
    f.network(true);
    await f.store.flush(topicId);
    expect(f.sent[0]).toMatchObject({ expectedRevision: '9007199254740993' });
  });
  test('чужой SELF отбрасывается даже при ошибочной выдаче сервера', async () => {
    const f = await fixture();
    f.original({
      ...original,
      isPin: true,
      isPinnedForAll: true,
      isPinnedOnlyMe: true
    });
    f.remote([
      note({ scope: 'SELF', authorId: 'other' }),
      note({ id: 'own', scope: 'SELF' })
    ]);
    await f.store.refresh(topicId);
    expect(
      f.store.state(topicId).value.comments.map(value => value.id)
    ).toEqual(['own']);
  });
  test('изменить чужую заметку нельзя', async () => {
    const f = await fixture();
    f.remote([note({ authorId: 'other' })]);
    await f.store.refresh(topicId);
    expect(() =>
      f.store.enqueue(topicId, {
        commandId: crypto.randomUUID(),
        messageId,
        action: 'DELETE',
        scope: 'ALL',
        commentId,
        expectedRevision: note().revision
      })
    ).toThrow('только свой');
    expect(f.sent).toHaveLength(0);
  });
  test('смена сессии отбрасывает ожидающий ACK и все личные проекции', async () => {
    const f = await fixture();
    const ack = deferred<PinCommentAck>();
    f.send(() => ack.promise);
    f.store.pin(topicId, messageId, 'SELF', 'Личная');
    f.network(true);
    const flush = f.store.flush(topicId);
    while (!f.sent.length) await new Promise(resolve => setTimeout(resolve, 0));
    f.session({ ownerId: 'other', key: 'test:other', generation: 2 });
    expect(f.store.commentsFor(topicId, messageId)).toEqual([]);
    ack.resolve({
      ...f.sent[0],
      commentId,
      revision: '1',
      version: 1,
      comments: [note({ scope: 'SELF' })],
      message: { ...original, isPin: true }
    });
    await flush;
    expect(f.store.state(topicId).value.comments).toEqual([]);
    expect(f.message?.isPin).toBe(false);
  });
  test('старый сервер 404/405 отключает комментарии без локальной подмены', async () => {
    for (const status of [404, 405]) {
      const f = await fixture();
      f.get(async () => {
        throw error(status);
      });
      await f.store.refresh(topicId);
      expect(f.store.state(topicId).value.support).toBe('unavailable');
      expect(() => f.store.pin(topicId, messageId, 'ALL', 'Текст')).toThrow(
        'недоступны'
      );
      expect(f.store.commentsFor(topicId, messageId)).toEqual([]);
    }
  });
  test('открепление скрывает заметку, повторное закрепление её возвращает', async () => {
    const f = await fixture();
    f.remote([note()]);
    await f.store.refresh(topicId);
    expect(f.store.commentsFor(topicId, messageId)).toEqual([]);
    f.original({ ...original, isPin: true, isPinnedForAll: true });
    expect(f.store.commentsFor(topicId, messageId)).toHaveLength(1);
  });
  test('удалённый оригинал не отправляет команду и не возвращается в список', async () => {
    const f = await fixture();
    f.store.pin(topicId, messageId, 'ALL', 'Текст');
    f.original(undefined);
    f.network(true);
    await f.store.flush(topicId);
    expect(f.sent).toHaveLength(0);
    expect(f.store.projectPins(topicId, [])).toEqual([]);
    expect(f.store.state(topicId).value.operations[0].status).toBe('failed');
  });
  test('несохранённый комментарий блокирует вторую операцию с оригиналом', async () => {
    const f = await fixture();
    f.store.pin(topicId, messageId, 'ALL', 'Текст');
    expect(f.store.pending(topicId, messageId)).toBe(true);
    expect(() => f.store.pin(topicId, messageId, 'SELF', 'Другой')).toThrow(
      'предыдущий'
    );
  });
  test('пустой/слишком длинный текст не ставится в очередь', async () => {
    const f = await fixture();
    expect(() => f.store.pin(topicId, messageId, 'ALL', ' ')).toThrow('4000');
    expect(() =>
      f.store.pin(topicId, messageId, 'ALL', 'a'.repeat(4001))
    ).toThrow('4000');
    expect(f.store.state(topicId).value.operations).toEqual([]);
  });
});
