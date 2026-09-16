export const AI_UNKNOWN_ERROR =
  'При обработке запроса произошла ошибка. Перед повторным действием проверьте, что уже выполнено. Если ошибка повторяется, обратитесь в поддержку.';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;

const isSafeMessage = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 700 &&
  /[А-Яа-яЁё]/u.test(value) &&
  !/сервис временно недоступен/iu.test(value) &&
  !/[{}<>]|Bearer\s|eyJ\w+\.|https?:\/\/|\b(?:stack|toolName|transferToken|idempotencyKey|api[_-]?key)\b/iu.test(
    value
  );

/** Показывает публичное объяснение сервера, а не HTTP-обёртку SDK, JSON или стек ошибки. */
export const getAiErrorMessage = (
  error: unknown,
  fallback = AI_UNKNOWN_ERROR
): string => {
  const record = asRecord(error);
  const body = asRecord(record?.body) || record;
  if (
    typeof body?.code === 'string' &&
    /^(AI_|DAILY_USAGE_)/u.test(body.code) &&
    isSafeMessage(body.userMessage)
  )
    return body.userMessage;
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof record?.message === 'string'
          ? record.message
          : '';
  const status = Number(record?.status || 0);
  if (record?.name === 'AbortError') return 'Запрос был отменён.';
  if (
    /timeout|timed out|deadline exceeded/iu.test(rawMessage) ||
    status === 504
  )
    return 'ИИ не успел ответить за отведённое время. Перед повторным действием проверьте, что уже выполнено.';
  if (
    /network error|failed to fetch|fetch failed|connection/iu.test(rawMessage)
  )
    return 'Не удалось подключиться к ИИ. Проверьте соединение и попробуйте ещё раз.';
  if (
    status === 401 ||
    /authentication required|authentication failed|unauthorized|\b401\b/iu.test(
      rawMessage
    )
  )
    return 'Сессия авторизации истекла. Войдите в систему повторно.';
  if (status === 403 || /access forbidden|\b403\b/iu.test(rawMessage))
    return 'Недостаточно прав для выполнения запроса. Обратитесь к администратору.';
  if (status === 429 || /too many requests|\b429\b/iu.test(rawMessage))
    return 'Достигнут лимит запросов к ИИ. Дождитесь его обновления и повторите запрос.';
  if (status === 413)
    return 'Запрос слишком большой. Можно прикрепить до 10 файлов, каждый размером до 50 МБ.';
  if (/V2 models/iu.test(rawMessage))
    return 'Эта версия модели не поддерживается. Выберите другую модель.';
  if (isSafeMessage(rawMessage)) return rawMessage;
  if (status === 400 || status === 422)
    return 'Не удалось принять запрос. Проверьте текст и вложения; если ошибка повторяется, обратитесь в поддержку.';
  if (
    status >= 500 ||
    /server error|service unavailable|\b5\d\d\b/iu.test(rawMessage)
  )
    return AI_UNKNOWN_ERROR;
  if (/unexpected token|parsing|parse error/iu.test(rawMessage))
    return 'Не удалось прочитать ответ ИИ. Если ошибка повторяется, обратитесь в поддержку.';
  if (/stream/iu.test(rawMessage))
    return 'Получение ответа ИИ прервалось. Перед повторным действием проверьте, что уже выполнено.';
  return fallback;
};
