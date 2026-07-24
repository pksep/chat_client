import { MessageTypeEnum } from '@pksep/yui';
import { reactive } from 'vue';
import { authedUser } from '../composables/useAuth';
import {
  showErrorNotification,
  showNotification
} from '../composables/useNotifications';
import { getChatSDK, sendMessageChat, waitForChatSDK } from './useChat';
import { useChatApi } from './useApi';
import { WebSocketEventType } from './useChatSDK/websocketEvents';

export type CallSummaryStatus =
  | 'STARTING'
  | 'RECORDING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export interface CallSummaryDto {
  id: string;
  roomId: string;
  topicId: string;
  recorderUserId: string;
  status: CallSummaryStatus;
  videoStatus: CallSummaryStatus;
  videoAvailable: boolean;
  summary?: string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}

const summariesByTopic = reactive<Record<string, CallSummaryDto | undefined>>(
  {}
);
const loadingTopicIds = reactive(new Set<string>());
const startingRoomIds = reactive(new Set<string>());
const recordingRoomIds = reactive(new Set<string>());
let subscribedSdk: ReturnType<typeof getChatSDK> = null;
let subscriptionPromise: Promise<void> | null = null;

const readResponse = async <T>(response: unknown): Promise<T> => {
  if (response instanceof Response) {
    if (!response.ok) {
      let message = `Ошибка ${response.status}`;
      try {
        const payload = (await response.json()) as {
          message?: string | string[];
        };
        message = Array.isArray(payload.message)
          ? payload.message.join(', ')
          : payload.message || message;
      } catch {
        // Ответ без JSON оставляем с кодом HTTP.
      }
      throw new Error(message);
    }

    return (await response.json()) as T;
  }

  return response as T;
};

const applySummaryStatus = (summary: CallSummaryDto): void => {
  recordingRoomIds.delete(summary.roomId);
  startingRoomIds.delete(summary.roomId);

  if (summary.status === 'STARTING' || summary.status === 'RECORDING') {
    recordingRoomIds.add(summary.roomId);
  }

  summariesByTopic[summary.topicId] = summary;
};

const bindSocketEvents = async (): Promise<void> => {
  const sdk = await waitForChatSDK();
  if (!sdk || sdk === subscribedSdk) {
    return;
  }

  subscribedSdk = sdk;
  sdk.subscribeToEvent(
    WebSocketEventType.CALL_SUMMARY_STATUS,
    ({ payload }) => {
      applySummaryStatus(payload);

      const isProcessing = [payload.status, payload.videoStatus].some(status =>
        ['STARTING', 'RECORDING', 'PROCESSING'].includes(status)
      );
      const hasMaterials =
        payload.videoAvailable ||
        (payload.status === 'READY' && !!payload.summary);

      if (!isProcessing && hasMaterials) {
        showNotification({
          title: 'Материалы звонка готовы',
          description: 'Материалы доступны на странице звонков',
          type: MessageTypeEnum.success
        });
      } else if (
        !isProcessing &&
        payload.status === 'FAILED' &&
        payload.videoStatus === 'FAILED'
      ) {
        showErrorNotification('Не удалось подготовить материалы звонка');
      }
    }
  );
  sdk.subscribeToEvent(
    WebSocketEventType.CALL_SUMMARY_RECORDING_STARTED,
    ({ payload }) => {
      recordingRoomIds.add(payload.roomId);
      showNotification({
        title: 'Запись звонка',
        description:
          payload.recorderUserId === authedUser.value?.id
            ? 'Запись звонка включена'
            : 'Участник включил запись звонка',
        type: MessageTypeEnum.info
      });
    }
  );
};

const ensureSocketEvents = (): void => {
  if (!subscriptionPromise) {
    subscriptionPromise = bindSocketEvents().finally(() => {
      subscriptionPromise = null;
    });
  }
};

export const loadLatestCallSummary = async (
  topicId: string,
  roomId?: string | null
): Promise<CallSummaryDto | null> => {
  ensureSocketEvents();

  const cacheKey = roomId || topicId;

  if (!cacheKey || loadingTopicIds.has(cacheKey)) {
    return summariesByTopic[cacheKey] || null;
  }

  loadingTopicIds.add(cacheKey);
  try {
    const api = useChatApi();
    const query = roomId
      ? `roomId=${encodeURIComponent(roomId)}`
      : `topicId=${encodeURIComponent(topicId)}`;
    const response = await api.get(`/calls/summaries/latest?${query}`, {
      parsed: false
    });
    const summary = await readResponse<CallSummaryDto | null>(response);

    if (summary) {
      applySummaryStatus(summary);
    } else {
      delete summariesByTopic[cacheKey];
    }

    return summary;
  } catch (error) {
    console.error('[CallSummary] Failed to load summary:', error);
    return null;
  } finally {
    loadingTopicIds.delete(cacheKey);
  }
};

export const startCallSummaryRecording = async (
  roomId: string,
  topicId: string
): Promise<boolean> => {
  ensureSocketEvents();

  if (!roomId || !topicId || startingRoomIds.has(roomId)) {
    return false;
  }

  startingRoomIds.add(roomId);
  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/${encodeURIComponent(roomId)}/summary-recording`,
      {},
      { parsed: false }
    );
    const summary = await readResponse<CallSummaryDto>(response);
    applySummaryStatus(summary);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  } finally {
    startingRoomIds.delete(roomId);
  }
};

export const getCallSummary = (
  topicId?: string | null
): CallSummaryDto | null => {
  if (!topicId) {
    return null;
  }
  return summariesByTopic[topicId] || null;
};

export const isCallSummaryRecording = (roomId?: string | null): boolean =>
  !!roomId && (recordingRoomIds.has(roomId) || startingRoomIds.has(roomId));

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Не удалось подготовить файл'));
        return;
      }
      resolve(reader.result.split(',')[1] || '');
    };
    reader.onerror = () => reject(reader.error || new Error('Ошибка файла'));
    reader.readAsDataURL(blob);
  });

export const downloadCallSummary = async (
  summary: CallSummaryDto
): Promise<boolean> => {
  if (!summary.summary) {
    return false;
  }

  try {
    const createdAt = new Date(summary.createdAt);
    const date = Number.isNaN(createdAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : createdAt.toISOString().slice(0, 10);
    const filename = `Расшифровка-звонка-${date}.txt`;
    const content = `Расшифровка звонка от ${date}\n\n${summary.summary}\n`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const nativeBridge = window.__CHAT_NATIVE_FILE__;

    if (nativeBridge?.isAndroidNativePlatform()) {
      await nativeBridge.downloadBase64({
        base64Data: await blobToBase64(blob),
        fileName: filename,
        mimeType: 'text/plain'
      });
      return true;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const downloadCallRecording = async (
  summary: CallSummaryDto
): Promise<boolean> => {
  if (!summary.videoAvailable) {
    return false;
  }

  try {
    const api = useChatApi();
    const response = await api.get(
      `/calls/summaries/${encodeURIComponent(summary.id)}/video`,
      { parsed: false }
    );
    const { url, filename } = await readResponse<{
      url: string;
      filename: string;
    }>(response);
    const nativeBridge = window.__CHAT_NATIVE_FILE__;

    if (nativeBridge?.isAndroidNativePlatform()) {
      await nativeBridge.downloadFile({
        url,
        fileName: filename,
        mimeType: 'video/mp4'
      });
      return true;
    }

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const sendCallSummaryToChat = async (
  summary: CallSummaryDto
): Promise<boolean> => {
  if (!summary.summary) {
    return false;
  }

  const sent = await sendMessageChat({
    topicId: summary.topicId,
    text: `Расшифровка звонка\n\n${summary.summary}`
  });

  if (sent) {
    showNotification({
      title: 'Расшифровка отправлена',
      description: 'Расшифровка добавлена в чат',
      type: MessageTypeEnum.success
    });
  } else {
    showErrorNotification('Не удалось отправить расшифровку в чат');
  }

  return sent;
};
