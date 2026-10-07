import { fetchWithAiAccess } from '../composables/useChatAccess';
/** Ошибка сети при работе с файлами не является ошибкой модели или команды ERP. */
export const fetchAiAttachmentResponse = async (
  url: string,
  init: RequestInit
): Promise<Response> => {
  const timeout = AbortSignal.timeout(30_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  try {
    return await fetchWithAiAccess(url, { ...init, signal });
  } catch {
    if (init.signal?.aborted) throw new Error('Подготовка вложений отменена.');
    if (timeout.aborted)
      throw new Error(
        'Сервер файлов не ответил вовремя. Попробуйте отправить сообщение позже.'
      );
    throw new Error(
      'Не удалось связаться с сервером файлов. Проверьте соединение и повторите отправку.'
    );
  }
};
