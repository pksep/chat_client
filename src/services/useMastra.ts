import { notifyVoiceReply, type VoiceReplyOptions } from './voiceReply';
import { actionTaskVoiceReply } from './aiActionTaskPresentation';
import type { AiSubmissionResult } from './aiSubmission';
import {
  fetchWithAiAccess,
  requireAiAccess,
  useChatAccess
} from '../composables/useChatAccess';
import { ref, watch, type Ref } from 'vue';
import { observeAiSubmission, type AiSubmissionObserver } from './aiSubmission';
import { MastraClient, RequestContext } from '@mastra/client-js';
import {
  saveMessages as saveChatMessages,
  getChatHistorySnapshot
} from './useChatDb';
import {
  fetchAiConversationState,
  initializeAiConversation,
  fetchAiConversationTranscript,
  setAiConversationMessagePin,
  mutateAiConversation,
  resetAiConversation,
  type AiConversationState,
  type AiConversationReset,
  type AiHistoryMutation
} from './aiConversationHistory';
import { AIMessage, type AIMessageReference } from '../types/messages';
import {
  aiMessagePresentationSchema,
  type AiMessagePresentation
} from './aiConversationTranscript';
import { getConfig } from './useConfig';
import { generateUUID } from '../utils/generateUUID';
import { getAuthToken } from '../composables/useLogin';
import {
  getAuthUser,
  getChatAuthSession,
  getStoredChatAccessToken
} from '../composables/useAuth';
import { showErrorNotification } from '../composables/useNotifications';
import {
  approvalDecisionFromMessage,
  findPendingToolApproval,
  type ApprovalDecision,
  formatApprovalMessage,
  isStaleApprovalResponse,
  type PendingToolApproval
} from './mastraApproval';
import {
  getMastraToolError,
  AI_TOOL_RESULT_UNCONFIRMED,
  processMastraEventStream
} from './mastraEventStream';
import {
  refreshAiAttachments,
  type AiAttachmentReference
} from './aiAttachments';
import { extractAiOutputAttachments } from './aiOutputAttachments';
import { getAiErrorMessage } from './aiErrorMessages';
import { validateAiAttachments } from './aiAttachmentLimits';
import {
  parseAiAttachmentReferences,
  type AiMessageAttachment
} from './aiAttachmentReferences';
import {
  createAiConversationView,
  aiMessageRequestId
} from './aiConversationView';
import {
  actionTaskFromEvent,
  actionTaskSummary,
  controlAiActionTask,
  fetchAiActionTasks,
  type AiActionTask,
  type AiActionDecision
} from './aiActionTasks';
import { createMastraStreamLifecycle } from './mastraStreamLifecycle';

type Message = AIMessage;

interface UseMastraOptions {
  agentId?: string;
  chatId?: string;
  baseUrl?: string;
  approvalMode?: Ref<'ask' | 'automatic'>;
  responseMode?: Ref<'quick' | 'advanced'>;
  initializeServerHistory?: boolean;
}

interface ToolApprovalRequestError extends Error {
  status: number;
  stale: boolean;
}

const AI_STREAM_UI_FLUSH_MS = 50;
const AI_STREAM_SAVE_DEBOUNCE_MS = 250;

const useMastra = (options?: UseMastraOptions | false) => {
  if (!options) {
    return {
      messages: ref<Message[]>([]),
      sendMessage: async () => ({ accepted: false, responseText: null }),
      resolveToolApproval: async () => ({
        accepted: false,
        responseText: null
      }),
      resolveActionTask: async () => {},
      taskBusy: ref(false),
      historyBusy: ref(false),
      preparationStatus: ref('Подготавливаю ответ'),
      clearMessages: async () => {},
      deleteConversation: async () => {},
      dispose: () => {},
      toggleMessagePin: async () => {},
      deleteMessages: async () => {},
      editMessageAndResend: async () => {},
      appendExternalMessage: async () => {},
      isInitializing: ref(false),
      pendingApproval: ref<PendingToolApproval | null>(null),
      lastError: ref<string | null>(null)
    };
  }

  const config = getConfig();
  const defaultBaseUrl = config.CHAT_MASTRA_URL;
  const agentId = options.agentId ?? 'chat';
  let chatId = options.chatId;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  const messages: Ref<Message[]> = ref([]);
  const isInitializing = ref(!!chatId);
  const pendingApproval = ref<PendingToolApproval | null>(null);
  const lastError = ref<string | null>(null);
  const taskBusy = ref(false);
  const preparationStatus = ref('Подготавливаю ответ');
  const historyBusy = ref(false);
  let conversationGeneration: number | undefined;
  let conversationProtocol: 0 | 1 = 0;
  // После обнаружения серверной истории сбой её чтения не разрешает отправить старый клиентский снимок.
  let serverHistoryGeneration: number | undefined;
  let transcriptController: AbortController | undefined;
  let conversationDeleted = false;
  let historySnapshotLoaded = !chatId;
  let historySnapshotPromise: Promise<void> | undefined;
  const historyLoadError =
    'Не удалось загрузить историю чата. Сообщения не изменены. Попробуйте ещё раз.';
  let pendingReset:
    | (AiConversationReset & { action: 'clear' | 'delete' })
    | undefined;
  let pendingMutation:
    | Extract<AiHistoryMutation, { action: 'delete' }>
    | undefined;
  let pendingEdit:
    | {
        operation: Extract<AiHistoryMutation, { action: 'edit' }>;
        identity: string;
      }
    | undefined;
  const saveMessages = (id: string, history: Message[]) => {
    if (!historySnapshotLoaded)
      return Promise.reject(new Error(historyLoadError));
    const persistedHistory = history.flatMap(message => {
      if (!message.loading) return [message];
      if (
        !message.content.trim() &&
        !message.outputAttachments?.length &&
        !message.actionTask &&
        !message.pendingToolApproval
      )
        return [];
      return [{ ...message, loading: false }];
    });
    return saveChatMessages(
      id,
      persistedHistory,
      conversationGeneration ?? 0,
      conversationProtocol
    );
  };
  let taskPollTimer: ReturnType<typeof setTimeout> | undefined;
  let taskRefreshPending = false;
  const taskDecisions = new Set<string>();
  let disposed = false;
  let historyVersion = 0;
  let activeResponse:
    | {
        messageId: string;
        requestId?: string;
        controller: AbortController;
      }
    | undefined;

  const invalidateResponse = () => {
    const previous = activeResponse;
    activeResponse = undefined;
    previous?.controller.abort();
    if (previous)
      messages.value = messages.value.map(message =>
        message.id === previous.messageId
          ? { ...message, loading: false }
          : message
      );
  };

  /** Закрывает только клиентское чтение; уже принятые сервером действия не отменяет. */
  const dispose = () => {
    stopAccessWatch();
    disposed = true;
    historyVersion += 1;
    clearTimeout(taskPollTimer);
    transcriptController?.abort();
    invalidateResponse();
  };

  const stopAccessWatch = watch(
    () => useChatAccess().access.value.ai,
    allowed => {
      if (!allowed) dispose();
    },
    { flush: 'sync' }
  );

  const applyActionTask = async (
    task: AiActionTask,
    preferredMessageId?: string,
    persist = true
  ) => {
    if (disposed) return;
    let index = messages.value.findIndex(
      message => message.actionTask?.id === task.id
    );
    if (index < 0 && preferredMessageId)
      index = messages.value.findIndex(
        message =>
          message.id === preferredMessageId &&
          message.role === 'assistant' &&
          message.requestId === task.requestId
      );
    if (index < 0)
      index = messages.value.findLastIndex(
        message =>
          message.role === 'assistant' && message.requestId === task.requestId
      );
    if (
      index >= 0 &&
      (messages.value[index].actionTask?.version ?? 0) >= task.version
    )
      return;
    const next = [...messages.value];
    if (index < 0) {
      index = next.length;
      next.push({
        id: generateUUID(),
        role: 'assistant',
        content: '',
        timestamp: task.createdAt,
        requestId: task.requestId
      });
    }
    next[index] = {
      ...next[index],
      actionTask: task,
      content: actionTaskSummary(task)
    };
    messages.value = next;
    if (chatId && persist) await saveMessages(chatId, next);
  };
  const refreshActionTasks = async () => {
    if (disposed || !chatId || taskRefreshPending) return;
    const version = historyVersion;
    taskRefreshPending = true;
    try {
      const tasks = await fetchAiActionTasks(baseUrl, chatId);
      if (tasks)
        for (const task of [...tasks].reverse()) {
          if (disposed || version !== historyVersion) return;
          await applyActionTask(task);
        }
    } catch (error) {
      if (disposed || version !== historyVersion) return;
      if (messages.value.some(message => message.actionTask))
        lastError.value = getAiErrorMessage(error);
    } finally {
      taskRefreshPending = false;
    }
  };
  const pollActionTasks = () => {
    clearTimeout(taskPollTimer);
    if (disposed) return;
    taskPollTimer = setTimeout(
      async () => {
        const version = historyVersion;
        await refreshActionTasks();
        if (disposed || version !== historyVersion) return;
        if (
          taskBusy.value ||
          messages.value.some(
            message =>
              message.actionTask &&
              ['running', 'needs_review'].includes(message.actionTask.status)
          )
        )
          pollActionTasks();
      },
      messages.value.some(
        message => message.actionTask?.status === 'needs_review'
      ) && !taskBusy.value
        ? 3000
        : 1000
    );
  };
  const resolveActionTask = async (id: string, decision: AiActionDecision) => {
    const decisionKey = `${id}:${decision}`;
    if (
      !chatId ||
      disposed ||
      taskDecisions.has(decisionKey) ||
      (taskBusy.value && decision !== 'cancel')
    )
      return;
    const task = messages.value.find(
      message => message.actionTask?.id === id
    )?.actionTask;
    if (!task) return;
    const version = historyVersion;
    taskDecisions.add(decisionKey);
    taskBusy.value = true;
    lastError.value = null;
    pollActionTasks();
    try {
      const updated = await controlAiActionTask(
        baseUrl,
        chatId,
        task,
        decision
      );
      if (!disposed && version === historyVersion)
        await applyActionTask(updated);
    } catch (error) {
      if (disposed || version !== historyVersion) return;
      lastError.value = getAiErrorMessage(error);
      showErrorNotification(lastError.value);
    } finally {
      taskDecisions.delete(decisionKey);
      taskBusy.value = taskDecisions.size > 0;
      if (!disposed && version === historyVersion) {
        await refreshActionTasks();
        pollActionTasks();
      }
    }
  };
  let initializationPromise: Promise<void> = Promise.resolve();

  let activeAttachments: AiMessageAttachment[] = [];

  const clearStoredPendingApproval = (approval: PendingToolApproval): void => {
    const messageIndex = messages.value.findLastIndex(
      message => message.pendingToolApproval?.toolCallId === approval.toolCallId
    );
    if (messageIndex < 0) return;

    const nextMessages = [...messages.value];
    nextMessages[messageIndex] = {
      ...nextMessages[messageIndex],
      pendingToolApproval: undefined
    };
    messages.value = nextMessages;
  };

  /** Сохраняет весь набор: истечение ссылки не удаляет файл и не меняет номера остальных. */
  const restoreMessageAttachments = (
    history: Message[]
  ): AiMessageAttachment[] => {
    const stored = history
      .slice()
      .reverse()
      .find(
        message => message.role === 'user' && Array.isArray(message.attachments)
      )?.attachments;

    return stored ? [...stored] : [];
  };

  /** Доступ проверяется и обновляется перед отправкой, а не фильтруется при чтении списка. */
  const getActiveAttachments = (): AiMessageAttachment[] => {
    return activeAttachments;
  };

  const createRequestContext = (
    attachments: AiMessageAttachment[] = getActiveAttachments(),
    forceStrictApproval = false,
    explicitRequestId?: string,
    presentation?: AiMessagePresentation,
    interactionMode: 'text' | 'voice' = 'text'
  ): RequestContext<unknown> => {
    const requestContext = new RequestContext<Record<string, unknown>>();
    requestContext.set('interactionMode', interactionMode);
    requestContext.set(
      'approvalMode',
      interactionMode !== 'voice' &&
        !forceStrictApproval &&
        options.approvalMode?.value === 'automatic'
        ? 'automatic'
        : 'strict'
    );
    requestContext.set(
      'responseMode',
      options.responseMode?.value === 'advanced' ? 'advanced' : 'quick'
    );
    requestContext.set(
      'attachments',
      parseAiAttachmentReferences(attachments).map(
        ({
          name,
          size,
          contentType,
          transferToken,
          attachmentId,
          contentHash
        }) => ({
          ...(attachmentId ? { attachmentId, contentHash } : {}),
          name,
          size,
          contentType,
          transferToken
        })
      )
    );
    if (chatId) requestContext.set('threadId', chatId);
    if (conversationGeneration !== undefined)
      requestContext.set('conversationGeneration', conversationGeneration);
    if (conversationProtocol === 1)
      requestContext.set('conversationProtocol', 1);
    if (conversationProtocol === 1 && presentation)
      requestContext.set(
        'messagePresentation',
        aiMessagePresentationSchema.parse(presentation)
      );
    const requestId =
      explicitRequestId ??
      aiMessageRequestId(
        messages.value.findLast(message => message.role === 'user')
      );
    if (requestId) requestContext.set('requestId', requestId);
    return requestContext as unknown as RequestContext<unknown>;
  };

  const requestToolApproval = async (
    approval: PendingToolApproval,
    decision: Exclude<ApprovalDecision, null>,
    token: string,
    abortSignal?: AbortSignal,
    attachments: AiMessageAttachment[] = getActiveAttachments(),
    voice?: VoiceReplyOptions
  ): Promise<Response> => {
    validateAiAttachments(attachments);
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const apiBaseUrl = normalizedBaseUrl.endsWith('/api')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/api`;
    const action =
      decision === 'approve' ? 'approve-tool-call' : 'decline-tool-call';
    const response = await fetchWithAiAccess(
      `${apiBaseUrl}/agents/${encodeURIComponent(agentId)}/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          runId: approval.runId,
          toolCallId: approval.toolCallId,
          ...(decision === 'decline'
            ? { reason: 'Пользователь отменил действие в чате.' }
            : {}),
          requestContext: {
            ...(voice ? { interactionMode: voice.interactionMode } : {}),
            approvalMode:
              !voice && options.approvalMode?.value === 'automatic'
                ? 'automatic'
                : 'strict',
            responseMode:
              options.responseMode?.value === 'advanced' ? 'advanced' : 'quick',
            ...(chatId ? { threadId: chatId } : {}),
            ...(conversationGeneration !== undefined
              ? { conversationGeneration }
              : {}),
            requestId:
              messages.value.findLast(
                message =>
                  message.pendingToolApproval?.toolCallId ===
                  approval.toolCallId
              )?.requestId ??
              aiMessageRequestId(
                messages.value.findLast(message => message.role === 'user')
              ),
            attachments: parseAiAttachmentReferences(attachments).map(
              ({
                name,
                size,
                contentType,
                transferToken,
                attachmentId,
                contentHash
              }) => ({
                ...(attachmentId ? { attachmentId, contentHash } : {}),
                name,
                size,
                contentType,
                transferToken
              })
            )
          }
        }),
        signal: abortSignal
      }
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      const stale =
        [400, 404, 409].includes(response.status) &&
        isStaleApprovalResponse(responseBody);
      let parsedBody;
      try {
        parsedBody = JSON.parse(responseBody);
      } catch {
        /* Ответ прокси может не быть JSON. */
      }
      const error = new Error(
        stale
          ? 'Подтверждение устарело после обновления сервиса'
          : getAiErrorMessage({ status: response.status, body: parsedBody })
      ) as ToolApprovalRequestError;
      Object.assign(error, {
        status: response.status,
        stale,
        body: parsedBody
      });
      throw error;
    }

    return response;
  };

  const loadHistorySnapshot = (): Promise<void> => {
    if (historySnapshotLoaded || disposed || !chatId) return Promise.resolve();
    historySnapshotPromise ??= getChatHistorySnapshot(chatId)
      .then(
        ({
          messages: initialMessages,
          conversationGeneration: generation,
          conversationProtocol: protocol
        }) => {
          if (disposed) return;
          messages.value = initialMessages.map(message => ({
            ...message,
            id: message.id || generateUUID()
          }));
          activeAttachments = restoreMessageAttachments(initialMessages);
          pendingApproval.value =
            protocol === 1 ? null : findPendingToolApproval(initialMessages);
          conversationGeneration = generation;
          conversationProtocol = protocol ?? 0;
          if (protocol === 1) serverHistoryGeneration = generation ?? 0;
          historySnapshotLoaded = true;
        }
      )
      .finally(() => {
        historySnapshotPromise = undefined;
      });
    return historySnapshotPromise;
  };

  const applyConversationState = async (
    state: AiConversationState,
    snapshot?: Awaited<ReturnType<typeof fetchAiConversationTranscript>>
  ): Promise<boolean> => {
    if (
      disposed ||
      (conversationGeneration !== undefined &&
        state.generation < conversationGeneration)
    )
      return false;
    const changed =
      state.deleted ||
      state.generation !== (conversationGeneration ?? 0) ||
      (state.protocol === 1 && conversationProtocol !== 1);
    if (
      !state.deleted &&
      state.protocol !== 1 &&
      ((!changed && conversationProtocol === 1) ||
        (serverHistoryGeneration !== undefined &&
          state.generation <= serverHistoryGeneration))
    )
      throw new Error(
        'Не удалось подтвердить серверную версию переписки. Сохранённые сообщения не изменены.'
      );
    // Проекцию проверяем до смены версии и очистки экрана. Ошибка не должна
    // превратить прежний кэш в пустую переписку с уже новой версией.
    const next = snapshot
      ? createAiConversationView(snapshot, changed ? [] : messages.value)
      : changed
        ? []
        : messages.value;
    const nextAttachments = snapshot
      ? restoreMessageAttachments(next)
      : undefined;
    if (state.protocol === 1 && conversationProtocol !== 1)
      pendingApproval.value = null;
    conversationGeneration = state.generation;
    conversationProtocol = state.protocol ?? 0;
    if (state.protocol === 1)
      serverHistoryGeneration = Math.max(
        serverHistoryGeneration ?? 0,
        state.generation
      );
    conversationDeleted = state.deleted;
    if (changed) {
      historyVersion += 1;
      invalidateResponse();
      transcriptController?.abort();
      clearTimeout(taskPollTimer);
      pendingApproval.value = null;
      activeAttachments = [];
      messages.value = [];
    }
    if (snapshot) {
      messages.value = next;
      activeAttachments = nextAttachments!;
      pendingApproval.value = findPendingToolApproval(messages.value);
    }
    if (chatId) await saveMessages(chatId, messages.value);
    return changed;
  };

  const refreshServerHistory = async () => {
    if (
      !chatId ||
      disposed ||
      conversationDeleted ||
      conversationProtocol !== 1
    )
      return;
    const generation = conversationGeneration!;
    const version = historyVersion;
    transcriptController?.abort();
    const controller = new AbortController();
    transcriptController = controller;
    try {
      const snapshot = await fetchAiConversationTranscript(
        baseUrl,
        chatId,
        generation,
        controller.signal
      );
      if (
        disposed ||
        controller.signal.aborted ||
        version !== historyVersion ||
        generation !== conversationGeneration
      )
        return;
      const next = createAiConversationView(snapshot, messages.value);
      messages.value = next;
      activeAttachments = restoreMessageAttachments(next);
      pendingApproval.value = findPendingToolApproval(next);
      await saveMessages(chatId, next);
    } catch (error) {
      // Завершение старой загрузки не сообщает ошибку новому запросу или очищенному чату.
      if (
        disposed ||
        controller.signal.aborted ||
        version !== historyVersion ||
        generation !== conversationGeneration
      )
        return;
      throw error;
    } finally {
      if (transcriptController === controller) transcriptController = undefined;
    }
  };

  const synchronizeConversation = async () => {
    if (!chatId || disposed) return false;
    await loadHistorySnapshot();
    if (disposed) return false;
    const version = historyVersion;
    let state = await fetchAiConversationState(baseUrl, chatId);
    if (disposed || version !== historyVersion) return false;
    if (
      options.initializeServerHistory &&
      !state.deleted &&
      state.protocol !== 1
    )
      state = await initializeAiConversation(baseUrl, chatId, state.generation);
    if (disposed || version !== historyVersion) return false;
    let snapshot:
      | Awaited<ReturnType<typeof fetchAiConversationTranscript>>
      | undefined;
    if (!state.deleted && state.protocol === 1) {
      serverHistoryGeneration = Math.max(
        serverHistoryGeneration ?? 0,
        state.generation
      );
      transcriptController?.abort();
      const controller = new AbortController();
      transcriptController = controller;
      try {
        snapshot = await fetchAiConversationTranscript(
          baseUrl,
          chatId,
          state.generation,
          controller.signal
        );
        if (disposed || version !== historyVersion) return false;
        if (controller.signal.aborted) throw new Error(historyLoadError);
      } finally {
        if (transcriptController === controller)
          transcriptController = undefined;
      }
    }
    const changed = await applyConversationState(state, snapshot);
    if (pendingReset && pendingReset.generation < state.generation)
      pendingReset = undefined;
    return changed;
  };

  if (chatId) {
    initializationPromise = synchronizeConversation()
      .then(() => {
        isInitializing.value = false;
        if (!disposed && !conversationDeleted)
          void refreshActionTasks().then(pollActionTasks);
      })
      .catch(error => {
        console.error('Failed to get messages for conversation:', error);
        lastError.value = historySnapshotLoaded
          ? getAiErrorMessage(error)
          : historyLoadError;
        isInitializing.value = false;
      });
  } else {
    isInitializing.value = false;
  }

  const submitMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    approvalDecisionOverride: Exclude<ApprovalDecision, null> | null = null,
    appendUserMessage = true,
    attachments: AiAttachmentReference[] = [],
    replyTo?: AIMessageReference,
    modelInput?: string,
    preparedInput?: { requestId: string; generation: number },
    submission?: AiSubmissionObserver,
    voice?: VoiceReplyOptions
  ): Promise<void> => {
    await requireAiAccess();
    if (disposed || !input.trim()) return;

    lastError.value = null;

    if (!chatId) {
      chatId = generateUUID();
      messages.value = [];
      isInitializing.value = false;
    }
    const memoryResourceId =
      getAuthUser()?.id || getChatAuthSession()?.user?.id || undefined;
    const memory = {
      thread: chatId,
      ...(memoryResourceId ? { resource: memoryResourceId } : {})
    };

    if (isInitializing.value) await initializationPromise;
    if (
      activeResponse &&
      !messages.value.some(
        message => message.id === activeResponse?.messageId && message.loading
      )
    )
      invalidateResponse();
    if (disposed || activeResponse) return;
    const beforeSyncVersion = historyVersion;
    let historyError: unknown;
    try {
      const changed = await synchronizeConversation();
      if (
        disposed ||
        historyVersion !== beforeSyncVersion + (changed ? 1 : 0)
      ) {
        return;
      }
      if (conversationDeleted || (changed && approvalDecisionOverride)) {
        lastError.value = conversationDeleted
          ? 'Этот чат уже удалён. Создайте новый чат для следующего поручения.'
          : 'История чата изменена. Прежнее подтверждение больше не действует.';
        showErrorNotification(lastError.value);
        return;
      }
    } catch (error) {
      if (disposed || historyVersion !== beforeSyncVersion) {
        return;
      }
      if (
        options.initializeServerHistory ||
        conversationProtocol === 1 ||
        serverHistoryGeneration !== undefined
      ) {
        lastError.value = getAiErrorMessage(error);
        showErrorNotification(lastError.value);
        return;
      }
      if (!historySnapshotLoaded) {
        lastError.value = historyLoadError;
        showErrorNotification(lastError.value);
        return;
      }
      historyError = error;
    }
    if (disposed || activeResponse) return;
    if (
      preparedInput &&
      (conversationGeneration !== preparedInput.generation ||
        aiMessageRequestId(
          messages.value.findLast(message => message.role === 'user')
        ) !== preparedInput.requestId)
    ) {
      throw new Error(
        'История изменилась после редактирования. Исправленный запрос не отправлен повторно; обновите чат.'
      );
    }

    const pendingPlan =
      !preparedInput &&
      messages.value.findLast(
        message => message.actionTask?.status === 'waiting_approval'
      )?.actionTask;
    const planDecision =
      pendingPlan && !voice ? approvalDecisionFromMessage(input) : null;
    if (pendingPlan && planDecision) {
      submission?.accept();
      await resolveActionTask(
        pendingPlan.id,
        planDecision === 'approve' ? 'approve' : 'cancel'
      );
      return;
    }

    const previousAttachments = activeAttachments;
    const unsavedMessageIds = new Set<string>();
    const discardUnacceptedMessages = () => {
      messages.value = messages.value.filter(
        message => !message.id || !unsavedMessageIds.has(message.id)
      );
      activeAttachments = previousAttachments;
    };
    if (attachments.length > 0) activeAttachments = [...attachments];
    let requestAttachments = [...getActiveAttachments()];

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.loading) return;

    const inferredApprovalDecision =
      !preparedInput && !voice && pendingApproval.value
        ? approvalDecisionFromMessage(input)
        : null;
    const effectiveApprovalDecision =
      approvalDecisionOverride || inferredApprovalDecision;
    const shouldAppendUserMessage =
      appendUserMessage && !inferredApprovalDecision;

    if (shouldAppendUserMessage) {
      const requestId = generateUUID();
      unsavedMessageIds.add(requestId);
      const userMessage: Message = {
        id: requestId,
        requestId,
        role: 'user',
        content: input,
        ...(modelInput?.trim() && modelInput.trim() !== input.trim()
          ? { modelContent: modelInput }
          : {}),
        timestamp: Date.now(),
        ...(requestAttachments.length > 0
          ? {
              attachments: requestAttachments.map(file => ({ ...file }))
            }
          : {}),
        ...(replyTo ? { replyTo } : {})
      };
      messages.value = [...messages.value, userMessage];
    }

    const approvalDecision = pendingApproval.value
      ? effectiveApprovalDecision
      : null;

    if (pendingApproval.value && !approvalDecision) {
      const reminderMessage: Message = {
        id: generateUUID(),
        role: 'assistant',
        content:
          'Сейчас ожидается решение по действию. Выберите «Подтвердить» или «Отменить» на карточке.',
        loading: false,
        timestamp: Date.now()
      };
      messages.value = [...messages.value, reminderMessage];
      unsavedMessageIds.add(reminderMessage.id!);
      const version = historyVersion;
      try {
        await saveMessages(chatId, messages.value);
      } catch (error) {
        if (!disposed && version === historyVersion) {
          discardUnacceptedMessages();
          lastError.value = getAiErrorMessage(error);
          throw error;
        }
        return;
      }
      if (disposed || version !== historyVersion) return;
      submission?.accept();
      submission?.respond(reminderMessage.content);
      return;
    }

    const requestMessages = messages.value
      .filter(message => !message.loading && message.content.trim())
      .map(message => {
        const messageContent =
          message.role === 'user' && message.modelContent?.trim()
            ? message.modelContent
            : message.content;
        const content =
          conversationProtocol === 0 && message.replyTo
            ? `${messageContent}\n\nКонтекст ответа:\n${
                message.replyTo.role === 'user' ? 'Пользователь' : 'Ассистент'
              }: ${message.replyTo.content}`
            : messageContent;

        return message.role === 'user'
          ? { role: 'user' as const, content }
          : { role: 'assistant' as const, content };
      });

    if (requestAttachments.length > 0 && conversationProtocol === 0) {
      const lastUserMessageIndex = requestMessages.findLastIndex(
        message => message.role === 'user'
      );
      if (lastUserMessageIndex >= 0) {
        const manifest = requestAttachments
          .map(
            (attachment, index) =>
              `${index + 1}. ${attachment.name} (${attachment.contentType}, ${attachment.size} байт)`
          )
          .join('\n');
        requestMessages[lastUserMessageIndex] = {
          ...requestMessages[lastUserMessageIndex],
          content: `${requestMessages[lastUserMessageIndex].content}\n\nДоступные вложения текущего запроса:\n${manifest}`
        };
      }
    }

    const assistantMessage: Message = {
      id: generateUUID(),
      requestId:
        (pendingApproval.value && approvalDecision
          ? messages.value.findLast(
              message =>
                message.pendingToolApproval?.toolCallId ===
                pendingApproval.value?.toolCallId
            )?.requestId
          : undefined) ??
        aiMessageRequestId(
          messages.value.findLast(message => message.role === 'user')
        ),
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: Date.now()
    };
    const streamLifecycle = createMastraStreamLifecycle(abortSignal);
    const run = {
      messageId: assistantMessage.id!,
      requestId: assistantMessage.requestId,
      historyVersion,
      controller: streamLifecycle.controller
    };
    activeResponse = run;
    const responseIndex = () =>
      !disposed && activeResponse === run
        ? messages.value.findIndex(
            message =>
              message.id === run.messageId && message.role === 'assistant'
          )
        : -1;
    const isCurrentResponse = () => responseIndex() >= 0;
    messages.value = [...messages.value, assistantMessage];
    unsavedMessageIds.add(assistantMessage.id!);
    let submissionSaved = false;
    let streamReceived = false;
    let pendingText = '';
    let uiFlushTimer: ReturnType<typeof setTimeout> | undefined;
    let saveDebounceTimer: ReturnType<typeof setTimeout> | undefined;
    let streamSaveError: unknown;
    let streamSavePromise = Promise.resolve();

    const persistStreamSnapshot = () => {
      const snapshot = messages.value;
      streamSavePromise = streamSavePromise
        .then(async () => {
          if (isCurrentResponse()) await saveMessages(chatId!, snapshot);
        })
        .catch(error => {
          streamSaveError ??= error;
          run.controller.abort(error);
        });
    };
    const scheduleStreamSave = () => {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(() => {
        saveDebounceTimer = undefined;
        persistStreamSnapshot();
      }, AI_STREAM_SAVE_DEBOUNCE_MS);
    };
    const flushUiUpdates = () => {
      clearTimeout(uiFlushTimer);
      uiFlushTimer = undefined;
      if (!pendingText) return;
      const text = pendingText;
      pendingText = '';
      const assistantMessageIndex = responseIndex();
      if (
        assistantMessageIndex < 0 ||
        messages.value[assistantMessageIndex].actionTask
      )
        return;
      const newMessages = [...messages.value];
      newMessages[assistantMessageIndex] = {
        ...newMessages[assistantMessageIndex],
        content: newMessages[assistantMessageIndex].content + text
      };
      messages.value = newMessages;
      scheduleStreamSave();
    };
    const bufferTextUpdate = (text: string) => {
      pendingText += text;
      uiFlushTimer ??= setTimeout(flushUiUpdates, AI_STREAM_UI_FLUSH_MS);
    };

    try {
      await saveMessages(chatId, messages.value);
      submissionSaved = true;
      if (!isCurrentResponse()) return;
      submission?.accept();
      if (historyError) throw historyError;
      run.controller.signal.throwIfAborted();
      preparationStatus.value = 'Подготавливаю ответ';
      validateAiAttachments(requestAttachments);
      if (approvalDecision === 'decline') requestAttachments = [];
      else if (requestAttachments.length) {
        preparationStatus.value = 'Проверяю доступ к вложениям';
        requestAttachments = await refreshAiAttachments(
          requestAttachments,
          run.controller.signal
        );
        if (!isCurrentResponse()) return;
        activeAttachments = [...requestAttachments];
        const userIndex = messages.value.findIndex(
          message =>
            message.role === 'user' &&
            aiMessageRequestId(message) === run.requestId
        );
        if (userIndex >= 0) {
          messages.value[userIndex] = {
            ...messages.value[userIndex],
            attachments: [...requestAttachments]
          };
          await saveMessages(chatId, messages.value);
        }
      }
      if (!isCurrentResponse()) return;
      run.controller.signal.throwIfAborted();
      const token = getAuthToken() || getStoredChatAccessToken();
      if (!token) throw new Error('Требуется авторизация');

      const client = new MastraClient({
        baseUrl,
        headers: {
          Authorization: `Bearer ${token}`
        },
        abortSignal: run.controller.signal
      });
      const agent = client.getAgent(agentId);
      if (!agent)
        throw new Error(
          'ИИ не настроен для работы. Обратитесь к администратору.'
        );

      streamLifecycle.startTimeout();
      let stream;

      if (pendingApproval.value && approvalDecision) {
        const approval = pendingApproval.value;
        pendingApproval.value = null;

        try {
          stream = await requestToolApproval(
            approval,
            approvalDecision,
            token,
            run.controller.signal,
            requestAttachments,
            voice
          );
          streamReceived = Boolean(stream);
          if (!isCurrentResponse()) {
            await stream.body?.cancel().catch(() => undefined);
            return;
          }
          clearStoredPendingApproval(approval);
        } catch (approvalError) {
          if (!isCurrentResponse()) return;
          const requestError =
            approvalError as Partial<ToolApprovalRequestError>;

          if (!requestError.stale) {
            pendingApproval.value = approval;
            throw approvalError;
          }

          if (approvalDecision === 'decline') {
            clearStoredPendingApproval(approval);
            throw new Error(
              'Прежнее подтверждение закрыто. Это не подтверждает отмену уже выполненных действий.'
            );
          }

          clearStoredPendingApproval(approval);

          // Проверка после устаревшего подтверждения — новый ход, не повтор
          // прежней команды. Его ID сохраняется до отправки и связывает новый ответ/план.
          const recoveryRequestId = generateUUID();
          run.requestId = recoveryRequestId;
          const recoveryIndex = responseIndex();
          if (recoveryIndex < 0) return;
          messages.value[recoveryIndex] = {
            ...messages.value[recoveryIndex],
            requestId: recoveryRequestId
          };
          await saveMessages(chatId, messages.value);
          if (!isCurrentResponse()) return;
          run.controller.signal.throwIfAborted();

          stream = await agent.stream(
            [
              ...(conversationProtocol === 1 ? [] : requestMessages),
              {
                role: 'user' as const,
                content:
                  'Предыдущее подтверждение больше не действует. Сначала проверь фактический результат предыдущих действий через чтение. Не создавай заново уже существующие объекты и не повторяй выполненные изменения. Сформируй новое подтверждение только для оставшихся действий; если результат нельзя установить, объясни это пользователю и не повторяй запись.'
              }
            ],
            {
              memory,
              requestContext: createRequestContext(
                requestAttachments,
                true,
                recoveryRequestId
              )
            }
          );
          streamReceived = Boolean(stream);
        }
      } else {
        const currentUser = messages.value.findLast(
          message => message.role === 'user'
        );
        stream = await agent.stream(
          conversationProtocol === 1
            ? requestMessages
                .filter(message => message.role === 'user')
                .slice(-1)
            : requestMessages,
          {
            memory,
            requestContext: createRequestContext(
              requestAttachments,
              false,
              preparedInput?.requestId,
              currentUser
                ? {
                    displayText: currentUser.content,
                    ...(currentUser.replyTo
                      ? { replyTo: currentUser.replyTo }
                      : {})
                  }
                : undefined,
              voice?.interactionMode
            )
          }
        );
        streamReceived = Boolean(stream);
      }

      if (!isCurrentResponse()) {
        await stream?.body?.cancel().catch(() => undefined);
        return;
      }
      if (!stream)
        throw new Error(
          'ИИ не начал передачу ответа. Попробуйте позже; если ошибка повторяется, обратитесь в поддержку.'
        );
      let lastToolError: string | null = null;
      let hasAnswerAfterToolError = false;
      let stoppedForApproval = false;

      try {
        await processMastraEventStream(
          stream,
          async (event): Promise<void | false> => {
            const assistantMessageIndex = responseIndex();
            if (assistantMessageIndex < 0) return false;
            const task = actionTaskFromEvent(event);
            if (task) {
              flushUiUpdates();
              // План принадлежит исходному запросу, а не текущей позиции в списке.
              if (task.requestId !== run.requestId) return;
              notifyVoiceReply(voice);
              await applyActionTask(task, run.messageId, false);
              scheduleStreamSave();
              if (isCurrentResponse()) pollActionTasks();
              return;
            }
            if (event.type === 'tool-call') {
              const name = String(event.payload?.toolName || '');
              preparationStatus.value =
                name === 'ai_action_plan'
                  ? 'Сохраняю план действий'
                  : name === 'ai_action_catalog'
                    ? 'Проверяю доступные действия'
                    : /attachment.*read/.test(name)
                      ? 'Изучаю вложения'
                      : /search|find|list|get/.test(name)
                        ? 'Ищу информацию'
                        : 'Выполняю действие';
            }
            if (event.type === 'step-finish') return;

            const toolError = getMastraToolError(event);
            if (toolError) {
              // Ошибка отдельного шага не завершает запуск: агент может
              // исправить параметры или объяснить причину следующим ответом.
              lastToolError = toolError;
              hasAnswerAfterToolError = false;
              return;
            }

            // Успех одного переноса не сбрасывает весь набор: следующие
            // файлы и их подтверждения используют те же номера вложений.
            if (['tool-result', 'tool-output'].includes(event.type || '')) {
              const outputAttachments = extractAiOutputAttachments(
                event.payload
              );
              if (
                outputAttachments.length > 0 &&
                assistantMessageIndex < messages.value.length
              ) {
                const newMessages = [...messages.value];
                const current = newMessages[assistantMessageIndex];
                const uniqueAttachments = new Map(
                  (current.outputAttachments || []).map(attachment => [
                    attachment.path,
                    attachment
                  ])
                );
                outputAttachments.forEach(attachment =>
                  uniqueAttachments.set(attachment.path, attachment)
                );
                newMessages[assistantMessageIndex] = {
                  ...current,
                  outputAttachments: [...uniqueAttachments.values()]
                };
                messages.value = newMessages;
                scheduleStreamSave();
              }
            }

            if (event.type === 'tool-call-approval') {
              flushUiUpdates();
              const { payload } = event;

              if (
                typeof event.runId === 'string' &&
                typeof payload?.toolCallId === 'string' &&
                typeof payload?.toolName === 'string'
              ) {
                const nextPendingApproval: PendingToolApproval = {
                  runId: event.runId,
                  toolCallId: payload.toolCallId,
                  toolName: payload.toolName,
                  args:
                    payload.args && typeof payload.args === 'object'
                      ? payload.args
                      : {}
                };

                if (assistantMessageIndex < messages.value.length) {
                  const newMessages = [...messages.value];
                  newMessages[assistantMessageIndex] = {
                    ...newMessages[assistantMessageIndex],
                    content: formatApprovalMessage(nextPendingApproval),
                    loading: false,
                    pendingToolApproval: nextPendingApproval
                  };
                  messages.value = newMessages;
                }

                pendingApproval.value = nextPendingApproval;
                scheduleStreamSave();
              }

              notifyVoiceReply(voice);
              stoppedForApproval = true;
              return false;
            }

            if (event.type === 'text-delta' && event.payload?.text) {
              if (event.payload.text.trim()) hasAnswerAfterToolError = true;
              if (
                assistantMessageIndex < messages.value.length &&
                !messages.value[assistantMessageIndex].actionTask
              ) {
                bufferTextUpdate(event.payload.text);
                notifyVoiceReply(voice, event.payload.text);
              }
            } else if (event.type === 'finish') {
              // SDK закрывает body сразу после finish; дочитывание до EOF не
              // даёт отмене reader конкурировать с этим штатным закрытием.
              return;
            } else if (event.type === 'error') {
              throw new Error(getAiErrorMessage(event.payload));
            }
          },
          run.controller.signal
        );
      } catch (streamError) {
        throw new Error(
          getAiErrorMessage(
            streamSaveError ?? streamError,
            'Соединение с сервисом прервалось. Попробуйте ещё раз.'
          )
        );
      } finally {
        flushUiUpdates();
      }

      if (!stoppedForApproval && lastToolError && !hasAnswerAfterToolError)
        throw new Error(
          getAiErrorMessage(lastToolError, AI_TOOL_RESULT_UNCONFIRMED)
        );

      const completedMessage = messages.value[responseIndex()];
      if (
        completedMessage &&
        !completedMessage.content.trim() &&
        !completedMessage.outputAttachments?.length &&
        !completedMessage.actionTask &&
        !pendingApproval.value
      ) {
        throw new Error('ИИ не вернул результат. Попробуйте повторить запрос.');
      }
    } catch (error: unknown) {
      if (!isCurrentResponse()) return;
      notifyVoiceReply(voice);
      const errorMessage = getAiErrorMessage(error);

      lastError.value = errorMessage;

      if (!submissionSaved) {
        // Первая запись откатилась: не сохраняем этот ввод повторно из finally.
        discardUnacceptedMessages();
        throw error;
      }

      const assistantMessageIndex = responseIndex();
      if (assistantMessageIndex >= 0) {
        const newMessages = [...messages.value];
        newMessages[assistantMessageIndex] = {
          ...newMessages[assistantMessageIndex],
          content: errorMessage,
          role: 'assistant',
          loading: false
        };
        messages.value = newMessages;
      }
    } finally {
      streamLifecycle.dispose();
      clearTimeout(uiFlushTimer);
      flushUiUpdates();
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = undefined;
      const assistantMessageIndex = responseIndex();
      let finalMessage: Message | undefined;
      if (assistantMessageIndex >= 0) {
        const newMessages = [...messages.value];
        newMessages[assistantMessageIndex] = {
          ...newMessages[assistantMessageIndex],
          loading: false
        };
        messages.value = newMessages;
        finalMessage = newMessages[assistantMessageIndex];
      }
      const responseText = lastError.value
        ? null
        : (voice && finalMessage?.actionTask
            ? actionTaskVoiceReply(finalMessage.actionTask)
            : finalMessage?.content) ?? null;
      if (streamReceived) {
        try {
          onFinish?.();
        } catch (error) {
          console.error('Не удалось завершить обработку AI stream:', error);
        }
      }
      await streamSavePromise;
      try {
        if (isCurrentResponse() && chatId) {
          await saveMessages(chatId, messages.value);
        }
        if (isCurrentResponse()) {
          await refreshActionTasks();
          if (isCurrentResponse()) pollActionTasks();
        }
      } finally {
        if (activeResponse === run) {
          activeResponse = undefined;
          if (submissionSaved && conversationProtocol === 1 && !disposed) {
            try {
              await refreshServerHistory();
            } catch (error) {
              if (!disposed) lastError.value = getAiErrorMessage(error);
            }
          }
        }
      }
      submission?.respond(
        !disposed && run.historyVersion === historyVersion ? responseText : null
      );
    }
  };

  const sendMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    attachments: AiAttachmentReference[] = [],
    replyTo?: AIMessageReference,
    modelInput?: string,
    onAccepted?: () => void,
    voice?: VoiceReplyOptions
  ): Promise<AiSubmissionResult> =>
    observeAiSubmission(
      submission =>
        submitMessage(
          input,
          onFinish,
          abortSignal,
          null,
          true,
          attachments,
          replyTo,
          modelInput,
          undefined,
          submission,
          voice
        ),
      onAccepted
    );

  const resolveToolApproval = async (
    decision: Exclude<ApprovalDecision, null>,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    onAccepted?: () => void,
    voice?: VoiceReplyOptions
  ): Promise<AiSubmissionResult> => {
    if (!pendingApproval.value) return { accepted: false, responseText: null };

    const command = decision === 'approve' ? 'подтверждаю' : 'отмена';
    if (decision === 'decline') activeAttachments = [];
    return observeAiSubmission(
      submission =>
        submitMessage(
          command,
          onFinish,
          abortSignal,
          decision,
          false,
          [],
          undefined,
          undefined,
          undefined,
          submission,
          voice
        ),
      onAccepted
    );
  };

  const resetHistory = async (action: 'clear' | 'delete'): Promise<void> => {
    if (!chatId) return;
    if (isInitializing.value) await initializationPromise;
    if (pendingReset?.action !== action) pendingReset = undefined;
    if (conversationGeneration === undefined) await synchronizeConversation();
    if (conversationDeleted) {
      if (action === 'delete') return;
      throw new Error('Этот чат уже удалён. Создайте новый чат.');
    }
    pendingReset ??= {
      action,
      generation: conversationGeneration!,
      operationId: crypto.randomUUID()
    };
    const attempt = pendingReset;
    const state = await resetAiConversation(baseUrl, chatId, action, {
      generation: attempt.generation,
      operationId: attempt.operationId
    });
    await applyConversationState(state);
    lastError.value = null;
    if (pendingReset === attempt) pendingReset = undefined;
  };
  /** Очищает серверную версию до изменения локальной истории. */
  const clearMessages = () => resetHistory('clear');
  /** Удалённый диалог нельзя восстановить старым потоком или старой вкладкой. */
  const deleteConversation = async () => {
    await resetHistory('delete');
    dispose();
  };

  /** Сохраняет новое состояние локальной истории после действий над AI-сообщениями. */
  const replaceMessages = async (nextMessages: Message[]): Promise<void> => {
    if (!chatId) return;
    if (isInitializing.value) await initializationPromise;

    messages.value = nextMessages;
    await saveMessages(chatId, messages.value);
  };

  /** Меняет признак закрепления выбранного AI-сообщения. */
  const toggleMessagePin = async (messageIndex: number): Promise<void> => {
    if (isInitializing.value) await initializationPromise;
    if (
      conversationProtocol !== 1 &&
      serverHistoryGeneration !== undefined &&
      (conversationGeneration ?? 0) <= serverHistoryGeneration
    )
      throw new Error(historyLoadError);
    const message = messages.value[messageIndex];
    if (!message) return;

    if (conversationProtocol === 1) {
      if (!chatId || !message.id || message.pinVersion === undefined)
        throw new Error(
          'Не удалось найти сохранённое сообщение для закрепления. Обновите чат.'
        );
      const version = historyVersion;
      const saved = await setAiConversationMessagePin(baseUrl, chatId, {
        generation: conversationGeneration!,
        id: message.id,
        pinned: !message.pinned,
        expectedVersion: message.pinVersion
      });
      if (disposed || version !== historyVersion) return;
      transcriptController?.abort();
      messages.value = messages.value.map(item =>
        item.id === saved.id && (item.pinVersion ?? 0) <= saved.pinVersion
          ? { ...item, pinned: saved.pinned, pinVersion: saved.pinVersion }
          : item
      );
      await saveMessages(chatId, messages.value);
      return;
    }

    const nextMessages = [...messages.value];
    nextMessages[messageIndex] = {
      ...message,
      pinned: !message.pinned
    };
    await replaceMessages(nextMessages);
  };

  /** Удаляет серверные сообщения только после сохранения и чтения новой версии; старый формат сохраняет прежнее поведение. */
  const deleteMessages = async (messageIndexes: number[]): Promise<void> => {
    if (isInitializing.value) await initializationPromise;
    if (
      conversationProtocol !== 1 &&
      serverHistoryGeneration !== undefined &&
      (conversationGeneration ?? 0) <= serverHistoryGeneration
    )
      throw new Error(historyLoadError);
    const indexes = new Set(messageIndexes);
    if (indexes.size === 0) return;
    if (conversationProtocol === 1) {
      if (disposed || !chatId) return;
      const ids = [
        ...new Set(
          messages.value
            .filter((_, index) => indexes.has(index))
            .map(message => message.id)
        )
      ];
      if (!ids.length || ids.some(id => !id))
        throw new Error('Не удалось найти выбранные сообщения. Обновите чат.');
      ids.sort();
      if (
        pendingMutation?.generation !== conversationGeneration ||
        JSON.stringify(pendingMutation.messageIds) !== JSON.stringify(ids)
      )
        pendingMutation = {
          generation: conversationGeneration!,
          operationId: crypto.randomUUID(),
          action: 'delete',
          messageIds: ids
        };
      const operation = pendingMutation;
      const version = historyVersion;
      try {
        const state = await mutateAiConversation(baseUrl, chatId, operation);
        if (disposed || version !== historyVersion) return;
        // Не заменяем экран пустым массивом, если сохранение прошло, а чтение новой версии оборвалось.
        const snapshot = await fetchAiConversationTranscript(
          baseUrl,
          chatId,
          state.generation
        );
        if (disposed || version !== historyVersion) return;
        await applyConversationState(state, snapshot);
        if (pendingMutation === operation) pendingMutation = undefined;
        lastError.value = null;
      } catch (error) {
        if (disposed || version !== historyVersion) return;
        throw error;
      }
      return;
    }
    historyVersion += 1;
    if (
      messages.value.some(
        (message, index) =>
          indexes.has(index) &&
          (message.id === activeResponse?.messageId ||
            message.id === activeResponse?.requestId)
      )
    )
      invalidateResponse();

    await replaceMessages(
      messages.value.filter((_, index) => !indexes.has(index))
    );
  };

  /** Заменяет пользовательский запрос и заново строит продолжение диалога. */
  const editMessageAndResend = async (
    messageIndex: number,
    input: string,
    attachments: AiAttachmentReference[] = [],
    replyTo?: AIMessageReference,
    onAccepted?: () => void
  ): Promise<void> => {
    if (isInitializing.value) await initializationPromise;
    if (
      conversationProtocol !== 1 &&
      serverHistoryGeneration !== undefined &&
      (conversationGeneration ?? 0) <= serverHistoryGeneration
    )
      throw new Error(historyLoadError);
    const message = messages.value[messageIndex];
    if (!message || message.role !== 'user' || !input.trim()) return;
    if (conversationProtocol === 1) {
      if (!chatId || disposed || historyBusy.value || activeResponse) return;
      validateAiAttachments(attachments);
      const text = input;
      const messagePresentation = {
        displayText: input,
        ...(replyTo ? { replyTo } : {})
      };
      const identity = JSON.stringify({
        messageId: message.id,
        text,
        messagePresentation,
        attachments: attachments.map(file => ({
          attachmentId: file.attachmentId,
          contentHash: file.contentHash,
          name: file.name,
          size: file.size,
          contentType: file.contentType
        }))
      });
      if (
        pendingEdit?.identity !== identity ||
        pendingEdit.operation.generation !== conversationGeneration
      ) {
        pendingEdit = {
          identity,
          operation: {
            action: 'edit',
            generation: conversationGeneration!,
            operationId: crypto.randomUUID(),
            messageId: message.id!,
            text,
            messagePresentation,
            attachments: []
          }
        };
      }
      const attempt = pendingEdit;
      const version = historyVersion;
      let responseVersion = version;
      historyBusy.value = true;
      preparationStatus.value = attachments.length
        ? 'Проверяю доступ к вложениям'
        : 'Сохраняю исправленный запрос';
      try {
        const files = attachments.length
          ? await refreshAiAttachments(attachments)
          : [];
        if (disposed || version !== historyVersion) return;
        attempt.operation.attachments = parseAiAttachmentReferences(files);
        preparationStatus.value = 'Сохраняю исправленный запрос';
        const state = await mutateAiConversation(
          baseUrl,
          chatId,
          attempt.operation
        );
        if (disposed || version !== historyVersion) return;
        const snapshot = await fetchAiConversationTranscript(
          baseUrl,
          chatId,
          state.generation
        );
        if (disposed || version !== historyVersion) return;
        responseVersion = version + 1;
        await applyConversationState(state, snapshot);
        if (disposed || responseVersion !== historyVersion) return;
        onAccepted?.();
        // Первый запуск использует ID уже сохранённого входа, а не добавляет второе пользовательское сообщение.
        if (pendingEdit === attempt) pendingEdit = undefined;
        await submitMessage(
          text,
          undefined,
          undefined,
          null,
          false,
          files,
          undefined,
          undefined,
          {
            requestId: attempt.operation.operationId,
            generation: state.generation
          }
        );
      } catch (error) {
        if (disposed || responseVersion !== historyVersion) return;
        lastError.value = getAiErrorMessage(error);
        throw error;
      } finally {
        historyBusy.value = false;
      }
      return;
    }

    historyVersion += 1;
    invalidateResponse();
    pendingApproval.value = null;
    lastError.value = null;
    await replaceMessages(messages.value.slice(0, messageIndex));
    await observeAiSubmission(
      submission =>
        submitMessage(
          input,
          undefined,
          undefined,
          null,
          true,
          attachments,
          replyTo,
          undefined,
          undefined,
          submission
        ),
      onAccepted
    );
  };

  /** Добавляет результат фоновой автоматизации один раз и сохраняет его в истории. */
  const appendExternalMessage = async (message: Message): Promise<void> => {
    if (disposed || !chatId || !message.sourceId) return;
    await initializationPromise;
    await loadHistorySnapshot();
    if (disposed) return;
    if (messages.value.some(item => item.sourceId === message.sourceId)) return;
    messages.value = [...messages.value, message];
    await saveMessages(chatId, messages.value);
  };

  return {
    messages,
    sendMessage,
    resolveToolApproval,
    resolveActionTask,
    taskBusy,
    historyBusy,
    preparationStatus,
    clearMessages,
    deleteConversation,
    dispose,
    toggleMessagePin,
    deleteMessages,
    editMessageAndResend,
    appendExternalMessage,
    isInitializing,
    pendingApproval,
    lastError
  };
};

export { useMastra };
export { saveUserIdToSession, hasUserIdInSession } from './useSessionUser';
