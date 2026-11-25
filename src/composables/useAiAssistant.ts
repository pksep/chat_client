import { requireAiAccess, useChatAccess } from './useChatAccess';
import { getChatAuthSession } from '../utils/stored-chat-session';
import { getAuthUser } from './useAuth';
import type { VoiceReplyOptions } from '../services/voiceReply';
import type { ResponseCatalog, ResponseModelSelection } from '../services/aiResponseModels';
import {
  computed,
  reactive,
  ref,
  shallowReactive,
  watch,
  type Ref,
  type WatchStopHandle
} from 'vue';
import {
  approvalDecisionFromMessage,
  type PendingToolApproval
} from '../services/mastraApproval';
import type { AiAttachmentReference } from '../services/aiAttachments';
import type { AiOutputAttachment } from '../services/aiOutputAttachments';
import type { AiActionTask, AiActionDecision } from '../services/aiActionTasks';
import { actionTaskSummary } from '../services/aiActionTaskPresentation';
import { getLocalAiMessageId, type AIMessage, type AIMessageReference } from '../types/messages';
import type { AiSubmissionResult } from '../services/aiSubmission';
import { generateUUID } from '../utils/generateUUID';
import {
  fetchAiAutomations,
  type AiAutomationSummary
} from '../services/aiAutomations';
import { getChatHistorySnapshot, saveMessages } from '../services/useChatDb';
import { getAiErrorMessage } from '../services/aiErrorMessages';
import { showErrorNotification, showNotification } from './useNotifications';
import { useChatFolders } from './useChatFolders';
import { afterStartupPaint } from '../utils/after-startup-paint';
import {
  fetchAiConversationInfo,
  type AiConversationInfo
} from '../services/aiConversationInfo';
import { playMessageNotificationSound } from '../services/notification-sound';
import { isTauriRuntime } from '../services/useTauriNotifications';
import { useMediaQuery } from '@vueuse/core';
import { MAX_W_MD } from '../utils/constants';
import { desktopBrowserPlatform } from '../utils/desktop-app-downloads';
import {
  agentChoices,
  connectDesktopAgentChat,
  discardDesktopAgentChat,
  fetchDesktopAgentModels,
  getDesktopAgentChat,
  loadDesktopAgentChat,
  persistDesktopAgentMessages,
  resetDesktopAgentContext,
  sendDesktopAgentPrompt,
  setDesktopAgentOption,
  type AgentOption,
  type AgentProject,
  type DesktopAgentChat,
  type DesktopAgentModel
} from './useDesktopAgentChats';

export type AiAssistantTab = 'agents' | 'chats' | 'tasks';
export type AiAssistantView = 'agents' | 'chat' | 'tasks';
export type AiMessageRole = 'user' | 'assistant';
export type AiPermissionMode = 'ask' | 'automatic';
export type AiResponseMode = 'quick' | 'advanced';
export type AiAssistantActivityStatus =
  | 'running'
  | 'success'
  | 'attention'
  | 'error';

const ACTIVITY_CONFIRMATION_REQUIRED = 'Требуется подтверждение';

export const getAiActivityStatusLabel = (
  status?: AiAssistantActivityStatus
): string => {
  if (status === 'running') return 'Выполняется';
  if (status === 'success') return 'Успешно завершено';
  if (status === 'attention') return 'Требуется внимание';
  if (status === 'error') return 'Ошибка';

  return '';
};

export interface AiAssistantMessage {
  id: string;
  nativeId?: string;
  requestId?: string;
  role: AiMessageRole;
  text: string;
  time: string;
  timestamp?: number;
  durationMs?: number;
  reasoningSummaries?: string[];
  workLog?: AIMessage['workLog'];
  projectFiles?: AIMessage['projectFiles'];
  pending?: boolean;
  showApproval?: boolean;
  approvalState?: 'approved' | 'rejected' | null;
  pinned?: boolean;
  replyTo?: AIMessageReference;
  outputAttachments?: AiOutputAttachment[];
  actionTask?: AiActionTask;
}

export interface AiAssistantSession {
  id: string;
  initializeServerHistory?: boolean;
  kind?: 'chat' | 'task' | 'agent';
  agentOwnerId?: string;
  project?: AgentProject;
  title: string;
  description: string;
  time: string;
  pinned?: boolean;
  muted?: boolean;
  messages: AiAssistantMessage[];
}

export interface AiAutomationTask {
  id: string;
  sessionId?: string;
  title: string;
  description: string;
  schedule: string;
  enabled: boolean;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  pinned?: boolean;
}

export interface AiAssistantActivity {
  sessionId: string;
  title: string;
  description: string;
  status: AiAssistantActivityStatus;
  updatedAt: number;
  isBackground: boolean;
  requestId?: string;
}

interface PersistedAiState {
  sessions: AiAssistantSession[];
  tasks: AiAutomationTask[];
  permissionMode: AiPermissionMode;
  responseMode: AiResponseMode;
  chatModel?: string;
  chatEfforts?: Record<string, string>;
  agentModel?: string;
  agentEfforts?: Record<string, string>;
  activities?: AiAssistantActivity[];
  activitiesOwnerId?: string;
}

interface MastraRuntime {
  hasConfirmedAnswer: (requestId: string) => boolean;
  resolveActionTask: (id: string, decision: AiActionDecision) => Promise<void>;
  taskBusy: Ref<boolean>;
  historyBusy: Ref<boolean>;
  preparationStatus: Ref<string>;
  messages: Ref<AIMessage[]>;
  sendMessage: (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    attachments?: AiAttachmentReference[],
    replyTo?: AIMessageReference,
    modelInput?: string,
    onAccepted?: () => void,
    voice?: VoiceReplyOptions,
    localMessageId?: string
  ) => Promise<AiSubmissionResult>;
  resolveToolApproval: (
    decision: 'approve' | 'decline',
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    onAccepted?: () => void,
    voice?: VoiceReplyOptions
  ) => Promise<AiSubmissionResult>;
  clearMessages: () => Promise<void>;
  deleteConversation: () => Promise<void>;
  dispose: () => void;
  toggleMessagePin: (messageIndex: number) => Promise<void>;
  deleteMessages: (messageIndexes: number[]) => Promise<void>;
  editMessageAndResend: (
    messageIndex: number,
    input: string,
    attachments?: AiAttachmentReference[],
    replyTo?: AIMessageReference,
    onAccepted?: () => void
  ) => Promise<void>;
  appendExternalMessage: (message: AIMessage) => Promise<void>;
  isInitializing: Ref<boolean>;
  pendingApproval: Ref<PendingToolApproval | null>;
  lastError: Ref<string | null>;
}

const STORAGE_KEY = 'sep:chat:ai-assistant:v1';

const initialTasks = (): AiAutomationTask[] => [];

const loadState = (): PersistedAiState => {
  const fallback: PersistedAiState = {
    sessions: [],
    tasks: initialTasks(),
    permissionMode: 'ask',
    responseMode: 'quick'
  };
  if (typeof window === 'undefined') return fallback;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as PersistedAiState) : null;

    if (!parsed || !Array.isArray(parsed.sessions)) return fallback;

    return {
      sessions: parsed.sessions.map(session => ({
        ...session,
        kind:
          session.kind === 'agent'
            ? 'agent'
            : session.kind === 'task'
              ? 'task'
              : 'chat',
        messages: []
      })),
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.filter(task => task.id !== 'daily-automation')
        : initialTasks(),
      permissionMode:
        parsed.permissionMode === 'automatic' ? 'automatic' : 'ask',
      responseMode: parsed.responseMode === 'advanced' ? 'advanced' : 'quick',
      chatModel: typeof parsed.chatModel === 'string' ? parsed.chatModel : undefined,
      chatEfforts: parsed.chatEfforts,
      agentModel: typeof parsed.agentModel === 'string' ? parsed.agentModel : undefined,
      agentEfforts: parsed.agentEfforts,
      activitiesOwnerId: parsed.activitiesOwnerId,
      activities:
        parsed.activitiesOwnerId &&
        parsed.activitiesOwnerId === getChatAuthSession()?.user?.id &&
        Array.isArray(parsed.activities)
          ? parsed.activities.filter(
              activity =>
                activity &&
                parsed.sessions.some(
                  session => session.id === activity.sessionId
                ) &&
                ['running', 'attention', 'success', 'error'].includes(
                  activity.status
                ) &&
                (activity.isBackground === true ||
                  activity.status === 'running') &&
                typeof activity.description === 'string' &&
                Number.isFinite(activity.updatedAt)
            )
          : []
    };
  } catch {
    return fallback;
  }
};

const initialState = loadState();
const persisted = reactive<PersistedAiState>(initialState);
const phoneLayout = useMediaQuery(`(max-width: ${MAX_W_MD})`);
const hasDesktopAgentTab = computed(() =>
  isTauriRuntime() && desktopBrowserPlatform(navigator) !== 'mobile' && !phoneLayout.value
);
const activeTab = ref<AiAssistantTab>(hasDesktopAgentTab.value ? 'agents' : 'chats');
const activeView = ref<AiAssistantView>(hasDesktopAgentTab.value ? 'agents' : 'chat');
const activeSessionId = ref<string | null>(null);
const isVoiceModeOpen = ref(false);
const isVoiceModalVisible = ref(false);
const voiceCallStartedAt = ref<number | null>(null);
const permissionMode = ref<AiPermissionMode>(initialState.permissionMode);
const responseMode = ref<AiResponseMode>(initialState.responseMode);
const responseCatalog = ref<ResponseCatalog>();
const chatModel = ref(initialState.chatModel ?? '');
const chatEfforts = ref<Record<string, string>>(initialState.chatEfforts ?? {});
const activeResponseModel = computed(() => {
  const catalog = responseCatalog.value;
  if (!catalog) return undefined;
  return catalog.models.find(model => model.id === chatModel.value)
    ?? catalog.models.find(model => model.id === catalog.defaults[responseMode.value])
    ?? catalog.models[0];
});
const modelSelection = computed<ResponseModelSelection | undefined>(() => {
  const model = activeResponseModel.value;
  if (!model) {
    const id = chatModel.value;
    return id ? { id, effort: chatEfforts.value[id] } : undefined;
  }
  const preferred = chatEfforts.value[model.id];
  const effort = model.efforts.includes(preferred) ? preferred : model.defaultEffort;
  return { id: model.id, ...(effort ? { effort } : {}) };
});
const agentModel = ref(initialState.agentModel ?? '');
const agentModelCatalog = ref<DesktopAgentModel[]>([]);
const agentModelsLoading = ref(false);
const agentModelsError = ref('');
const agentEfforts = ref<Record<string, string>>(
  initialState.agentEfforts ?? {}
);
const agentSelection = ref<DesktopAgentChat | null>(null);
const isChoosingAgentDirectory = ref(false);
const observedAgentChats = new Map<string, WatchStopHandle>();
const runtimes = shallowReactive(new Map<string, MastraRuntime>());
const runtimePromises = new Map<string, Promise<MastraRuntime>>();
const pendingMessages = reactive(new Map<string, AiAssistantMessage>());
let mastraModulePromise: Promise<
  typeof import('../services/useMastra')
> | null = null;
const runtimeWatchers = new Map<string, WatchStopHandle>();
const approvalStates = reactive<
  Record<string, 'approved' | 'rejected' | undefined>
>({});
let automationRefreshPromise: Promise<void> | null = null;
let automationPollingStarted = false;
const sessionActivities = reactive<Record<string, AiAssistantActivity>>(
  Object.fromEntries(
    (initialState.activities ?? []).map(activity => [
      activity.sessionId,
      { ...activity, isBackground: true }
    ])
  )
);
const restoringActivityIds = new Set(Object.keys(sessionActivities));
const activitiesOwnerId = ref(initialState.activitiesOwnerId);
const inactiveSessionIds = new Set(Object.keys(sessionActivities));

const persist = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessions: persisted.sessions.map(session => ({
          ...session,
          messages: []
        })),
        tasks: persisted.tasks,
        permissionMode: permissionMode.value,
        responseMode: responseMode.value,
        chatModel: chatModel.value,
        chatEfforts: chatEfforts.value,
        agentModel: agentModel.value,
        agentEfforts: agentEfforts.value,
        activities: Object.values(sessionActivities),
        activitiesOwnerId: activitiesOwnerId.value
      })
    );
  } catch {
    // История сообщений хранится в IndexedDB; метаданные меню сохраняются по возможности.
  }
};

/** Начинает голосовой разговор или возвращает уже активный разговор на экран. */
const startVoiceCall = (): void => {
  if (!useChatAccess().access.value.ai) return;
  if (activeView.value === 'agents' && !activeAgentChat.value?.connected) {
    showErrorNotification('Сначала подключите папку проекта.');
    return;
  }
  if (!isVoiceModeOpen.value) {
    voiceCallStartedAt.value = Date.now();
  }
  isVoiceModeOpen.value = true;
  isVoiceModalVisible.value = true;
};

/** Сворачивает окно, не прерывая запись, ответы и отсчёт времени. */
const hideVoiceCall = (): void => {
  if (isVoiceModeOpen.value) isVoiceModalVisible.value = false;
};

/** Возвращает активный голосовой разговор на экран. */
const showVoiceCall = (): void => {
  if (isVoiceModeOpen.value) isVoiceModalVisible.value = true;
};

/** Завершает голосовой разговор и сбрасывает его длительность. */
const stopVoiceCall = (): void => {
  isVoiceModeOpen.value = false;
  isVoiceModalVisible.value = false;
  voiceCallStartedAt.value = null;
};

watch(
  () => useChatAccess().access.value.ai,
  allowed => {
    if (allowed) {
      void refreshAutomations();
      return;
    }
    stopVoiceCall();
    for (const runtime of runtimes.values()) runtime.dispose();
    for (const stop of runtimeWatchers.values()) stop();
    runtimes.clear();
    runtimeWatchers.clear();
    runtimePromises.clear();
    pendingMessages.clear();
    for (const [id, stop] of observedAgentChats) {
      stop();
      const chat = getDesktopAgentChat(id);
      if (chat) void discardDesktopAgentChat(chat).catch(console.error);
    }
    observedAgentChats.clear();
  },
  { flush: 'sync' }
);

watch(
  () => [
    persisted.sessions,
    persisted.tasks,
    sessionActivities,
    permissionMode.value,
    responseMode.value,
    chatModel.value,
    chatEfforts.value,
    agentModel.value,
    agentEfforts.value
  ],
  persist,
  {
    deep: true
  }
);

const formatTime = (timestamp?: number): string =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp ? new Date(timestamp) : new Date());

const shorten = (value: string, limit = 72): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Новый чат';
  return normalized.length > limit
    ? `${normalized.slice(0, limit).trim()}…`
    : normalized;
};

const AI_FORWARD_TECHNICAL_PREFIX =
  'Используй пересланное сообщение как контекст для поручения.';

/** Убирает служебные инструкции старых пересылок только из интерфейса. */
const getVisibleMessageContent = (value: string): string => {
  if (!value.trim().startsWith(AI_FORWARD_TECHNICAL_PREFIX)) return value;

  return value
    .trim()
    .slice(AI_FORWARD_TECHNICAL_PREFIX.length)
    .trim()
    .replace(/\n{2,}Поручение пользователя:\s*\n?/, '\n\n');
};

const getRuntimeMessageIndex = (
  sessionId: string,
  messageId: string,
  runtime: MastraRuntime
): number =>
  runtime.messages.value.findIndex(
    (message, index) => getLocalAiMessageId(sessionId, message, index) === messageId
  );

function canViewSession(session: AiAssistantSession): boolean {
  return (
    session.kind !== 'agent' ||
    (hasDesktopAgentTab.value &&
      !!session.agentOwnerId &&
      session.agentOwnerId ===
        (getAuthUser()?.id ?? getChatAuthSession()?.user?.id))
  );
}

const getSession = (sessionId: string): AiAssistantSession | null =>
  persisted.sessions.find(
    session => session.id === sessionId && canViewSession(session)
  ) || null;

const getPendingVisibleMessage = (
  session: AiAssistantSession | null
): AiAssistantMessage | undefined => {
  if (!session) return undefined;

  const pending = pendingMessages.get(session.id);
  if (!pending) return undefined;

  return session.messages.some(
    message =>
      message.role === 'user' &&
      (message.requestId === pending.id || message.nativeId === pending.id)
  )
    ? undefined
    : pending;
};

const setActivityStatus = (
  activity: AiAssistantActivity,
  status: AiAssistantActivityStatus,
  description: string
): void => {
  if (activity.status === status && activity.description === description)
    return;

  if (
    activity.status !== status &&
    inactiveSessionIds.has(activity.sessionId)
  ) {
    activity.isBackground = true;
  }

  if (
    activity.status === 'running' &&
    status !== 'running' &&
    activity.isBackground &&
    !getSession(activity.sessionId)?.muted
  ) {
    void playMessageNotificationSound();
  }

  activity.status = status;
  activity.description = description;
  activity.updatedAt = Date.now();
};

const syncSessionActivity = (
  sessionId: string,
  runtime: MastraRuntime
): void => {
  const session = getSession(sessionId);
  let activity = sessionActivities[sessionId];
  if (!activity && session && !runtime.isInitializing.value) {
    const savedPlan = runtime.messages.value.findLast(
      message => message.actionTask
    )?.actionTask;
    if (
      runtime.pendingApproval.value ||
      (savedPlan &&
        ['running', 'waiting_approval', 'needs_review'].includes(
          savedPlan.status
        ))
    ) {
      beginSessionActivity(session);
      activity = sessionActivities[sessionId];
      if (activeSessionId.value !== sessionId) {
        inactiveSessionIds.add(sessionId);
        activity.isBackground = true;
      }
    }
  }
  if (!activity) return;

  if (session) activity.title = session.title;

  const restoring = restoringActivityIds.has(sessionId);
  if (restoring && runtime.isInitializing.value) return;
  const response = runtime.messages.value.findLast(message => message.loading);
  if (response?.requestId) activity.requestId = response.requestId;

  if (runtime.pendingApproval.value) {
    restoringActivityIds.delete(sessionId);
    setActivityStatus(activity, 'attention', ACTIVITY_CONFIRMATION_REQUIRED);
    return;
  }

  if (runtime.lastError.value) {
    restoringActivityIds.delete(sessionId);
    setActivityStatus(activity, 'error', runtime.lastError.value);
    return;
  }
  if (getPendingVisibleMessage(session)) {
    setActivityStatus(activity, 'running', 'Загружаю историю');
    return;
  }
  if (runtime.historyBusy.value) {
    setActivityStatus(activity, 'running', runtime.preparationStatus.value);
    return;
  }

  const plan = runtime.messages.value.findLast(
    message =>
      message.actionTask &&
      (!activity.requestId ||
        message.actionTask.requestId === activity.requestId)
  )?.actionTask;
  if (plan) activity.requestId = plan.requestId;
  if (plan) restoringActivityIds.delete(sessionId);
  if (plan?.status === 'waiting_approval') {
    setActivityStatus(activity, 'attention', 'План ожидает подтверждения');
    return;
  }
  if (runtime.taskBusy.value || plan?.status === 'running') {
    setActivityStatus(activity, 'running', 'Выполняю план действий');
    return;
  }
  if (plan?.status === 'failed') {
    setActivityStatus(activity, 'error', 'Не удалось выполнить план');
    return;
  }
  if (plan && ['needs_review', 'partial'].includes(plan.status)) {
    setActivityStatus(
      activity,
      'attention',
      'Выполненные шаги сохранены. Требуется внимание'
    );
    return;
  }

  if (
    runtime.isInitializing.value ||
    runtime.messages.value.some(message => message.loading)
  ) {
    setActivityStatus(activity, 'running', 'Выполняется…');
    return;
  }

  if (restoring && !plan) {
    restoringActivityIds.delete(sessionId);
    if (activity.status === 'running') {
      if (activity.requestId && runtime.hasConfirmedAnswer(activity.requestId))
        setActivityStatus(activity, 'success', 'Ответ готов');
      else
        setActivityStatus(
          activity,
          'attention',
          'Не удалось подтвердить завершение запроса. Проверьте переписку.'
        );
    }
    return;
  }

  if (plan?.status === 'completed' || activity.status === 'running') {
    setActivityStatus(
      activity,
      'success',
      plan ? 'Задача успешно выполнена' : 'Ответ готов'
    );
  }
};

const syncSession = (sessionId: string, runtime: MastraRuntime): void => {
  const session = getSession(sessionId);
  if (!session) return;

  const pendingApproval = runtime.pendingApproval.value;
  if (pendingApproval?.toolName.startsWith('automation_')) {
    session.kind = 'task';
  }
  const lastSourceIndex = runtime.messages.value.length - 1;

  session.messages = runtime.messages.value.flatMap((message, index) => {
    if (
      message.loading &&
      !message.content.trim() &&
      !message.outputAttachments?.length &&
      !message.actionTask
    )
      return [];

    const id = getLocalAiMessageId(sessionId, message, index);
    return [
      {
        id,
        nativeId: message.id,
        requestId: message.requestId,
        role: message.role,
        text: message.actionTask
          ? actionTaskSummary(message.actionTask)
          : getVisibleMessageContent(message.content),
        time: formatTime(message.timestamp),
        timestamp: message.timestamp,
        showApproval:
          (Boolean(pendingApproval) &&
            index === lastSourceIndex &&
            message.role === 'assistant') ||
          Boolean(approvalStates[id]),
        approvalState: approvalStates[id] ?? null,
        pinned: Boolean(message.pinned),
        replyTo: message.replyTo,
        actionTask: message.actionTask,
        outputAttachments: message.outputAttachments
      }
    ];
  });

  const lastMessage = runtime.messages.value
    .slice()
    .reverse()
    .find(
      message =>
        message.actionTask ||
        message.content.trim() ||
        message.outputAttachments?.length
    );
  const isLoading =
    runtime.historyBusy.value ||
    runtime.messages.value.some(message => message.loading);

  const pending = getPendingVisibleMessage(session);

  session.description =
    runtime.isInitializing.value || pending
      ? 'Загрузка истории…'
      : isLoading
        ? runtime.preparationStatus.value
        : shorten(
            getVisibleMessageContent(
              lastMessage?.actionTask?.title ||
                lastMessage?.content ||
                lastMessage?.outputAttachments?.[0]?.name ||
                'Новый чат'
            )
          );
  session.time = formatTime(pending?.timestamp ?? lastMessage?.timestamp);
  syncSessionActivity(sessionId, runtime);
};

const loadMastra = (): Promise<typeof import('../services/useMastra')> => {
  if (!mastraModulePromise) {
    mastraModulePromise = import('../services/useMastra');
  }

  return mastraModulePromise;
};

const ensureRuntime = async (sessionId: string): Promise<MastraRuntime> => {
  await requireAiAccess();
  const existing = runtimes.get(sessionId);
  if (existing) return existing;

  const pendingRuntime = runtimePromises.get(sessionId);
  if (pendingRuntime) return pendingRuntime;

  const runtimePromise = loadMastra()
    .then(({ useMastra }) => {
      if (!useChatAccess().access.value.ai)
        throw new Error('Нет доступа к ИИ-ассистенту');
      const loadedRuntime = runtimes.get(sessionId);
      if (loadedRuntime) return loadedRuntime;

      const runtime = useMastra({
        agentId: 'generalAgent',
        chatId: sessionId,
        initializeServerHistory:
          getSession(sessionId)?.initializeServerHistory === true,
        approvalMode: permissionMode,
        responseMode,
        modelSelection
      }) as MastraRuntime;
      runtimes.set(sessionId, runtime);

      const stop = watch(
        [
          runtime.messages,
          runtime.isInitializing,
          runtime.pendingApproval,
          runtime.lastError,
          runtime.taskBusy,
          runtime.historyBusy,
          runtime.preparationStatus
        ],
        () => syncSession(sessionId, runtime),
        { deep: true, immediate: true }
      );
      runtimeWatchers.set(sessionId, stop);

      void fetchAiConversationInfo(sessionId)
        .then(applyConversationInfo)
        .catch((): void => {
          // Новый диалог ещё не создан на сервере. Его сообщения сохраняются штатным протоколом.
        });

      return runtime;
    })
    .finally(() => {
      runtimePromises.delete(sessionId);
    });

  runtimePromises.set(sessionId, runtimePromise);
  return runtimePromise;
};

const activeSession = computed(() =>
  activeSessionId.value ? getSession(activeSessionId.value) : null
);

const activeAgentChat = computed(() =>
  activeView.value === 'agents'
    ? (getDesktopAgentChat(activeSessionId.value) ?? agentSelection.value ?? undefined)
    : undefined
);
const activeAgentModelOption = computed(() =>
  activeAgentChat.value?.configOptions.find(option => option.category === 'model')
);
const availableAgentModels = computed(() => {
  const connectedModels = agentChoices(activeAgentModelOption.value);

  return connectedModels.length ? connectedModels : agentModelCatalog.value;
});
const preferredAgentModel = computed<string>(() =>
  availableAgentModels.value.some(choice => choice.value === agentModel.value)
    ? agentModel.value
    : activeAgentModelOption.value?.currentValue ?? availableAgentModels.value[0]?.value ?? ''
);
const availableAgentEffort = computed<AgentOption | undefined>(() => {
  const model = preferredAgentModel.value;
  if (activeAgentModelOption.value?.currentValue === model) {
    return activeAgentChat.value?.configOptions.find(option => option.category === 'thought_level');
  }

  const entry = agentModelCatalog.value.find(choice => choice.value === model);
  if (!entry) return;

  return { id: 'effort', currentValue: entry.defaultEffort, options: entry.efforts };
});
const preferredAgentEffort = computed(
  () => agentEfforts.value[preferredAgentModel.value] ??
    availableAgentEffort.value?.currentValue ?? 'default'
);

async function refreshAgentModels(): Promise<void> {
  if (!hasDesktopAgentTab.value || agentModelsLoading.value || agentModelCatalog.value.length) return;

  agentModelsLoading.value = true;
  agentModelsError.value = '';
  try {
    agentModelCatalog.value = await fetchDesktopAgentModels();
  } catch (error) {
    agentModelsError.value = typeof error === 'string'
      ? error
      : 'Не удалось загрузить список моделей.';
  } finally {
    agentModelsLoading.value = false;
  }
}

watch(activeView, (view): void => {
  if (view === 'agents') void refreshAgentModels();
}, { immediate: true });

function syncAgentChat(chat: DesktopAgentChat): void {
  const session = getSession(chat.id);
  if (!session || session.kind !== 'agent') return;

  session.messages = chat.messages.flatMap((message, index) =>
    message.loading && !message.content.trim()
      ? []
      : [
          {
            id: message.id ?? getLocalAiMessageId(session.id, message, index),
            nativeId: message.id,
            role: message.role,
            text: getVisibleMessageContent(message.content),
            time: formatTime(message.timestamp),
            timestamp: message.timestamp,
            durationMs: message.durationMs,
            reasoningSummaries: message.reasoningSummaries,
            workLog: message.workLog,
            projectFiles: message.projectFiles,
            outputAttachments: message.outputAttachments,
            pinned: message.pinned,
            replyTo: message.replyTo
          }
        ]
  );

  let activity = sessionActivities[chat.id];
  if (!activity && chat.error) {
    beginSessionActivity(session);
    activity = sessionActivities[chat.id];
  }

  const progress = chat.permissions.length
    ? ACTIVITY_CONFIRMATION_REQUIRED
    : chat.toolTitle || 'Подготавливаю ответ';

  if (activity) {
    activity.title = session.title;
    if (chat.error) setActivityStatus(activity, 'error', chat.error);
    else if (chat.running) {
      setActivityStatus(
        activity,
        chat.permissions.length ? 'attention' : 'running',
        progress
      );
    }
  }

  const last = session.messages.findLast(message => message.text.trim());
  session.project = chat.project ?? undefined;
  session.description = shorten(
    chat.error || (chat.running ? progress : last?.text || 'Новый чат')
  );
  session.time = last?.time ?? session.time;
}

function observeAgentChat(chat: DesktopAgentChat): void {
  if (observedAgentChats.has(chat.id)) return;
  observedAgentChats.set(
    chat.id,
    watch(
      () => [
        chat.messages,
        chat.project,
        chat.running,
        chat.toolTitle,
        chat.permissions.length,
        chat.error
      ],
      (): void => syncAgentChat(chat),
      { deep: true, immediate: true }
    )
  );
}

async function loadAgentSession(
  session: AiAssistantSession
): Promise<DesktopAgentChat> {
  const ownerId = getChatAuthSession()?.user?.id;
  if (!ownerId || session.agentOwnerId !== ownerId) {
    throw new Error('Локальный чат доступен только владельцу.');
  }

  const chat = await loadDesktopAgentChat(
    session.id,
    ownerId,
    session.project ?? null
  );
  observeAgentChat(chat);
  return chat;
}

async function chooseAgentDirectory(
  activateWithDraft?: (activate: () => void) => void
): Promise<DesktopAgentChat | undefined> {
  if (activeView.value !== 'agents' || isChoosingAgentDirectory.value) return;
  const ownerId = getChatAuthSession()?.user?.id;
  if (!ownerId) return;

  const previous = activeSession.value;
  const previousId = activeSessionId.value;
  isChoosingAgentDirectory.value = true;
  let chat: DesktopAgentChat | undefined;
  let reuseChat = false;
  try {
    await requireAiAccess();
    if (activeView.value !== 'agents' || activeSessionId.value !== previousId)
      return;

    const current = previous ? await loadAgentSession(previous) : undefined;
    // Текущий процесс держит папку и модель до конца запроса.
    reuseChat = Boolean(current && !current.running && !current.busy);
    chat =
      reuseChat && current
        ? current
        : await loadDesktopAgentChat(generateUUID(), ownerId, null);
    agentSelection.value = chat;

    const project = await connectDesktopAgentChat(
      chat,
      preferredAgentModel.value,
      () => permissionMode.value === 'automatic',
      { previousDirectory: current?.project?.directory }
    );
    if (!project) return;
    if (getChatAuthSession()?.user?.id !== ownerId) {
      await discardDesktopAgentChat(chat);
      return;
    }
    if (reuseChat && previous) {
      previous.project = project;
    } else {
      const activate =
        activeView.value === 'agents' && activeSessionId.value === previousId;
      if (activate) markSessionInactive(previousId);

      const session = createSession(
        project.directory.split(/[\\/]/).filter(Boolean).at(-1) || 'Новый чат',
        'agent',
        { id: chat.id, ownerId, project },
        false
      );
      if (activate) {
        const activateSession = (): void => {
          activeSessionId.value = session.id;
        };
        if (activateWithDraft) activateWithDraft(activateSession);
        else activateSession();
      }
      observeAgentChat(chat);
    }
    await applyAgentPreference(chat);

    return chat;
  } finally {
    agentSelection.value = null;
    isChoosingAgentDirectory.value = false;
    if (chat && !reuseChat && !getSession(chat.id)) {
      await discardDesktopAgentChat(chat);
    }
  }
}

function setAssistantModel(id: string): void {
  if (!responseCatalog.value?.models.some(model => model.id === id)) return;
  chatModel.value = id;
  const { quick, advanced } = responseCatalog.value.defaults;
  if (quick !== advanced && (id === quick || id === advanced))
    responseMode.value = id === quick ? 'quick' : 'advanced';
}

function setChatEffort(effort: string): void {
  const model = activeResponseModel.value;
  if (model?.efforts.includes(effort)) chatEfforts.value[model.id] = effort;
}

async function setAgentModel(model: string): Promise<void> {
  const chat = activeAgentChat.value;
  if (!availableAgentModels.value.some(choice => choice.value === model)) return;

  agentModel.value = model;
  if (chat?.connected && !chat.running && !chat.busy) {
    await applyAgentPreference(chat);
  }
}

async function setAssistantEffort(effort: string): Promise<void> {
  const chat = activeAgentChat.value;
  const model = preferredAgentModel.value;
  if (!model || !agentChoices(availableAgentEffort.value).some(choice => choice.value === effort)) return;

  if (chat?.connected && !chat.running && !chat.busy) {
    await setDesktopAgentOption(chat, 'thought_level', effort);
  }
  agentEfforts.value[model] = effort;
}

async function applyAgentPreference(chat: DesktopAgentChat): Promise<void> {
  const models = chat.configOptions.find(option => option.category === 'model');
  if (agentChoices(models).some(choice => choice.value === preferredAgentModel.value)) {
    await setDesktopAgentOption(chat, 'model', preferredAgentModel.value);
  }

  const model = chat.configOptions.find(
    option => option.category === 'model'
  )?.currentValue;
  const option = chat.configOptions.find(
    item => item.category === 'thought_level'
  );
  if (!model || !option) return;

  const effort = agentEfforts.value[model] ?? 'default';
  if (agentChoices(option).some(choice => choice.value === effort)) {
    await setDesktopAgentOption(chat, 'thought_level', effort);
  }
}

async function sendAgentMessage(
  text: string,
  files: File[] = [],
  replyTo?: AIMessageReference,
  onAccepted?: () => void,
  editId?: string
): Promise<string | null> {
  const session = activeSession.value;
  if (session?.kind !== 'agent') throw new Error('Сначала подключите папку проекта.');

  const chat = await loadAgentSession(session);
  if (activeSessionId.value !== chat.id) return null;
  if (chat.busy || chat.running) return null;

  if (!chat.connected) {
    if (!chat.project) throw new Error('Сначала подключите папку проекта.');

    await connectDesktopAgentChat(
      chat,
      preferredAgentModel.value,
      (): boolean => permissionMode.value === 'automatic',
      { savedProject: chat.project }
    );
    if (!chat.connected || activeSessionId.value !== chat.id) return null;
  }

  let previousMessages: AIMessage[] | undefined;
  if (editId) {
    const index = chat.messages.findIndex(
      message => message.id === editId && message.role === 'user'
    );
    if (index < 0) return null;
    previousMessages = chat.messages.slice(0, index);
    await resetDesktopAgentContext(chat);
  }

  await applyAgentPreference(chat);
  if (activeSessionId.value !== chat.id) return null;

  const result = await sendDesktopAgentPrompt(
    chat,
    text,
    files,
    replyTo,
    (): void => {
      beginSessionActivity(session);
      onAccepted?.();
    },
    previousMessages
  );
  const activity = sessionActivities[chat.id];
  if (result.accepted && activity) {
    if (chat.error) setActivityStatus(activity, 'error', chat.error);
    else if (result.cancelled)
      setActivityStatus(activity, 'attention', 'Ответ остановлен');
    else setActivityStatus(activity, 'success', 'Ответ готов');
  }
  return result.responseText;
}

const activeTask = computed(
  () =>
    persisted.tasks.find(task => task.sessionId === activeSessionId.value) ||
    null
);

const isActiveTaskSession = computed(
  () => !!activeSession.value && isTaskSession(activeSession.value)
);

const activeRuntime = computed(() =>
  activeSessionId.value ? runtimes.get(activeSessionId.value) || null : null
);

const pendingVisibleMessage = computed((): AiAssistantMessage | undefined =>
  getPendingVisibleMessage(activeSession.value)
);

const visibleMessages = computed((): AiAssistantMessage[] => {
  const messages = activeSession.value?.messages ?? [];
  const pending = pendingVisibleMessage.value;

  return pending ? [...messages, pending] : messages;
});

const activeTitle = computed((): string => {
  if (activeView.value === 'tasks') return 'СЭПи';
  return activeSession.value?.title || 'СЭПи';
});

const isThinking = computed(() => {
  if (activeView.value === 'agents') {
    return !!(
      activeAgentChat.value?.running || activeAgentChat.value?.loadingHistory
    );
  }
  const runtime = activeRuntime.value;
  return Boolean(
    (activeSessionId.value && pendingMessages.has(activeSessionId.value)) ||
      runtime?.isInitializing.value ||
      runtime?.historyBusy.value ||
      runtime?.messages.value.some(
        message => message.loading && !message.actionTask
      )
  );
});

const preparationStatus = computed(() => {
  if (activeView.value === 'agents') {
    return activeAgentChat.value?.loadingHistory
      ? 'Загружаю историю'
      : activeAgentChat.value?.toolTitle || 'Подготавливаю ответ';
  }
  return activeRuntime.value?.isInitializing.value ||
    pendingVisibleMessage.value
    ? 'Загружаю историю'
    : activeRuntime.value?.preparationStatus.value || 'Подготавливаю ответ';
});
const conversationError = computed((): string | null => {
  const isAgent = activeView.value === 'agents';
  const messages = isAgent
    ? activeAgentChat.value?.messages
    : activeRuntime.value?.messages.value;
  const error = isAgent
    ? activeAgentChat.value?.error
    : activeRuntime.value?.lastError.value;
  if (!error) return null;

  const lastMessage = messages?.at(-1);

  return lastMessage?.role === 'assistant' && lastMessage.content === error
    ? null
    : error;
});
const taskBusy = computed(() => activeRuntime.value?.taskBusy.value || false);
/** Подтверждает точный сохранённый план без нового запроса к модели. */
const resolveActionTask = async (id: string, decision: AiActionDecision) => {
  if (!activeSessionId.value) return;
  const runtime = await ensureRuntime(activeSessionId.value);
  await runtime.resolveActionTask(id, decision);
};

const backgroundActivities = computed(() =>
  (useChatAccess().access.value.ai &&
  activitiesOwnerId.value === getChatAuthSession()?.user?.id
    ? Object.values(sessionActivities)
    : []
  )
    .filter(activity => activity.isBackground && getSession(activity.sessionId))
    .sort((left, right) => right.updatedAt - left.updatedAt)
);

const markSessionInactive = (sessionId: string | null): void => {
  if (!sessionId) return;

  inactiveSessionIds.add(sessionId);
  const activity = sessionActivities[sessionId];
  const awaitingApproval =
    runtimes.get(sessionId)?.pendingApproval.value ||
    getDesktopAgentChat(sessionId)?.permissions.length;

  if (
    activity?.status === 'running' ||
    (activity?.status === 'attention' && awaitingApproval)
  ) {
    activity.isBackground = true;
    activity.updatedAt = Date.now();
  }
};

const markSessionActivityViewed = (sessionId: string): void => {
  inactiveSessionIds.delete(sessionId);

  const activity = sessionActivities[sessionId];
  if (activity) activity.isBackground = false;
};

const beginSessionActivity = (session: AiAssistantSession): void => {
  const ownerId = getChatAuthSession()?.user?.id;
  if (activitiesOwnerId.value !== ownerId) {
    for (const id of Object.keys(sessionActivities))
      delete sessionActivities[id];
    restoringActivityIds.clear();
    activitiesOwnerId.value = ownerId;
  }
  restoringActivityIds.delete(session.id);
  sessionActivities[session.id] = {
    sessionId: session.id,
    title: session.title,
    description: 'Выполняется…',
    status: 'running',
    updatedAt: Date.now(),
    isBackground: inactiveSessionIds.has(session.id)
  };
};

const applyConversationInfo = (info: AiConversationInfo): void => {
  let session = getSession(info.threadId);
  if (!session) {
    session = {
      id: info.threadId,
      title: info.title || 'СЭПи',
      description: '',
      time: '',
      messages: []
    };
    persisted.sessions.unshift(session);
  }
  if (info.title) session.title = info.title;
  session.muted = info.muted;
  persist();
};

const pendingMessageNavigation = ref<{
  sessionId: string;
  messageId: string;
} | null>(null);

const requestMessageNavigation = (
  sessionId: string,
  messageId: string
): void => {
  pendingMessageNavigation.value = { sessionId, messageId };
};

const startNewSession = (kind: 'chat' | 'agent' = 'chat'): void => {
  markSessionInactive(activeSessionId.value);
  const agent = kind === 'agent' && hasDesktopAgentTab.value;
  activeTab.value = agent ? 'agents' : 'chats';
  activeView.value = agent ? 'agents' : 'chat';
  activeSessionId.value = null;
};

watch(hasDesktopAgentTab, available => {
  if (!available && (activeTab.value === 'agents' || activeView.value === 'agents')) {
    startNewSession();
  }
});

const selectSession = (sessionId: string): void => {
  const session = getSession(sessionId);
  if (!session) return;

  if (activeSessionId.value !== sessionId) {
    markSessionInactive(activeSessionId.value);
  }

  activeTab.value =
    session.kind === 'agent'
      ? 'agents'
      : isTaskSession(session)
        ? 'tasks'
        : 'chats';
  activeView.value = session.kind === 'agent' ? 'agents' : 'chat';
  activeSessionId.value = sessionId;
  markSessionActivityViewed(sessionId);
  const history =
    session.kind === 'agent'
      ? loadAgentSession(session).then(async (chat): Promise<void> => {
          if (activeSessionId.value === sessionId && chat.connected) {
            await applyAgentPreference(chat);
          }
        })
      : ensureRuntime(sessionId);
  void history.catch(error => {
    console.error('Failed to load AI runtime:', error);
  });
};

/** Раздел определяется назначением диалога, а не текущим видом его редактора. */
const isTaskSession = (session: AiAssistantSession): boolean =>
  session.kind === 'task' ||
  persisted.tasks.some(task => task.sessionId === session.id);

/** Открывает ещё не сохранённую автоматизацию в разделе задач. */
const selectTaskSession = (sessionId: string): void => {
  selectSession(sessionId);
  if (activeSessionId.value === sessionId) activeTab.value = 'tasks';
};

const setTab = (tab: AiAssistantTab): void => {
  if (tab === 'agents' && !hasDesktopAgentTab.value) return;

  markSessionInactive(activeSessionId.value);
  activeSessionId.value = null;
  activeTab.value = tab;
  activeView.value = tab === 'chats' ? 'chat' : tab;
};

const showTasks = (): void => {
  markSessionInactive(activeSessionId.value);
  activeSessionId.value = null;
  activeTab.value = 'tasks';
  activeView.value = 'tasks';
};

/** Открывает чистую форму новой задачи без привязки к ранее выбранному чату. */
const startNewTask = (): void => {
  markSessionInactive(activeSessionId.value);
  activeTab.value = 'tasks';
  activeView.value = 'tasks';
  activeSessionId.value = null;
};

const createSession = (
  input: string,
  kind: 'chat' | 'task' | 'agent' = 'chat',
  agent?: { id: string; ownerId: string; project: AgentProject },
  activate = true
): AiAssistantSession => {
  const session: AiAssistantSession = {
    id: agent?.id ?? generateUUID(),
    initializeServerHistory: kind !== 'agent',
    kind,
    agentOwnerId: agent?.ownerId,
    project: agent?.project,
    title: shorten(input, 36),
    description: 'Думает…',
    time: formatTime(),
    messages: []
  };
  persisted.sessions.unshift(session);
  const folders = useChatFolders('ai');
  if (folders.activeFolderId.value) {
    void folders
      .setAiItemInFolder(
        folders.activeFolderId.value,
        { type: 'session', id: session.id },
        true
      )
      .catch((error: unknown): void => {
        showNotification({
          title: 'Не удалось добавить чат в папку',
          description: error
        });
      });
  }
  if (activate) activeSessionId.value = session.id;
  inactiveSessionIds.delete(session.id);
  return session;
};

/** Готовит отображаемый текст запроса с понятным перечнем вложений. */
const buildVisibleInput = (
  rawInput: string,
  attachments: AiAttachmentReference[]
): string => {
  const input =
    rawInput.trim() ||
    (attachments.length > 0
      ? attachments.length === 1
        ? 'Проанализируй содержимое прикреплённого файла и кратко опиши его.'
        : 'Проанализируй содержимое прикреплённых файлов и кратко опиши каждый из них.'
      : '');
  if (!input) return '';

  const attachmentSummary = attachments.length
    ? `Прикреплено: ${attachments
        .map(attachment => `«${attachment.name}»`)
        .join(', ')}`
    : '';

  return attachmentSummary ? `${input}\n\n${attachmentSummary}` : input;
};

/** Отправляет сообщение каноническим путём и возвращает готовый ответ ассистента. */
const sendMessage = async (
  rawInput: string,
  attachments: AiAttachmentReference[] = [],
  replyTo?: AIMessageReference,
  modelInput?: string,
  onAccepted?: () => void,
  voice?: VoiceReplyOptions
): Promise<string | null> => {
  const submittedView = activeView.value;
  if (submittedView === 'agents') {
    return rawInput.trim()
      ? sendAgentMessage(modelInput ?? rawInput, [], replyTo, onAccepted)
      : null;
  }

  const visibleInput = buildVisibleInput(rawInput, attachments);
  if (!visibleInput) return null;

  const currentSession = activeSession.value;
  if (currentSession) {
    if (pendingMessages.has(currentSession.id)) return null;
    const runtime = await ensureRuntime(currentSession.id);
    if (
      activeSessionId.value !== currentSession.id ||
      activeView.value !== submittedView
    )
      return null;
    const approvalDecision = voice
      ? null
      : approvalDecisionFromMessage(visibleInput);
    if (approvalDecision && runtime.pendingApproval.value) {
      if (isThinking.value) return null;

      beginSessionActivity(currentSession);
      try {
        const result = await runtime.resolveToolApproval(
          approvalDecision,
          undefined,
          undefined,
          onAccepted
        );
        syncSession(currentSession.id, runtime);
        return result.responseText;
      } finally {
        void refreshAutomations();
      }
    }
  }

  if (isThinking.value) return null;

  const isTaskRequest = activeView.value === 'tasks';
  if (isTaskRequest) {
    markSessionInactive(activeSessionId.value);
    activeSessionId.value = null;
  }

  const session =
    activeSession.value ||
    createSession(visibleInput, isTaskRequest ? 'task' : 'chat');
  activeTab.value = isTaskSession(session) ? 'tasks' : 'chats';
  activeView.value = 'chat';
  if (pendingMessages.has(session.id)) return null;

  const localMessageId = generateUUID();
  const timestamp = Date.now();
  pendingMessages.set(session.id, {
    id: localMessageId,
    role: 'user',
    text: getVisibleMessageContent(visibleInput),
    time: formatTime(timestamp),
    timestamp,
    pending: true,
    replyTo
  });

  let runtime: MastraRuntime | undefined;
  try {
    runtime = await ensureRuntime(session.id);
    beginSessionActivity(session);
    const result = await runtime.sendMessage(
      visibleInput,
      undefined,
      undefined,
      attachments,
      replyTo,
      modelInput,
      onAccepted,
      voice,
      localMessageId
    );
    return result.responseText;
  } finally {
    if (pendingMessages.get(session.id)?.id === localMessageId)
      pendingMessages.delete(session.id);
    if (runtime && runtimes.get(session.id) === runtime)
      syncSession(session.id, runtime);
    void refreshAutomations();
  }
};

const sendSuggestedPrompt = async (
  prompt: 'summary' | 'tasks'
): Promise<void> => {
  startNewSession();
  await sendMessage(
    prompt === 'tasks' ? 'Мои задачи на сегодня' : 'Сводка по чатам за сегодня'
  );
};

const updateApproval = async (
  messageId: string,
  state: 'approved' | 'rejected',
  voice?: VoiceReplyOptions
): Promise<string | null> => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return null;

  const runtime = await ensureRuntime(sessionId);
  if (!runtime.pendingApproval.value) return null;

  approvalStates[messageId] = state;
  syncSession(sessionId, runtime);
  const result = await runtime.resolveToolApproval(
    state === 'approved' ? 'approve' : 'decline',
    undefined,
    undefined,
    undefined,
    voice
  );
  await refreshAutomations();

  return result.responseText;
};

/** Закрепляет или открепляет отдельное сообщение в активном AI-чате. */
const toggleMessagePin = async (messageId: string): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId || isThinking.value) return;
  if (activeSession.value?.kind === 'agent') {
    const chat = await loadAgentSession(activeSession.value);
    const message = chat.messages.find(item => item.id === messageId);
    if (message) {
      message.pinned = !message.pinned;
      await persistDesktopAgentMessages(chat);
    }
    return;
  }

  const runtime = await ensureRuntime(sessionId);
  const messageIndex = getRuntimeMessageIndex(sessionId, messageId, runtime);
  if (messageIndex < 0) return;

  await runtime.toggleMessagePin(messageIndex);
  syncSession(sessionId, runtime);
};

/** Удаляет выбранные сообщения из активной AI-истории. */
const deleteMessages = async (messageIds: string[]): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId || isThinking.value || messageIds.length === 0) return;
  if (activeSession.value?.kind === 'agent') {
    const chat = await loadAgentSession(activeSession.value);
    await resetDesktopAgentContext(chat);
    await applyAgentPreference(chat);
    chat.messages = chat.messages.filter(
      message => !message.id || !messageIds.includes(message.id)
    );
    await persistDesktopAgentMessages(chat);
    return;
  }

  const runtime = await ensureRuntime(sessionId);
  if (runtime.pendingApproval.value) {
    throw new Error('Сначала подтвердите или отмените ожидающее действие.');
  }
  const messageIndexes = messageIds
    .map(messageId => getRuntimeMessageIndex(sessionId, messageId, runtime))
    .filter(index => index >= 0);
  if (messageIndexes.length === 0) return;

  await runtime.deleteMessages(messageIndexes);
  syncSession(sessionId, runtime);
};

/** Редактирует запрос пользователя и повторно запускает AI с этого места истории. */
const editMessageAndResend = async (
  messageId: string,
  rawInput: string,
  attachments: AiAttachmentReference[] = [],
  replyTo?: AIMessageReference,
  onAccepted?: () => void
): Promise<void> => {
  const sessionId = activeSessionId.value;
  const visibleInput = buildVisibleInput(rawInput, attachments);
  if (!sessionId || !visibleInput || isThinking.value) return;

  const runtime = await ensureRuntime(sessionId);
  if (runtime.pendingApproval.value) {
    throw new Error('Сначала подтвердите или отмените ожидающее действие.');
  }
  const messageIndex = getRuntimeMessageIndex(sessionId, messageId, runtime);
  const session = getSession(sessionId);
  if (messageIndex < 0 || !session) return;

  beginSessionActivity(session);
  await runtime.editMessageAndResend(
    messageIndex,
    visibleInput,
    attachments,
    replyTo,
    onAccepted
  );
  syncSession(sessionId, runtime);
};

const toggleSessionPin = (sessionId: string): void => {
  const session = getSession(sessionId);
  if (session) session.pinned = !session.pinned;
};

function updateAgentConversation(
  sessionId: string,
  patch: { title?: string; muted?: boolean }
): void {
  const session = getSession(sessionId);
  if (session?.kind !== 'agent') return;
  if (patch.title) session.title = patch.title;
  if (patch.muted !== undefined) session.muted = patch.muted;
}

const deleteSession = async (sessionId: string): Promise<void> => {
  const session = getSession(sessionId);
  if (!session) return;
  try {
    if (session.kind === 'agent') {
      const chat = await loadAgentSession(session);
      if (chat.busy || chat.running)
        throw new Error('Дождитесь завершения операции.');
      chat.messages = [];
      await persistDesktopAgentMessages(chat);
      await discardDesktopAgentChat(chat);
      observedAgentChats.get(sessionId)?.();
      observedAgentChats.delete(sessionId);
    } else {
      await (await ensureRuntime(sessionId)).deleteConversation();
    }
  } catch (error) {
    showErrorNotification(getAiErrorMessage(error));
    return;
  }
  runtimeWatchers.get(sessionId)?.();
  runtimeWatchers.delete(sessionId);
  runtimes.delete(sessionId);
  delete sessionActivities[sessionId];
  inactiveSessionIds.delete(sessionId);
  const index = persisted.sessions.findIndex(item => item.id === sessionId);
  if (index >= 0) persisted.sessions.splice(index, 1);

  if (activeSessionId.value === sessionId)
    startNewSession(session.kind === 'agent' ? 'agent' : 'chat');
  inactiveSessionIds.delete(sessionId);
};

const toggleTask = async (taskId: string): Promise<void> => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task) return;
  selectTask(taskId);
  await sendMessage(
    `${task.enabled ? 'Приостанови' : 'Возобнови'} автоматизацию «${task.title}»`
  );
};

const toggleTaskPin = (taskId: string): void => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (task) task.pinned = !task.pinned;
};

const deleteTask = async (taskId: string): Promise<void> => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task) return;
  selectTask(taskId);
  await sendMessage(`Удали автоматизацию «${task.title}»`);
};

/** Синхронизирует серверные расписания и доставляет последний фоновый результат в их чат. */
const refreshAutomations = (): Promise<void> => {
  if (!useChatAccess().access.value.ai) return Promise.resolve();
  if (automationRefreshPromise) return automationRefreshPromise;
  automationRefreshPromise = afterStartupPaint()
    .then(() => (useChatAccess().access.value.ai ? fetchAiAutomations() : null))
    .then(async automations => {
      if (!automations) return;
      const previous = new Map(persisted.tasks.map(task => [task.id, task]));
      persisted.tasks = automations.map(automation => ({
        id: automation.id,
        sessionId: automation.sessionId,
        title: automation.title,
        description: automation.schedule,
        schedule: automation.schedule,
        enabled: automation.status === 'active',
        nextRunAt: automation.nextRunAt,
        lastRunAt: automation.lastRunAt,
        pinned: previous.get(automation.id)?.pinned
      }));
      await Promise.all(automations.map(syncAutomationResult));
    })
    .catch(error => {
      console.warn('Failed to refresh AI automations:', error);
    })
    .finally(() => {
      automationRefreshPromise = null;
    });
  return automationRefreshPromise;
};

/** Добавляет серверную сессию и один раз сохраняет результат конкретного запуска. */
const syncAutomationResult = async (
  automation: AiAutomationSummary
): Promise<void> => {
  let session = getSession(automation.sessionId);
  if (!session) {
    session = {
      id: automation.sessionId,
      kind: 'task',
      title: automation.title,
      description: automation.schedule,
      time: formatTime(
        automation.lastRunAt ?? automation.nextRunAt ?? undefined
      ),
      messages: []
    };
    persisted.sessions.unshift(session);
  } else {
    session.kind = 'task';
    session.title = automation.title;
  }
  const result = automation.lastResult;
  if (!result) {
    session.description = automation.schedule;
    return;
  }

  const sourceId = `automation:${automation.id}:${result.runId ?? result.completedAt}`;
  const message: AIMessage = {
    role: 'assistant',
    content: result.text,
    timestamp: result.completedAt,
    sourceId
  };
  const runtime = runtimes.get(automation.sessionId);
  if (runtime) {
    await runtime.appendExternalMessage(message);
    syncSession(automation.sessionId, runtime);
    return;
  }

  const { messages: history, conversationGeneration } =
    await getChatHistorySnapshot(automation.sessionId);
  if (history.some(item => item.sourceId === sourceId)) return;
  await saveMessages(
    automation.sessionId,
    [...history, message],
    conversationGeneration ?? 0
  );
  session.description = shorten(result.text);
  session.time = formatTime(result.completedAt);
};

/** Запускает синхронизацию после первого кадра, при возврате на вкладку и раз в минуту. */
const startAutomationPolling = (): void => {
  if (automationPollingStarted || typeof window === 'undefined') return;
  automationPollingStarted = true;
  void afterStartupPaint().then(() => {
    void refreshAutomations();
    window.addEventListener('focus', () => void refreshAutomations());
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAutomations();
    }, 60_000);
  });
};

/** Открывает чат, в котором агент выполнял выбранную задачу. */
const selectTask = (taskId: string): string | null => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task?.sessionId || !getSession(task.sessionId)) {
    showTasks();
    return null;
  }

  selectSession(task.sessionId);
  activeTab.value = 'tasks';
  return task.sessionId;
};

const clearSession = async (sessionId: string): Promise<void> => {
  const session = getSession(sessionId);
  if (!session) return;
  if (session.kind === 'agent') {
    try {
      const chat = await loadAgentSession(session);
      if (chat.busy || chat.running)
        throw new Error('Дождитесь завершения операции.');
      await resetDesktopAgentContext(chat);
      await applyAgentPreference(chat);
      chat.messages = [];
      await persistDesktopAgentMessages(chat);
      chat.error = null;
      delete sessionActivities[sessionId];
      inactiveSessionIds.delete(sessionId);
    } catch (error) {
      showErrorNotification(getAiErrorMessage(error));
    }
    return;
  }
  const runtime = await ensureRuntime(sessionId);
  try {
    await runtime.clearMessages();
  } catch (error) {
    showErrorNotification(getAiErrorMessage(error));
    return;
  }
  syncSession(sessionId, runtime);
  delete sessionActivities[sessionId];
  inactiveSessionIds.delete(sessionId);
};

const clearAll = async (): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  await clearSession(sessionId);
};

watch(
  () => useChatAccess().access.value.ai,
  allowed => {
    if (!allowed || activitiesOwnerId.value !== getChatAuthSession()?.user?.id)
      return;
    for (const sessionId of restoringActivityIds) {
      if (getSession(sessionId)?.kind === 'agent') {
        const activity = sessionActivities[sessionId];
        if (
          activity?.status === 'running' ||
          (activity?.status === 'attention' &&
            activity.description === ACTIVITY_CONFIRMATION_REQUIRED)
        ) {
          setActivityStatus(
            activity,
            'attention',
            'Подключите папку, чтобы продолжить работу.'
          );
        }
        restoringActivityIds.delete(sessionId);
        continue;
      }
      void ensureRuntime(sessionId).catch(error => {
        const activity = sessionActivities[sessionId];
        if (activity && useChatAccess().access.value.ai)
          setActivityStatus(activity, 'error', getAiErrorMessage(error));
      });
    }
  },
  { immediate: true }
);

export const useAiAssistant = () => {
  startAutomationPolling();
  return {
    sessions: computed(() => persisted.sessions.filter(canViewSession)),
    tasks: computed(() => persisted.tasks),
    activeTab,
    activeView,
    hasDesktopAgentTab,
    activeSessionId,
    activeSession,
    activeAgentChat,
    preferredAgentModel,
    preferredAgentEffort,
    availableAgentModels,
    availableAgentEffort,
    agentModelsLoading,
    agentModelsError,
    refreshAgentModels,
    isChoosingAgentDirectory,
    chooseAgentDirectory,
    setAssistantModel,
    responseCatalog,
    activeResponseModel,
    modelSelection,
    setChatEffort,
    setAgentModel,
    setAssistantEffort,
    sendAgentMessage,
    visibleMessages,
    activeTask,
    isActiveTaskSession,
    activeTitle,
    isThinking,
    preparationStatus,
    conversationError,
    taskBusy,
    resolveActionTask,
    backgroundActivities,
    isVoiceModeOpen,
    isVoiceModalVisible,
    voiceCallStartedAt,
    permissionMode,
    responseMode,
    startVoiceCall,
    hideVoiceCall,
    showVoiceCall,
    stopVoiceCall,
    startNewSession,
    startNewTask,
    selectSession,
    applyConversationInfo,
    updateAgentConversation,
    pendingMessageNavigation,
    requestMessageNavigation,
    selectTaskSession,
    selectTask,
    setTab,
    showTasks,
    sendMessage,
    sendSuggestedPrompt,
    updateApproval,
    toggleMessagePin,
    deleteMessages,
    editMessageAndResend,
    markSessionInactive,
    toggleSessionPin,
    deleteSession,
    clearSession,
    toggleTask,
    toggleTaskPin,
    deleteTask,
    refreshAutomations,
    clearAll
  };
};
