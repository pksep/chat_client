import {
  ensureAuthorizedResponse,
  getStoredChatAccessToken
} from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';

export interface AiAttachmentReference {
  name: string;
  size: number;
  contentType: string;
  transferToken: string;
  expiresAt: number;
}

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
    return body?.message || body?.error || `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
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

/** Извлекает короткую причину отказа хранилища без вывода служебной HTML-страницы целиком. */
const getUploadResponseDetails = (request: XMLHttpRequest): string => {
  const responseText = request.responseText?.replace(/\s+/g, ' ').trim();
  if (!responseText) return '';
  return responseText.slice(0, 200);
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
        const details = getUploadResponseDetails(request);
        const error = new Error(
          `Не удалось загрузить вложение (HTTP ${request.status}${
            details ? `: ${details}` : ''
          })`
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
  const targetResponse = ensureAuthorizedResponse(
    await fetch(getAiAttachmentsUrl('upload-target'), {
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
    await fetch(getAiAttachmentsUrl('complete'), {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ attachmentToken: target.attachmentToken })
    })
  );
  if (!completeResponse.ok) throw new Error(await readError(completeResponse));
  return (await completeResponse.json()) as AiAttachmentReference;
};

/** Параллельно подготавливает все вложения текущего сообщения для агента. */
export const stageAiAttachments = (
  files: File[]
): Promise<AiAttachmentReference[]> =>
  Promise.all(files.map(stageAiAttachment));
