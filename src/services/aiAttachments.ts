import {
  ensureAuthorizedResponse,
  getStoredChatAccessToken
} from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';
import { validateAiAttachments } from './aiAttachmentLimits';
import { getAiErrorMessage } from './aiErrorMessages';
import { fetchAiAttachmentResponse } from './aiAttachmentTransport';
import {
  parseAiAttachmentReferences,
  parseAiMessageAttachments,
  type AiMessageAttachment,
  mergeRefreshedAiAttachments,
  type AiAttachmentReference
} from './aiAttachmentReferences';
export type { AiAttachmentReference } from './aiAttachmentReferences';

interface AiAttachmentUploadTarget {
  uploadUrl: string;
  attachmentToken: string;
}

interface AiAttachmentUploadError extends Error {
  status?: number;
}

/** Формирует адрес защищённого API временных вложений чата. */
const getAiAttachmentsUrl = (path: string): string => {
  const baseUrl = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Сервер чата не настроен');
  return `${baseUrl}/media/ai-attachments/${path}`;
};

/** Возвращает заголовки авторизованного запроса к серверу чата. */
const getHeaders = (): HeadersInit => {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token) throw new Error('Требуется авторизация');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

/** Извлекает понятное сообщение из ошибочного HTTP-ответа. */
const readError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return getAiErrorMessage({
      status: response.status,
      body,
      message: body?.message || body?.error
    });
  } catch {
    return getAiErrorMessage({ status: response.status });
  }
};

/** Возвращает публичный адрес API для серверной ссылки загрузки, даже если сервер выдал внутренний домен. */
const normalizeChatUploadUrl = (uploadUrl: string): string => {
  const configuredApiUrl = getConfig().CHAT_API_DOMAIN?.trim();
  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : 'http://localhost/';

  if (!configuredApiUrl) return uploadUrl;

  try {
    const apiUrl = new URL(configuredApiUrl, pageUrl);
    const targetUrl = new URL(uploadUrl, apiUrl);
    const uploadPathMarker = '/media/encrypted-upload/';
    const markerIndex = targetUrl.pathname.indexOf(uploadPathMarker);

    // Подписанные ссылки MinIO нельзя переписывать: их домен участвует в подписи.
    if (markerIndex < 0) return targetUrl.toString();

    const apiPath = apiUrl.pathname.replace(/\/+$/, '');
    const uploadPath = targetUrl.pathname.slice(markerIndex);
    targetUrl.protocol = apiUrl.protocol;
    targetUrl.host = apiUrl.host;
    targetUrl.pathname = `${apiPath}${uploadPath}`.replace(/\/{2,}/g, '/');

    return targetUrl.toString();
  } catch {
    return uploadUrl;
  }
};

/** Выполняет одну попытку загрузки файла по подготовленному адресу. */
const uploadToStorageUrl = (uploadUrl: string, file: File): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader(
      'Content-Type',
      file.type || 'application/octet-stream'
    );
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        const error = new Error(
          request.status === 413
            ? 'Файл превышает допустимый размер 50 МБ. Уменьшите файл и прикрепите его заново.'
            : 'Не удалось загрузить файл в хранилище. Прикрепите его заново; если ошибка повторяется, обратитесь к администратору.'
        ) as AiAttachmentUploadError;
        error.status = request.status;
        reject(error);
      }
    };
    request.onerror = () =>
      reject(new Error('Сервер загрузки вложений недоступен'));
    request.onabort = () => reject(new Error('Загрузка вложения отменена'));
    request.send(file);
  });

/** Загружает файл с резервной попыткой по исходному адресу, если публичный адрес API отличается. */
const uploadToStorage = async (
  uploadUrl: string,
  file: File
): Promise<void> => {
  const normalizedUrl = normalizeChatUploadUrl(uploadUrl);
  const candidates = [...new Set([normalizedUrl, uploadUrl])];
  let reportedError: Error | null = null;

  for (const candidate of candidates) {
    try {
      await uploadToStorageUrl(candidate, file);
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        (!reportedError ||
          typeof (error as AiAttachmentUploadError).status === 'number')
      ) {
        reportedError = error;
      }
    }
  }

  throw reportedError || new Error('Не удалось загрузить вложение');
};

/** Подготавливает одно вложение для агента и возвращает ограниченную по времени ссылку. */
export const stageAiAttachment = async (
  file: File
): Promise<AiAttachmentReference> => {
  validateAiAttachments([file]);
  const targetResponse = ensureAuthorizedResponse(
    await fetchAiAttachmentResponse(getAiAttachmentsUrl('upload-target'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        originName: file.name,
        size: file.size,
        contentType: file.type || undefined,
        isMedia: false
      })
    })
  );
  if (!targetResponse.ok) throw new Error(await readError(targetResponse));
  const target = (await targetResponse.json()) as AiAttachmentUploadTarget;

  await uploadToStorage(target.uploadUrl, file);

  const completeResponse = ensureAuthorizedResponse(
    await fetchAiAttachmentResponse(getAiAttachmentsUrl('complete'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ attachmentToken: target.attachmentToken })
    })
  );
  if (!completeResponse.ok) throw new Error(await readError(completeResponse));
  return parseAiAttachmentReferences([await completeResponse.json()])[0];
};

/** Продлевает доступ к сохранённым файлам, не загружая их повторно и не меняя порядок. */
export const refreshAiAttachments = async (
  files: AiMessageAttachment[],
  signal?: AbortSignal
): Promise<AiAttachmentReference[]> => {
  const original = parseAiMessageAttachments(files);
  const ids = [
    ...new Set(
      original.flatMap(file => (file.attachmentId ? [file.attachmentId] : []))
    )
  ];
  if (!ids.length) return mergeRefreshedAiAttachments(original, []);
  const response = ensureAuthorizedResponse(
    await fetchAiAttachmentResponse(getAiAttachmentsUrl('refresh'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ attachmentIds: ids }),
      signal
    })
  );
  if (!response.ok) {
    if ([404, 410].includes(response.status))
      throw new Error(
        'Одно из вложений больше недоступно. Прикрепите его заново. Список файлов и ранее выполненные действия сохраняются.'
      );
    throw new Error(await readError(response));
  }
  const body = await response.json();
  return mergeRefreshedAiAttachments(original, body.attachments);
};

/** Параллельно подготавливает все вложения текущего сообщения для агента. */
export const stageAiAttachments = async (
  files: File[]
): Promise<AiAttachmentReference[]> => {
  validateAiAttachments(files);
  return Promise.all(files.map(stageAiAttachment));
};
