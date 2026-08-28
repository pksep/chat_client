import {
  computed,
  reactive,
  ref,
  shallowReactive,
  watch,
  type Ref,
  type WatchStopHandle
} from 'vue';
import type { PendingToolApproval } from '../services/mastraApproval';
import type { AiAttachmentReference } from '../services/aiAttachments';
import type { AIMessage, AIMessageReference } from '../types/messages';
import { generateUUID } from '../utils/generateUUID';

export type AiAssistantTab = 'chats' | 'tasks';
export type AiAssistantView = 'chat' | 'tasks';
export type AiMessageRole = 'user' | 'assistant';
export type AiPermissionMode = 'ask' | 'automatic';

export interface AiAssistantMessage {
  id: string;
  role: AiMessageRole;
  text: string;
  time: string;
  showApproval?: boolean;
  approvalState?: 'approved' | 'rejected' | null;
  pinned?: boolean;
  replyTo?: AIMessageReference;
}

export interface AiAssistantSession {
  id: string;
  title: string;
  description: string;
  time: string;
  pinned?: boolean;
  messages: AiAssistantMessage[];
}

export interface AiAutomationTask {
  id: string;
  sessionId?: string;
  title: string;
  description: string;
  schedule: string;
  enabled: boolean;
  pinned?: boolean;
}

interface PersistedAiState {
  sessions: AiAssistantSession[];
  tasks: AiAutomationTask[];
  permissionMode: AiPermissionMode;
}

interface MastraRuntime {
  messages: Ref<AIMessage[]>;
  sendMessage: (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    attachments?: AiAttachmentReference[],
    replyTo?: AIMessageReference
  ) => Promise<void>;
  resolveToolApproval: (
    decision: 'approve' | 'decline',
    onFinish?: () => void,
    abortSignal?: AbortSignal
  ) => Promise<void>;
  clearMessages: () => Promise<void>;
  toggleMessagePin: (messageIndex: number) => Promise<void>;
  deleteMessages: (messageIndexes: number[]) => Promise<void>;
  editMessageAndResend: (
    messageIndex: number,
    input: string,
    replyTo?: AIMessageReference
  ) => Promise<void>;
  isInitializing: Ref<boolean>;
  pendingApproval: Ref<PendingToolApproval | null>;
}

const STORAGE_KEY = 'sep:chat:ai-assistant:v1';

const initialTasks = (): AiAutomationTask[] => [
  {
    id: 'daily-automation',
    title: 'Ежедневная сводка',
    description: 'Информация за рабочий день',
    schedule: 'Ежедневная сводка в 8:00',
    enabled: true,
    pinned: true
  }
];

const loadState = (): PersistedAiState => {
  const fallback: PersistedAiState = {
    sessions: [],
    tasks: initialTasks(),
    permissionMode: 'ask'
  };
  if (typeof window === 'undefined') return fallback;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as PersistedAiState) : null;

    if (!parsed || !Array.isArray(parsed.sessions)) return fallback;

    return {
      sessions: parsed.sessions.map(session => ({
        ...session,
        messages: []
      })),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : initialTasks(),
      permissionMode:
        parsed.permissionMode === 'automatic' ? 'automatic' : 'ask'
    };
  } catch {
    return fallback;
  }
};

const initialState = loadState();
const persisted = reactive<PersistedAiState>(initialState);
const activeTab = ref<AiAssistantTab>('chats');
const activeView = ref<AiAssistantView>('chat');
const activeSessionId = ref<string | null>(null);
const isVoiceModeOpen = ref(false);
const permissionMode = ref<AiPermissionMode>(initialState.permissionMode);
const runtimes = shallowReactive(new Map<string, MastraRuntime>());
const runtimePromises = new Map<string, Promise<MastraRuntime>>();
let mastraModulePromise: Promise<
  typeof import('../services/useMastra')
> | null = null;
const runtimeWatchers = new Map<string, WatchStopHandle>();
const approvalStates = reactive<
  Record<string, 'approved' | 'rejected' | undefined>
>({});

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
        permissionMode: permissionMode.value
      })
    );
  } catch {
    // История сообщений хранится в IndexedDB; метаданные меню сохраняются по возможности.
  }
};

watch(
  () => [persisted.sessions, persisted.tasks, permissionMode.value],
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

const getMessageId = (
  sessionId: string,
  message: AIMessage,
  index: number
): string => `${sessionId}:${message.timestamp ?? 'message'}:${index}`;

const getRuntimeMessageIndex = (
  sessionId: string,
  messageId: string,
  runtime: MastraRuntime
): number =>
  runtime.messages.value.findIndex(
    (message, index) => getMessageId(sessionId, message, index) === messageId
  );

const getSession = (sessionId: string): AiAssistantSession | null =>
  persisted.sessions.find(session => session.id === sessionId) || null;

const syncSession = (sessionId: string, runtime: MastraRuntime): void => {
  const session = getSession(sessionId);
  if (!session) return;

  const pendingApproval = runtime.pendingApproval.value;
  const lastSourceIndex = runtime.messages.value.length - 1;

  session.messages = runtime.messages.value.flatMap((message, index) => {
    if (message.loading && !message.content.trim()) return [];

    const id = getMessageId(sessionId, message, index);
    return [
      {
        id,
        role: message.role,
        text: message.content,
        time: formatTime(message.timestamp),
        showApproval:
          (Boolean(pendingApproval) &&
            index === lastSourceIndex &&
            message.role === 'assistant') ||
          Boolean(approvalStates[id]),
        approvalState: approvalStates[id] ?? null,
        pinned: Boolean(message.pinned),
        replyTo: message.replyTo
      }
    ];
  });

  const lastMessage = runtime.messages.value
    .slice()
    .reverse()
    .find(message => message.content.trim());
  const isLoading = runtime.messages.value.some(message => message.loading);

  session.description = runtime.isInitializing.value
    ? 'Загрузка истории…'
    : isLoading
      ? 'Думает…'
      : shorten(lastMessage?.content || 'Новый чат');
  session.time = formatTime(lastMessage?.timestamp);
};

const loadMastra = (): Promise<typeof import('../services/useMastra')> => {
  if (!mastraModulePromise) {
    mastraModulePromise = import('../services/useMastra');
  }

  return mastraModulePromise;
};

const ensureRuntime = async (sessionId: string): Promise<MastraRuntime> => {
  const existing = runtimes.get(sessionId);
  if (existing) return existing;

  const pendingRuntime = runtimePromises.get(sessionId);
  if (pendingRuntime) return pendingRuntime;

  const runtimePromise = loadMastra()
    .then(({ useMastra }) => {
      const loadedRuntime = runtimes.get(sessionId);
      if (loadedRuntime) return loadedRuntime;

      const runtime = useMastra({
        agentId: 'generalAgent',
        chatId: sessionId,
        approvalMode: permissionMode
      }) as MastraRuntime;
      runtimes.set(sessionId, runtime);

      const stop = watch(
        [runtime.messages, runtime.isInitializing, runtime.pendingApproval],
        () => syncSession(sessionId, runtime),
        { deep: true, immediate: true }
      );
      runtimeWatchers.set(sessionId, stop);

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

const activeRuntime = computed(() =>
  activeSessionId.value ? runtimes.get(activeSessionId.value) || null : null
);

const activeTitle = computed(() => {
  if (activeView.value === 'tasks') return 'СЭПИ';
  return activeSession.value?.title || 'СЭПИ';
});

const isThinking = computed(() => {
  const runtime = activeRuntime.value;
  return Boolean(
    runtime?.isInitializing.value ||
      runtime?.messages.value.some(message => message.loading)
  );
});

const startNewSession = (): void => {
  activeTab.value = 'chats';
  activeView.value = 'chat';
  activeSessionId.value = null;
};

const selectSession = (sessionId: string): void => {
  if (!getSession(sessionId)) return;

  activeTab.value = 'chats';
  activeView.value = 'chat';
  activeSessionId.value = sessionId;
  void ensureRuntime(sessionId).catch(error => {
    console.error('Failed to load AI runtime:', error);
  });
};

const setTab = (tab: AiAssistantTab): void => {
  activeTab.value = tab;
  activeView.value = tab === 'tasks' ? 'tasks' : 'chat';
};

const showTasks = (): void => {
  activeTab.value = 'tasks';
  activeView.value = 'tasks';
};

/** Открывает чистую форму новой задачи без привязки к ранее выбранному чату. */
const startNewTask = (): void => {
  activeTab.value = 'tasks';
  activeView.value = 'tasks';
  activeSessionId.value = null;
};

const createSession = (input: string): AiAssistantSession => {
  const session: AiAssistantSession = {
    id: generateUUID(),
    title: shorten(input, 36),
    description: 'Думает…',
    time: formatTime(),
    messages: []
  };
  persisted.sessions.unshift(session);
  activeSessionId.value = session.id;
  return session;
};

/** Добавляет пользовательскую задачу в список и связывает её с отдельной AI-сессией. */
const createAutomationTask = (
  session: AiAssistantSession,
  input: string
): AiAutomationTask => {
  const task: AiAutomationTask = {
    id: generateUUID(),
    sessionId: session.id,
    title: shorten(input, 36),
    description: 'Однократная задача',
    schedule: 'Однократно',
    enabled: true
  };
  persisted.tasks.unshift(task);
  return task;
};

const sendMessage = async (
  rawInput: string,
  replyTo?: AIMessageReference
): Promise<void> => {
  const input = rawInput.trim();
  if (!input || isThinking.value) return;

  const isTaskRequest = activeView.value === 'tasks';
  if (isTaskRequest) activeSessionId.value = null;

  activeTab.value = 'chats';
  activeView.value = 'chat';

  const session = activeSession.value || createSession(input);
  if (isTaskRequest) createAutomationTask(session, input);
  const runtime = await ensureRuntime(session.id);
  await runtime.sendMessage(input, undefined, undefined, [], replyTo);
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
  state: 'approved' | 'rejected'
): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  const runtime = await ensureRuntime(sessionId);
  if (!runtime.pendingApproval.value) return;

  approvalStates[messageId] = state;
  syncSession(sessionId, runtime);
  await runtime.resolveToolApproval(
    state === 'approved' ? 'approve' : 'decline'
  );
};

/** Закрепляет или открепляет отдельное сообщение в активном AI-чате. */
const toggleMessagePin = async (messageId: string): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId || isThinking.value) return;

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
  replyTo?: AIMessageReference
): Promise<void> => {
  const sessionId = activeSessionId.value;
  const input = rawInput.trim();
  if (!sessionId || !input || isThinking.value) return;

  const runtime = await ensureRuntime(sessionId);
  if (runtime.pendingApproval.value) {
    throw new Error('Сначала подтвердите или отмените ожидающее действие.');
  }
  const messageIndex = getRuntimeMessageIndex(sessionId, messageId, runtime);
  if (messageIndex < 0) return;

  await runtime.editMessageAndResend(messageIndex, input, replyTo);
  syncSession(sessionId, runtime);
};

const toggleSessionPin = (sessionId: string): void => {
  const session = getSession(sessionId);
  if (session) session.pinned = !session.pinned;
};

const deleteSession = (sessionId: string): void => {
  const index = persisted.sessions.findIndex(item => item.id === sessionId);
  if (index === -1) return;

  runtimes.get(sessionId)?.clearMessages();
  runtimeWatchers.get(sessionId)?.();
  runtimeWatchers.delete(sessionId);
  runtimes.delete(sessionId);
  persisted.sessions.splice(index, 1);

  if (activeSessionId.value === sessionId) startNewSession();
};

const toggleTask = (taskId: string): void => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (task) task.enabled = !task.enabled;
};

const toggleTaskPin = (taskId: string): void => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (task) task.pinned = !task.pinned;
};

const deleteTask = (taskId: string): void => {
  const index = persisted.tasks.findIndex(item => item.id === taskId);
  if (index !== -1) persisted.tasks.splice(index, 1);
};

/** Открывает чат, в котором агент выполнял выбранную задачу. */
const selectTask = (taskId: string): string | null => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task?.sessionId || !getSession(task.sessionId)) {
    showTasks();
    return null;
  }

  selectSession(task.sessionId);
  return task.sessionId;
};

const clearAll = async (): Promise<void> => {
  const sessionId = activeSessionId.value;
  if (!sessionId) return;

  const runtime = await ensureRuntime(sessionId);
  await runtime.clearMessages();
  syncSession(sessionId, runtime);
};

export const useAiAssistant = () => ({
  sessions: computed(() => persisted.sessions),
  tasks: computed(() => persisted.tasks),
  activeTab,
  activeView,
  activeSessionId,
  activeSession,
  activeTitle,
  isThinking,
  isVoiceModeOpen,
  permissionMode,
  startNewSession,
  startNewTask,
  selectSession,
  selectTask,
  setTab,
  showTasks,
  sendMessage,
  sendSuggestedPrompt,
  updateApproval,
  toggleMessagePin,
  deleteMessages,
  editMessageAndResend,
  toggleSessionPin,
  deleteSession,
  toggleTask,
  toggleTaskPin,
  deleteTask,
  clearAll
});
