import { shallowRef } from 'vue';
import type { IMessage } from '../components/interfaces/interfaces';

export type PinScope = 'ALL' | 'SELF';
export interface PinComment {
  id: string;
  topicId: string;
  messageId: string;
  scope: PinScope;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  text: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
  pending?: boolean;
}
export type PinCommentCommand = {
  commandId: string;
  messageId: string;
  scope: PinScope;
} & (
  | { action: 'PIN'; expectedPinned: boolean; text: string }
  | {
      action: 'EDIT';
      commentId: string;
      expectedRevision: string;
      text: string;
    }
  | { action: 'DELETE'; commentId: string; expectedRevision: string }
);
export interface PinCommentAck {
  commandId: string;
  messageId: string;
  action: PinCommentCommand['action'];
  scope: PinScope;
  commentId: string;
  revision: string;
  version: 1;
  comments: PinComment[];
  message: IMessage;
}
export interface PinCommentOperation {
  command: PinCommentCommand;
  source?: IMessage;
  authorName: string;
  createdAt: string;
  status: 'queued' | 'sending' | 'retryable' | 'conflict' | 'failed';
  error?: string;
}
export interface PinCommentSnapshot {
  comments: PinComment[];
  operations: PinCommentOperation[];
  support: 'unknown' | 'available' | 'unavailable';
}
export interface PinCommentsState extends PinCommentSnapshot {
  ready: boolean;
  refreshing: boolean;
  error: string;
}
interface PinCommentSession {
  ownerId: string;
  key: string;
  generation: unknown;
}
export interface PinCommentsDependencies {
  session: () => PinCommentSession | null;
  authorName: () => string;
  load: (key: string, topicId: string) => Promise<PinCommentSnapshot | null>;
  save: (
    key: string,
    topicId: string,
    state: PinCommentSnapshot
  ) => Promise<void>;
  list: (
    topicId: string
  ) => Promise<{ version: number; comments: PinComment[] }>;
  send: (topicId: string, command: PinCommentCommand) => Promise<PinCommentAck>;
  message: (topicId: string, messageId: string) => IMessage | undefined;
  isDeleted?: (topicId: string, messageId: string) => boolean;
  resolveMessage?: (
    topicId: string,
    messageId: string
  ) => Promise<IMessage | undefined>;
  applyMessage: (message: IMessage) => void;
  refreshPins: (topicId: string) => Promise<unknown>;
  connected: () => boolean;
}
const statusOf = (error: unknown): number | undefined => {
  const value = error as {
    status?: number;
    response?: { status?: number };
    cause?: unknown;
  };
  return (
    value?.status ??
    value?.response?.status ??
    (value?.cause ? statusOf(value.cause) : undefined)
  );
};
export const pinnedInScope = (message: IMessage, scope: PinScope): boolean =>
  scope === 'ALL'
    ? message.isPinnedForAll ??
      (Boolean(message.isPin) && !message.isPinnedOnlyMe)
    : Boolean(message.isPinnedForMe && !message.isPinnedForAll) ||
      Boolean(message.isPinnedOnlyMe);

/** Очередь относится к владельцу и серверу; сеть получает только сохранённую команду. */
export function createPinComments(deps: PinCommentsDependencies) {
  let active: PinCommentSession | null = null;
  let generation = 0;
  const sessionVersion = shallowRef(0);
  const entries = new Map<
    string,
    {
      state: ReturnType<typeof shallowRef<PinCommentsState>>;
      epoch: number;
      read: number;
      hydrate?: Promise<void>;
      writing: Promise<void>;
      flushing?: Promise<void>;
      refresh?: Promise<void>;
      refreshEpoch?: number;
    }
  >();
  const sync = () => {
    const session = deps.session();
    if (
      session?.key !== active?.key ||
      session?.generation !== active?.generation
    ) {
      generation++;
      entries.clear();
      active = session;
    }
    return session;
  };
  const entry = (topicId: string) => {
    sync();
    if (!entries.has(topicId))
      entries.set(topicId, {
        state: shallowRef<PinCommentsState>({
          comments: [],
          operations: [],
          support: 'unknown',
          ready: false,
          refreshing: false,
          error: ''
        }),
        epoch: 0,
        read: 0,
        writing: Promise.resolve()
      });
    return entries.get(topicId)!;
  };
  const current = (session: PinCommentSession, token: number) => {
    sync();
    return (
      token === generation &&
      active?.key === session.key &&
      active?.generation === session.generation
    );
  };
  const safeComments = (
    comments: PinComment[],
    topicId: string,
    ownerId: string
  ) =>
    comments.filter(
      comment =>
        comment.topicId === topicId &&
        (comment.scope === 'ALL' ||
          (comment.scope === 'SELF' && comment.authorId === ownerId)) &&
        typeof comment.revision === 'string' &&
        typeof comment.text === 'string'
    );
  const patch = (
    item: ReturnType<typeof entry>,
    change: Partial<PinCommentsState>
  ) => {
    item.state.value = { ...item.state.value, ...change };
  };
  const persist = (topicId: string, session: PinCommentSession) => {
    const item = entry(topicId);
    const { comments, operations, support } = item.state.value;
    const snapshot = JSON.parse(
      JSON.stringify({ comments, operations, support })
    ) as PinCommentSnapshot;
    const write = item.writing
      .catch(() => undefined)
      .then(() => deps.save(session.key, topicId, snapshot));
    item.writing = write;
    return write;
  };
  const hydrate = (topicId: string) => {
    const session = sync();
    const item = entry(topicId);
    if (!session || item.state.value.ready) return Promise.resolve();
    if (item.hydrate) return item.hydrate;
    const token = generation;
    const epoch = item.epoch;
    item.hydrate = deps
      .load(session.key, topicId)
      .then(snapshot => {
        if (!current(session, token) || item.epoch !== epoch) return;
        if (snapshot)
          patch(item, {
            comments: safeComments(snapshot.comments, topicId, session.ownerId),
            operations: snapshot.operations.map(operation => ({
              ...operation,
              status:
                operation.status === 'sending' ? 'retryable' : operation.status,
              error:
                operation.status === 'sending'
                  ? 'Нет подтверждения сервера. Повтор использует ту же команду.'
                  : operation.error
            })),
            support: snapshot.support
          });
      })
      .catch(() => {
        if (current(session, token))
          patch(item, {
            error: 'Не удалось прочитать сохранённые комментарии'
          });
      })
      .finally(() => {
        if (current(session, token)) patch(item, { ready: true });
      });
    return item.hydrate;
  };
  const refresh = async (topicId: string): Promise<void> => {
    await hydrate(topicId);
    const session = sync();
    if (!session) return;
    const item = entry(topicId);
    const token = generation;
    const read = ++item.read;
    const epoch = item.epoch;
    patch(item, { refreshing: true, error: '' });
    try {
      const result = await deps.list(topicId);
      if (
        !current(session, token) ||
        item.read !== read ||
        item.epoch !== epoch
      )
        return;
      if (result.version !== 1 || !Array.isArray(result.comments))
        throw new Error('Неподдерживаемый ответ сервера');
      patch(item, {
        support: 'available',
        comments: safeComments(result.comments, topicId, session.ownerId)
      });
      await persist(topicId, session);
    } catch (error) {
      if (
        !current(session, token) ||
        item.read !== read ||
        item.epoch !== epoch
      )
        return;
      const status = statusOf(error);
      if (status === 404 || status === 405) {
        patch(item, { support: 'unavailable', comments: [] });
        await persist(topicId, session).catch(() => undefined);
      } else
        patch(item, {
          error: 'Не удалось обновить комментарии. Сохранённые данные доступны.'
        });
    } finally {
      if (current(session, token) && item.read === read)
        patch(item, { refreshing: false });
    }
  };
  const refreshOnce = (topicId: string): Promise<void> => {
    const item = entry(topicId);
    if (item.refresh && item.refreshEpoch === item.epoch) return item.refresh;
    item.refreshEpoch = item.epoch;
    const pendingRead = refresh(topicId).finally(() => {
      if (item.refresh === pendingRead) item.refresh = undefined;
    });
    item.refresh = pendingRead;
    return pendingRead;
  };
  const pending = (topicId: string, messageId: string) =>
    entry(topicId).state.value.operations.some(
      operation =>
        operation.command.messageId === messageId &&
        ['queued', 'sending', 'retryable'].includes(operation.status)
    );
  const flush = async (topicId: string): Promise<void> => {
    const session = sync();
    if (!session || !deps.connected()) return;
    const item = entry(topicId);
    if (item.flushing) return item.flushing;
    const token = generation;
    item.flushing = (async () => {
      await hydrate(topicId);
      if (item.state.value.support !== 'available') return;
      await item.writing.catch(() => undefined);
      for (const operation of [...item.state.value.operations]) {
        if (!current(session, token) || !deps.connected()) return;
        if (!['queued', 'retryable'].includes(operation.status)) continue;
        const command = operation.command;
        let original = deps.message(topicId, command.messageId);
        if (
          !original &&
          !deps.isDeleted?.(topicId, command.messageId) &&
          deps.resolveMessage
        ) {
          try {
            original = await deps.resolveMessage(topicId, command.messageId);
            if (!current(session, token)) return;
            if (original) operation.source = original;
          } catch {
            if (!current(session, token)) return;
            operation.status = 'retryable';
            operation.error =
              'Не удалось проверить исходное сообщение. Текст и команда сохранены.';
            patch(item, { operations: [...item.state.value.operations] });
            await persist(topicId, session).catch(() => undefined);
            continue;
          }
        }
        if (
          !original ||
          original.topicId !== topicId ||
          original.deletedAt ||
          deps.isDeleted?.(topicId, command.messageId)
        ) {
          operation.status = 'failed';
          operation.error =
            'Исходное сообщение больше недоступно. Введённый текст сохранён.';
          patch(item, { operations: [...item.state.value.operations] });
          await persist(topicId, session);
          continue;
        }
        operation.status = 'sending';
        operation.error = undefined;
        patch(item, { operations: [...item.state.value.operations] });
        try {
          await persist(topicId, session);
          if (!current(session, token)) return;
          const ack = await deps.send(topicId, command);
          if (!current(session, token)) return;
          if (
            ack.version !== 1 ||
            ack.commandId !== command.commandId ||
            ack.messageId !== command.messageId ||
            ack.action !== command.action ||
            ack.scope !== command.scope ||
            !ack.commentId ||
            (command.action !== 'PIN' && ack.commentId !== command.commentId) ||
            ack.message?.topicId !== topicId ||
            ack.message.id !== command.messageId ||
            typeof ack.revision !== 'string' ||
            !Array.isArray(ack.comments)
          ) {
            throw new Error('Сервер не подтвердил идентичность команды');
          }
          item.epoch++;
          patch(item, {
            comments: safeComments(ack.comments, topicId, session.ownerId),
            operations: item.state.value.operations.filter(
              value => value.command.commandId !== command.commandId
            ),
            support: 'available'
          });
          const latest = deps.message(topicId, command.messageId);
          if (
            (latest || operation.source) &&
            !latest?.deletedAt &&
            !deps.isDeleted?.(topicId, command.messageId)
          )
            deps.applyMessage(ack.message);
          await persist(topicId, session);
        } catch (error) {
          if (!current(session, token)) return;
          const status = statusOf(error);
          operation.status =
            status === 409
              ? 'conflict'
              : status &&
                  status >= 400 &&
                  status < 500 &&
                  status !== 408 &&
                  status !== 429
                ? 'failed'
                : 'retryable';
          operation.error =
            operation.status === 'conflict'
              ? 'Закрепление или комментарий изменились. Список обновлён, ваш текст сохранён.'
              : operation.status === 'failed'
                ? 'Не удалось сохранить комментарий. Ваш текст сохранён.'
                : 'Нет подтверждения сервера. Повтор использует ту же команду.';
          item.epoch++;
          patch(item, { operations: [...item.state.value.operations] });
          await persist(topicId, session).catch(() => undefined);
          if (
            operation.status === 'conflict' ||
            operation.status === 'failed'
          ) {
            await deps.refreshPins(topicId);
            if (current(session, token)) await refresh(topicId);
          }
        }
      }
    })().finally(() => {
      item.flushing = undefined;
      if (
        current(session, token) &&
        item.state.value.operations.some(value => value.status === 'queued')
      )
        void flush(topicId);
    });
    return item.flushing;
  };
  const enqueue = (topicId: string, command: PinCommentCommand): string => {
    const session = sync();
    const item = entry(topicId);
    const message = deps.message(topicId, command.messageId);
    if (
      !session ||
      !item.state.value.ready ||
      item.state.value.support !== 'available'
    )
      throw new Error('Комментарии пока недоступны');
    if (!message || message.topicId !== topicId || message.deletedAt)
      throw new Error('Сообщение больше недоступно');
    if (pending(topicId, command.messageId))
      throw new Error('Сначала сохраните предыдущий комментарий');
    if (
      'text' in command &&
      (!command.text.trim() || command.text.length > 4000)
    )
      throw new Error('Введите комментарий до 4000 символов');
    if (command.action !== 'PIN') {
      const comment = item.state.value.comments.find(
        value =>
          value.id === command.commentId &&
          value.messageId === command.messageId &&
          value.scope === command.scope
      );
      if (!comment || comment.authorId !== session.ownerId)
        throw new Error('Можно изменять только свой комментарий');
      if (comment.revision !== command.expectedRevision)
        throw new Error('Комментарий изменился. Обновите список');
    }
    const operation: PinCommentOperation = {
      command: structuredClone(command),
      source: JSON.parse(JSON.stringify(message)) as IMessage,
      authorName: deps.authorName(),
      createdAt: new Date().toISOString(),
      status: 'queued'
    };
    item.epoch++;
    patch(item, { operations: [...item.state.value.operations, operation] });
    const token = generation;
    void persist(topicId, session)
      .then(() => {
        if (current(session, token)) void flush(topicId);
      })
      .catch(() => {
        if (!current(session, token)) return;
        operation.status = 'failed';
        operation.error =
          'Не удалось сохранить очередь на устройстве. Команда не отправлена; скопируйте текст.';
        patch(item, { operations: [...item.state.value.operations] });
      });
    return command.commandId;
  };
  const commentsFor = (topicId: string, messageId: string): PinComment[] => {
    const session = sync();
    if (!session) return [];
    const item = entry(topicId);
    if (item.state.value.support === 'unavailable') return [];
    const message =
      deps.message(topicId, messageId) ||
      (deps.isDeleted?.(topicId, messageId)
        ? undefined
        : item.state.value.operations.find(
            operation => operation.command.messageId === messageId
          )?.source);
    if (!message || message.deletedAt) return [];
    let comments = safeComments(
      item.state.value.comments,
      topicId,
      session.ownerId
    ).filter(
      comment =>
        comment.messageId === messageId &&
        (comment.scope === 'SELF'
          ? Boolean(message.isPinnedForMe || message.isPinnedOnlyMe)
          : pinnedInScope(message, comment.scope))
    );
    for (const operation of item.state.value.operations) {
      const command = operation.command;
      if (
        command.messageId !== messageId ||
        !['queued', 'sending', 'retryable'].includes(operation.status)
      )
        continue;
      if (command.action === 'PIN')
        comments.push({
          id: `pending:${command.commandId}`,
          topicId,
          messageId,
          scope: command.scope,
          authorId: session.ownerId,
          authorName: operation.authorName,
          authorAvatarUrl: null,
          text: command.text.trim(),
          revision: 'pending',
          createdAt: operation.createdAt,
          updatedAt: operation.createdAt,
          pending: true
        });
      else if (command.action === 'EDIT')
        comments = comments.map(comment =>
          comment.id === command.commentId
            ? { ...comment, text: command.text.trim(), pending: true }
            : comment
        );
      else
        comments = comments.filter(comment => comment.id !== command.commentId);
    }
    return comments;
  };
  return {
    sessionVersion,
    state: (topicId: string) => entry(topicId).state,
    hydrate,
    refresh: refreshOnce,
    flush,
    pending,
    enqueue,
    commentsFor,
    pin(topicId: string, messageId: string, scope: PinScope, text: string) {
      const message = deps.message(topicId, messageId);
      return enqueue(topicId, {
        commandId: crypto.randomUUID(),
        messageId,
        action: 'PIN',
        scope,
        expectedPinned: message ? pinnedInScope(message, scope) : false,
        text
      });
    },
    projectPins(topicId: string, messages: IMessage[]): IMessage[] {
      const result = new Map(messages.map(message => [message.id, message]));
      for (const operation of entry(topicId).state.value.operations) {
        const command = operation.command;
        if (
          command.action !== 'PIN' ||
          !['queued', 'sending', 'retryable'].includes(operation.status)
        )
          continue;
        const message =
          deps.message(topicId, command.messageId) ||
          (deps.isDeleted?.(topicId, command.messageId)
            ? undefined
            : operation.source);
        if (message && !message.deletedAt)
          result.set(message.id, {
            ...message,
            isPin: command.scope === 'ALL' || message.isPin,
            isPinnedForAll: command.scope === 'ALL' || message.isPinnedForAll,
            isPinnedForMe: true,
            isPinnedOnlyMe:
              command.scope === 'SELF' &&
              !message.isPinnedForAll &&
              !message.isPin
          });
      }
      return [...result.values()].filter(message => !message.deletedAt);
    },
    async retry(topicId: string, commandId: string) {
      const operation = entry(topicId).state.value.operations.find(
        value => value.command.commandId === commandId
      );
      if (operation?.status !== 'retryable') return;
      await flush(topicId);
    },
    async discard(topicId: string, commandId: string) {
      const session = sync();
      if (!session) return;
      const item = entry(topicId);
      const operation = item.state.value.operations.find(
        value => value.command.commandId === commandId
      );
      if (!operation || !['failed', 'conflict'].includes(operation.status))
        return;
      patch(item, {
        operations: item.state.value.operations.filter(
          value => value !== operation
        )
      });
      await persist(topicId, session);
    },
    invalidate(topicId: string) {
      entry(topicId).epoch++;
    },
    reset() {
      generation++;
      active = null;
      entries.clear();
      sessionVersion.value++;
    }
  };
}
