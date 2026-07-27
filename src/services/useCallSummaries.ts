import { MessageTypeEnum } from '@pksep/yui';
import { reactive } from 'vue';
import { authedUser, getStoredChatAccessToken } from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
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
  recorderName?: string | null;
  status: CallSummaryStatus;
  videoStatus: CallSummaryStatus;
  videoAvailable: boolean;
  summary?: string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}

export interface CallSummaryRecorderDto {
  roomId: string;
  topicId: string;
  recorderUserId: string;
  recorderName?: string | null;
}

const summariesByTopic = reactive<Record<string, CallSummaryDto | undefined>>(
  {}
);
const loadingTopicIds = reactive(new Set<string>());
const startingRoomIds = reactive(new Set<string>());
const activeRecordersByRoom = reactive<
  Record<string, Record<string, CallSummaryRecorderDto>>
>({});
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

    if (response.status === 204) {
      return null as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  }

  return response as T;
};

const upsertActiveRecorder = (recorder: CallSummaryRecorderDto): void => {
  if (!recorder.roomId || !recorder.recorderUserId) {
    return;
  }

  activeRecordersByRoom[recorder.roomId] ||= {};
  activeRecordersByRoom[recorder.roomId][recorder.recorderUserId] = recorder;
};

const removeActiveRecorder = (roomId: string, recorderUserId: string): void => {
  const roomRecorders = activeRecordersByRoom[roomId];
  if (!roomRecorders) {
    return;
  }

  delete roomRecorders[recorderUserId];
  if (!Object.keys(roomRecorders).length) {
    delete activeRecordersByRoom[roomId];
  }
};

const setActiveRecordersForRoom = (
  roomId: string,
  recorders: CallSummaryRecorderDto[]
): void => {
  const nextRecorders: Record<string, CallSummaryRecorderDto> = {};
  recorders.forEach(recorder => {
    if (recorder.recorderUserId) {
      nextRecorders[recorder.recorderUserId] = recorder;
    }
  });

  if (Object.keys(nextRecorders).length) {
    activeRecordersByRoom[roomId] = nextRecorders;
  } else {
    delete activeRecordersByRoom[roomId];
  }
};

const decodeJwtPayload = (token?: string | null): Record<string, unknown> => {
  if (!token) {
    return {};
  }

  const payload = token.split('.')[1];
  if (!payload) {
    return {};
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(atob(normalizedPayload)) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const getCurrentUserIdentifiers = (): Set<string> => {
  const identifiers = new Set<string>();
  const user = authedUser.value as
    | (Record<string, unknown> & {
        id?: unknown;
      })
    | null;

  [user?.id, user?.userId, user?.chatId, user?.chatUserId, user?.uuid].forEach(
    value => {
      if (value !== undefined && value !== null) {
        identifiers.add(String(value));
      }
    }
  );

  const tokenPayload = decodeJwtPayload(
    getAuthToken() || getStoredChatAccessToken()
  );
  [tokenPayload.id, tokenPayload.sub, tokenPayload.userId].forEach(value => {
    if (value !== undefined && value !== null) {
      identifiers.add(String(value));
    }
  });

  return identifiers;
};

const isCurrentUserRecorder = (recorderUserId?: string | null): boolean =>
  !!recorderUserId && getCurrentUserIdentifiers().has(recorderUserId);

const applySummaryStatus = (summary: CallSummaryDto): void => {
  startingRoomIds.delete(summary.roomId);

  if (summary.status === 'STARTING' || summary.status === 'RECORDING') {
    upsertActiveRecorder({
      roomId: summary.roomId,
      topicId: summary.topicId,
      recorderUserId: summary.recorderUserId,
      recorderName: summary.recorderName
    });
  } else {
    removeActiveRecorder(summary.roomId, summary.recorderUserId);
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
      upsertActiveRecorder(payload);
      showNotification({
        title: 'Запись звонка',
        description: isCurrentUserRecorder(payload.recorderUserId)
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

export const loadActiveCallSummaryRecorders = async (
  roomId?: string | null
): Promise<CallSummaryRecorderDto[]> => {
  ensureSocketEvents();

  if (!roomId) {
    return [];
  }

  try {
    const api = useChatApi();
    const response = await api.get(
      `/calls/${encodeURIComponent(roomId)}/summary-recordings`,
      { parsed: false }
    );
    const recorders = await readResponse<CallSummaryRecorderDto[]>(response);
    setActiveRecordersForRoom(roomId, recorders);
    return recorders;
  } catch (error) {
    console.error('[CallSummary] Failed to load active recorders:', error);
    return Object.values(activeRecordersByRoom[roomId] || {});
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

  if (
    !roomId ||
    !topicId ||
    startingRoomIds.has(roomId) ||
    isCallSummaryRecording(roomId)
  ) {
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
  !!roomId &&
  (startingRoomIds.has(roomId) ||
    Object.values(activeRecordersByRoom[roomId] || {}).some(recorder =>
      isCurrentUserRecorder(recorder.recorderUserId)
    ));

export const isAnyCallSummaryRecording = (roomId?: string | null): boolean =>
  !!roomId && Object.keys(activeRecordersByRoom[roomId] || {}).length > 0;

export const getCallSummaryRecordingNotice = (
  roomId?: string | null
): string => {
  if (!roomId) {
    return '';
  }

  const recorders = Object.values(activeRecordersByRoom[roomId] || {});
  if (!recorders.length) {
    return '';
  }

  if (
    recorders.some(recorder => isCurrentUserRecorder(recorder.recorderUserId))
  ) {
    return recorders.length > 1
      ? `Вы и ещё ${recorders.length - 1} участник записываете звонок`
      : 'Вы записываете звонок';
  }

  const firstRecorder = recorders[0];
  const recorderName = firstRecorder.recorderName?.trim() || 'Участник';

  return recorders.length > 1
    ? `${recorderName} и ещё ${recorders.length - 1} участник записывают звонок`
    : `${recorderName} записывает звонок`;
};

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
