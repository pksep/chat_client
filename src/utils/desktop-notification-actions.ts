export interface DesktopNotificationAction {
  type?: unknown;
  action?: unknown;
  topicId?: unknown;
  topicType?: unknown;
  messageId?: unknown;
  accountId?: unknown;
  replyClientId?: unknown;
  replyText?: unknown;
}

export class DesktopReplyConfirmedError extends Error {
  constructor() {
    super(
      'Ответ отправлен, но не удалось обновить отметку прочтения. Повторно отправлять ответ не нужно.'
    );
  }
}

export const isDesktopMessageAction = (payload: DesktopNotificationAction) =>
  payload.type === 'new_message' &&
  ['like', 'read', 'reply'].includes(String(payload.action));

interface ActionDependencies {
  accountId: () => string | undefined;
  post: (
    path: string,
    body: Record<string, string>
  ) => Promise<Record<string, unknown>>;
  confirmed: (payload: DesktopNotificationAction) => Promise<void>;
}

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export const createDesktopNotificationActionHandler = (
  dependencies: ActionDependencies
) => {
  const operations = new Map<string, Promise<void>>();
  return async (payload: DesktopNotificationAction): Promise<boolean> => {
    if (!isDesktopMessageAction(payload)) return false;
    const accountId = dependencies.accountId();
    if (!accountId || payload.accountId !== accountId) return true;
    if (!isUuid(payload.topicId) || !isUuid(payload.messageId)) return true;
    const { topicId, messageId } = payload;
    const prefix = `/messages/topic/${topicId}`;
    let replyConfirmed = false;
    const key = `${accountId}:${topicId}:${messageId}:${payload.action}:${payload.replyClientId || ''}`;
    const assertOwner = () => {
      if (dependencies.accountId() !== accountId)
        throw new Error(
          'Аккаунт изменился. Откройте чат и повторите действие.'
        );
    };
    const perform = async () => {
      assertOwner();
      if (payload.action === 'reply') {
        const text =
          typeof payload.replyText === 'string' ? payload.replyText.trim() : '';
        if (!text || text.length > 3000)
          throw new Error('Введите ответ длиной от 1 до 3000 символов.');
        if (!isUuid(payload.replyClientId) || payload.replyClientId[14] !== '4')
          throw new Error('Не удалось определить быстрый ответ. Откройте чат.');
        const result = await dependencies.post(`${prefix}/reply`, {
          text,
          clientId: payload.replyClientId,
          replyMessageId: messageId
        });
        assertOwner();
        if (typeof result.id !== 'string' || !result.id)
          throw new Error('Сервер не подтвердил отправку ответа.');
        replyConfirmed = true;
      }
      assertOwner();
      const result = await dependencies.post(
        `${prefix}/${payload.action === 'like' ? 'reaction' : 'read'}`,
        { messageId, ...(payload.action === 'like' ? { emoji: '❤️' } : {}) }
      );
      assertOwner();
      if (result.success !== true)
        throw new Error('Сервер не подтвердил действие уведомления.');
      await dependencies.confirmed(payload);
    };
    let operation = operations.get(key);
    if (!operation) {
      operation = perform().catch(error => {
        operations.delete(key);
        if (replyConfirmed) throw new DesktopReplyConfirmedError();
        throw error;
      });
      operations.set(key, operation);
      if (operations.size > 256)
        operations.delete(operations.keys().next().value!);
    }
    await operation;
    return true;
  };
};
