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
  topicId: string | null;
  recorderUserId: string;
  recorderName?: string | null;
  status: CallSummaryStatus;
  videoStatus: CallSummaryStatus;
  videoAvailable: boolean;
  hasTranscript?: boolean;
  transcript?: string | null;
  errorMessage?: string | null;
  videoErrorMessage?: string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}

export interface CallSummaryRecorderDto {
  summaryId?: string | null;
  roomId: string;
  topicId: string | null;
  recorderUserId: string;
  recorderName?: string | null;
}

interface CallGeneratedMaterialDto {
  text?: string | null;
  found?: boolean;
}

export type CallTopicPromptPlaceholderKind = 'choose-actions' | 'not-recorded';

const summariesByTopic = reactive<Record<string, CallSummaryDto | undefined>>(
  {}
);
const loadingTopicIds = reactive(new Set<string>());
const startingRoomIds = reactive(new Set<string>());
const stoppingRoomIds = reactive(new Set<string>());
const materialTypingCountsByTopic = reactive<Record<string, number>>({});
const notifiedRecordingSummaryIds = new Set<string>();
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

const removeActiveRecorder = (
  roomId: string,
  recorderUserId: string,
  summaryId?: string | null
): void => {
  const roomRecorders = activeRecordersByRoom[roomId];
  if (!roomRecorders) {
    return;
  }

  const currentRecorder = roomRecorders[recorderUserId];
  if (
    summaryId &&
    currentRecorder?.summaryId &&
    currentRecorder.summaryId !== summaryId
  ) {
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
  if (summary.status === 'STARTING') {
    startingRoomIds.add(summary.roomId);
    removeActiveRecorder(summary.roomId, summary.recorderUserId, summary.id);
  } else if (summary.status === 'RECORDING') {
    startingRoomIds.delete(summary.roomId);
    upsertActiveRecorder({
      summaryId: summary.id,
      roomId: summary.roomId,
      topicId: summary.topicId,
      recorderUserId: summary.recorderUserId,
      recorderName: summary.recorderName
    });
  } else {
    startingRoomIds.delete(summary.roomId);
    removeActiveRecorder(summary.roomId, summary.recorderUserId, summary.id);
  }

  if (summary.topicId) {
    summariesByTopic[summary.topicId] = summary;
  }
  summariesByTopic[summary.roomId] = summary;
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
      const summaryPayload = payload as CallSummaryDto;
      applySummaryStatus(summaryPayload);

      const isProcessing = [
        summaryPayload.status,
        summaryPayload.videoStatus
      ].some(status =>
        ['STARTING', 'RECORDING', 'PROCESSING'].includes(status)
      );
      const hasMaterials =
        summaryPayload.videoAvailable ||
        Boolean(summaryPayload.transcript || summaryPayload.hasTranscript);

      if (!isProcessing && hasMaterials) {
        showNotification({
          title: 'Материалы звонка готовы',
          description: 'Материалы доступны на странице звонков',
          type: MessageTypeEnum.success
        });
      } else if (
        !isProcessing &&
        summaryPayload.status === 'FAILED' &&
        summaryPayload.videoStatus === 'FAILED' &&
        !isAnyCallSummaryRecording(summaryPayload.roomId)
      ) {
        showErrorNotification(
          summaryPayload.errorMessage ||
            summaryPayload.videoErrorMessage ||
            'Не удалось подготовить материалы звонка'
        );
      }
    }
  );
  sdk.subscribeToEvent(
    WebSocketEventType.CALL_SUMMARY_RECORDING_STARTED,
    ({ payload }) => {
      upsertActiveRecorder(payload);

      if (payload.summaryId) {
        if (notifiedRecordingSummaryIds.has(payload.summaryId)) {
          return;
        }
        notifiedRecordingSummaryIds.add(payload.summaryId);
      }

      const recorderName = payload.recorderName?.trim();
      showNotification({
        title: 'Запись звонка',
        description: isCurrentUserRecorder(payload.recorderUserId)
          ? 'Запись звонка включена'
          : recorderName
            ? `${recorderName} включил запись звонка`
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
  roomId: string
): Promise<boolean> => {
  ensureSocketEvents();

  if (
    !roomId ||
    startingRoomIds.has(roomId) ||
    stoppingRoomIds.has(roomId) ||
    isAnyCallSummaryRecording(roomId)
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
    if (summariesByTopic[roomId]?.status !== 'STARTING') {
      startingRoomIds.delete(roomId);
    }
  }
};

export const stopCallSummaryRecording = async (
  roomId: string
): Promise<boolean> => {
  ensureSocketEvents();

  if (
    !roomId ||
    stoppingRoomIds.has(roomId) ||
    !isCallSummaryRecording(roomId)
  ) {
    return false;
  }

  stoppingRoomIds.add(roomId);
  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/${encodeURIComponent(roomId)}/summary-recording/stop`,
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
    stoppingRoomIds.delete(roomId);
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

export const isCallSummaryRecordingPending = (
  roomId?: string | null
): boolean =>
  !!roomId && (startingRoomIds.has(roomId) || stoppingRoomIds.has(roomId));

export const isCallSummaryRecordingStarting = (
  roomId?: string | null
): boolean => !!roomId && startingRoomIds.has(roomId);

export const getCallSummaryRecordingNotice = (
  roomId?: string | null
): string => {
  if (!roomId) {
    return '';
  }

  if (startingRoomIds.has(roomId)) {
    return 'Начинается запись...';
  }

  if (stoppingRoomIds.has(roomId)) {
    return 'Останавливаем запись...';
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

const normalizeCallSummaryText = (value: string): string =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

const getCallSummaryLines = (value: string): string[] =>
  normalizeCallSummaryText(value)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

const findSummaryHeaderIndex = (lines: string[]): number => {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^(суммари|краткое содержание|итоги)$/i.test(lines[index])) {
      return index;
    }
  }

  return -1;
};

export const extractCallSummaryBrief = (summaryText: string): string => {
  const lines = getCallSummaryLines(summaryText);
  const summaryHeaderIndex = findSummaryHeaderIndex(lines);

  if (summaryHeaderIndex >= 0 && summaryHeaderIndex < lines.length - 1) {
    return lines
      .slice(summaryHeaderIndex + 1)
      .join('\n')
      .trim();
  }

  return normalizeCallSummaryText(summaryText);
};

export const extractCallTranscriptText = (summaryText: string): string => {
  const lines = getCallSummaryLines(summaryText);
  const summaryHeaderIndex = findSummaryHeaderIndex(lines);

  if (summaryHeaderIndex > 0) {
    return lines.slice(0, summaryHeaderIndex).join('\n').trim();
  }

  return normalizeCallSummaryText(summaryText);
};

export const extractCallActionList = (summaryText: string): string => {
  const lines = getCallSummaryLines(extractCallSummaryBrief(summaryText));
  const actionHeaderRegex =
    /^(?:#+\s*)?(?:список\s+)?(?:действия(?:\s+и\s+договор[её]нности)?|договор[её]нности|задачи|план\s+действий|action\s+items?|actions)\s*:?\s*(.*)$/i;
  const nextSectionHeaderRegex =
    /^(?:#+\s*)?(?:запись\s+\d+(?:\s+\[[^\]]+\])?|участники|ключевые\s+моменты|суммари|краткое\s+содержание|итоги|транскрибация)\s*:?\s*$/i;
  const actionLines: string[] = [];
  let isReadingActionBlock = false;

  for (const line of lines) {
    const actionHeaderMatch = line.match(actionHeaderRegex);

    if (actionHeaderMatch) {
      isReadingActionBlock = true;
      const inlineAction = actionHeaderMatch[1]?.trim();
      if (inlineAction) {
        actionLines.push(inlineAction);
      }
      continue;
    }

    if (isReadingActionBlock && nextSectionHeaderRegex.test(line)) {
      isReadingActionBlock = false;
      continue;
    }

    if (isReadingActionBlock) {
      actionLines.push(line);
    }
  }

  return actionLines.join('\n').trim();
};

export const downloadCallTranscript = async (
  summary: CallSummaryDto
): Promise<boolean> => {
  if (!summary.transcript) {
    return false;
  }

  try {
    const createdAt = new Date(summary.createdAt);
    const date = Number.isNaN(createdAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : createdAt.toISOString().slice(0, 10);
    const transcriptText = extractCallTranscriptText(summary.transcript);
    const filename = `Транскрибация-звонка-${date}.txt`;
    const content = `Транскрибация звонка от ${date}\n\n${transcriptText}\n`;
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

export const generateCallSummaryBrief = async (
  summary: CallSummaryDto
): Promise<string> => {
  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/summaries/${encodeURIComponent(summary.id)}/brief`,
      {},
      { parsed: false }
    );
    const payload = await readResponse<CallGeneratedMaterialDto>(response);

    return payload.text?.trim() || '';
  } catch (error) {
    showErrorNotification(error);
    return '';
  }
};

export const generateCallActionList = async (
  summary: CallSummaryDto
): Promise<string> => {
  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/summaries/${encodeURIComponent(summary.id)}/actions`,
      {},
      { parsed: false }
    );
    const payload = await readResponse<CallGeneratedMaterialDto>(response);

    return payload.found === false ? '' : payload.text?.trim() || '';
  } catch (error) {
    showErrorNotification(error);
    return '';
  }
};

export const withCallSummaryTyping = async <T>(
  targetTopicId: string,
  action: () => Promise<T>
): Promise<T> => {
  let trackedTypingTopicId = '';

  if (targetTopicId) {
    trackedTypingTopicId = targetTopicId;
    materialTypingCountsByTopic[targetTopicId] =
      (materialTypingCountsByTopic[targetTopicId] || 0) + 1;
  }

  try {
    return await action();
  } finally {
    if (trackedTypingTopicId) {
      const nextCount =
        (materialTypingCountsByTopic[trackedTypingTopicId] || 1) - 1;
      if (nextCount > 0) {
        materialTypingCountsByTopic[trackedTypingTopicId] = nextCount;
      } else {
        delete materialTypingCountsByTopic[trackedTypingTopicId];
      }
    }
  }
};

export const isCallSummaryMaterialTypingInTopic = (
  topicId?: string | null
): boolean => !!topicId && (materialTypingCountsByTopic[topicId] || 0) > 0;

const escapeCallSummaryMessageHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const stripCallSummaryMessageHeader = (value: string): string =>
  normalizeCallSummaryText(value)
    .replace(/^(?:#+\s*)?краткое\s+содержание\s+звонка\s*:?\s*/i, '')
    .trim();

const formatCallSummaryMessageText = (summaryText: string): string => {
  const normalizedSummary = stripCallSummaryMessageHeader(summaryText);

  return escapeCallSummaryMessageHtml(
    `Краткое содержание звонка\n\n${normalizedSummary}`
  ).replace(/\n/g, '<br>');
};

const formatCallActionListMessageText = (actionListText: string): string => {
  const normalizedActionList = actionListText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  return escapeCallSummaryMessageHtml(
    `Список действий по звонку\n\n${normalizedActionList}`
  ).replace(/\n/g, '<br>');
};

export const sendCallSummaryTextToChat = async (
  summaryText: string,
  targetTopicId: string
): Promise<boolean> => {
  if (!summaryText.trim() || !targetTopicId) {
    return false;
  }

  const sent = await sendMessageChat({
    topicId: targetTopicId,
    text: formatCallSummaryMessageText(summaryText)
  });

  if (sent) {
    showNotification({
      title: 'Краткое содержание отправлено',
      description: 'Краткое содержание добавлено в чат',
      type: MessageTypeEnum.success
    });
  } else {
    showErrorNotification('Не удалось отправить краткое содержание в чат');
  }

  return sent;
};

export const sendCallSummaryPromptToChat = async (
  targetTopicId: string,
  text: string
): Promise<boolean> => {
  if (!targetTopicId || !text.trim()) {
    return false;
  }

  return sendMessageChat({
    topicId: targetTopicId,
    text: escapeCallSummaryMessageHtml(text.trim())
  });
};

export const sendGeneratedCallSummaryBriefToChat = async (
  summary: CallSummaryDto,
  targetTopicId: string
): Promise<boolean> => {
  if (!summary.id || !targetTopicId) {
    return false;
  }

  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/summaries/${encodeURIComponent(summary.id)}/brief/send`,
      { targetTopicId },
      { parsed: false }
    );
    await readResponse<{ text?: string; message?: unknown }>(response);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const sendGeneratedCallPromptResponseToChat = async (
  summary: CallSummaryDto,
  targetTopicId: string,
  prompt: string
): Promise<boolean> => {
  if (!summary.id || !targetTopicId || !prompt.trim()) {
    return false;
  }

  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/summaries/${encodeURIComponent(summary.id)}/prompt/send`,
      { targetTopicId, prompt },
      { parsed: false }
    );
    await readResponse<{ text?: string; message?: unknown }>(response);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const sendCallTopicPromptPlaceholderToChat = async (
  targetTopicId: string,
  kind: CallTopicPromptPlaceholderKind
): Promise<boolean> => {
  if (!targetTopicId) {
    return false;
  }

  try {
    const api = useChatApi();
    const response = await api.post(
      '/calls/summaries/prompt-placeholder/send',
      { targetTopicId, kind },
      { parsed: false }
    );
    await readResponse<{ text?: string; message?: unknown }>(response);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const sendCallSummaryToChat = async (
  summary: CallSummaryDto,
  targetTopicId = summary.topicId
): Promise<boolean> => {
  if (!summary.transcript) {
    return false;
  }

  return sendCallSummaryTextToChat(
    extractCallSummaryBrief(summary.transcript),
    targetTopicId
  );
};

export const sendCallActionListToChat = async (
  actionListText: string,
  targetTopicId: string
): Promise<boolean> => {
  if (!actionListText.trim() || !targetTopicId) {
    return false;
  }

  const sent = await sendMessageChat({
    topicId: targetTopicId,
    text: formatCallActionListMessageText(actionListText)
  });

  if (sent) {
    showNotification({
      title: 'Список действий отправлен',
      description: 'Список действий добавлен в чат',
      type: MessageTypeEnum.success
    });
  } else {
    showErrorNotification('Не удалось отправить список действий в чат');
  }

  return sent;
};

export const sendGeneratedCallActionListToChat = async (
  summary: CallSummaryDto,
  targetTopicId: string
): Promise<boolean> => {
  if (!summary.id || !targetTopicId) {
    return false;
  }

  try {
    const api = useChatApi();
    const response = await api.post(
      `/calls/summaries/${encodeURIComponent(summary.id)}/actions/send`,
      { targetTopicId },
      { parsed: false }
    );
    await readResponse<{ text?: string; message?: unknown }>(response);
    return true;
  } catch (error) {
    showErrorNotification(error);
    return false;
  }
};

export const sendCallActionListNotFoundToChat = async (
  targetTopicId: string
): Promise<boolean> =>
  sendCallActionListToChat(
    'Список действий по звонку не найден',
    targetTopicId
  );
