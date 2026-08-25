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

const getAiAttachmentsUrl = (path: string): string => {
  const baseUrl = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Сервер чата не настроен');
  return `${baseUrl}/media/ai-attachments/${path}`;
};

const getHeaders = (): HeadersInit => {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token) throw new Error('Требуется авторизация');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};

const readError = async (response: Response): Promise<string> => {
  try {
    const body = await response.json();
    return body?.message || body?.error || `Ошибка ${response.status}`;
  } catch {
    return `Ошибка ${response.status}`;
  }
};

const uploadToStorage = (uploadUrl: string, file: File): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    if (file.type) request.setRequestHeader('Content-Type', file.type);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error('Не удалось загрузить вложение'));
    };
    request.onerror = () => reject(new Error('Не удалось загрузить вложение'));
    request.send(file);
  });

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

export const stageAiAttachments = (
  files: File[]
): Promise<AiAttachmentReference[]> =>
  Promise.all(files.map(stageAiAttachment));
