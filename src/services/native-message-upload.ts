import { NativeFile, isAndroidNativePlatform } from './native-file-bridge';
import { getConfig } from './useConfig';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import type { IMessage, IMedia } from '../components/interfaces/interfaces';
import { createTelemetryTraceId, recordTelemetryEvent } from './useTelemetry';
import { saveNativeChatBackgroundSyncSession } from './useChatBackgroundSync';

type Attachment = { file: File; isMedia: boolean };
const NATIVE_UPLOAD_CAPABILITY_CACHE_MS = 60_000;
let capabilityCheck: {
  apiUrl: string;
  token: string | null;
  expiresAt: number;
  promise: Promise<boolean>;
} | null = null;
export const getNativeMessageUpload = async (id: string) => {
  if (!isAndroidNativePlatform()) return { status: 'missing' as const };
  try {
    return await NativeFile.getMessageUpload({ id });
  } catch (error) {
    if ((error as { code?: string })?.code === 'UNIMPLEMENTED')
      return { status: 'missing' as const };
    throw error;
  }
};

export const cancelNativeMessageUpload = async (id: string): Promise<void> => {
  if (isAndroidNativePlatform()) await NativeFile.cancelMessageUpload({ id });
};

export const retryNativeMessageUpload = async (id: string): Promise<void> => {
  await NativeFile.retryMessageUpload({ id });
};

export const canUseNativeMessageUpload = async (): Promise<boolean> => {
  if (!isAndroidNativePlatform()) return false;
  try {
    if ((await NativeFile.getMessageUploadCapabilities()).version !== 1)
      return false;
    const apiUrl = getConfig().CHAT_API_DOMAIN.replace(/\/+$/, '');
    const token = getAuthToken() || getStoredChatAccessToken();
    if (
      capabilityCheck?.apiUrl === apiUrl &&
      capabilityCheck.token === token &&
      capabilityCheck.expiresAt > Date.now()
    ) {
      return capabilityCheck.promise;
    }

    const check = {
      apiUrl,
      token,
      expiresAt: Infinity,
      promise: Promise.resolve(false)
    };
    capabilityCheck = check;
    check.promise = (async () => {
      try {
        const response = await fetch(
          `${apiUrl}/messages/native-upload-capabilities`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000)
          }
        );
        const supported = response.ok && (await response.json()).version === 1;
        // Кратко сохраняем только ответ о протоколе; сбой сети или авторизации не кешируем.
        if (response.ok || [404, 405, 501].includes(response.status)) {
          check.expiresAt = Date.now() + NATIVE_UPLOAD_CAPABILITY_CACHE_MS;
        } else if (capabilityCheck === check) {
          capabilityCheck = null;
        }
        return supported;
      } catch {
        if (capabilityCheck === check) capabilityCheck = null;
        return false;
      }
    })();
    return check.promise;
  } catch {
    return false;
  }
};

const chunkToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const sendNativeMessageUpload = async (
  message: IMessage,
  attachments: Attachment[],
  onProgress: (index: number, percent: number) => void
): Promise<IMessage> => {
  const id = message.id;
  const traceId = createTelemetryTraceId('native-upload');
  const record = (stage: string) =>
    recordTelemetryEvent({
      category: 'upload',
      name: `upload.native_message.${stage}`,
      traceId,
      entityType: 'message',
      entityId: id,
      payload: { topicId: message.topicId, fileCount: attachments.length }
    });
  record('staging');
  await saveNativeChatBackgroundSyncSession({
    userId: message.senderUserId,
    token: getAuthToken() || getStoredChatAccessToken(),
    apiUrl: getConfig().CHAT_API_DOMAIN
  });
  const prepared = await NativeFile.prepareMessageUpload({
    id,
    userId: message.senderUserId,
    apiUrl: getConfig().CHAT_API_DOMAIN.replace(/\/+$/, ''),
    traceId,
    message: {
      topicId: message.topicId,
      text: message.text || '',
      ex: message.ex,
      replyMessageId: message.replyMessageId || undefined,
      taggedUserIds: message.taggedUserIds
    },
    files: attachments.map(({ file, isMedia }, index) => ({
      originName: file.name,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      isMedia,
      type: message.media[index].type,
      ex: message.media[index].ex
    }))
  });
  if (prepared.status === 'staging') {
    for (const [index, { file }] of attachments.entries()) {
      for (let offset = 0; offset < file.size; offset += 1024 * 1024) {
        await NativeFile.stageMessageUploadChunk({
          id,
          index,
          offset,
          base64: await chunkToBase64(file.slice(offset, offset + 1024 * 1024))
        });
      }
    }
    await NativeFile.enqueueMessageUpload({ id });
  }
  record('enqueued');
  // После передачи в Android WebView только наблюдает; Worker сам отправляет сообщение.
  for (;;) {
    const status = await getNativeMessageUpload(id);
    if (status.status === 'completed' && status.message) {
      record('completed');
      return normalizeNativeUploadMessage(status.message);
    }
    if (
      status.status === 'failed' ||
      status.status === 'missing' ||
      status.status === 'cancelled'
    ) {
      record('failed');
      throw new Error(status.error || 'Фоновая отправка не завершена');
    }
    onProgress(status.fileIndex || 0, status.percent || 0);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

export const normalizeNativeUploadMessage = (value: unknown): IMessage => {
  const message = value as IMessage;
  return {
    ...message,
    createdAt: new Date(message.createdAt),
    updatedAt: message.updatedAt ? new Date(message.updatedAt) : null,
    ex:
      typeof message.ex === 'string' ? message.ex : JSON.stringify(message.ex),
    media: (message.media || []).map((media: IMedia) => ({
      ...media,
      isLoading: false,
      uploadError: false
    }))
  };
};
