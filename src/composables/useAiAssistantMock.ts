import { computed, reactive, ref, watch } from 'vue';

export type AiAssistantTab = 'chats' | 'tasks';
export type AiAssistantView = 'chat' | 'tasks';
export type AiMessageRole = 'user' | 'assistant';

export interface AiAssistantMessage {
  id: string;
  role: AiMessageRole;
  text: string;
  time: string;
  showApproval?: boolean;
  approvalState?: 'approved' | 'rejected' | null;
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
  title: string;
  description: string;
  schedule: string;
  enabled: boolean;
  pinned?: boolean;
}

interface PersistedAiState {
  sessions: AiAssistantSession[];
  tasks: AiAutomationTask[];
}

const STORAGE_KEY = 'sep:chat:ai-assistant-mock:v6';

const dailySummaryText = `Сводка по рабочим чатам

За сегодня в рабочих чатах появилось 46 новых сообщений.

Главное:

— Команда согласовала новый вариант таблицы заказов. В макете нужно обновить данные по заказному количеству и готовности производства.
— В чате разработки сообщили о проблеме с отображением компонентов после обновления библиотеки. Ошибка передана на проверку.
— По задаче обновления приложения подготовлен текст для состояний загрузки, успешной установки и перезапуска.
— Тестировщики нашли 3 замечания в мобильной версии чата. Два из них уже исправлены, одно требует уточнения у дизайнера.`;

const initialSessions = (): AiAssistantSession[] => [
  {
    id: 'daily-summary',
    title: 'Ежедневная сводка',
    description: 'Сводка предоставлена ниже',
    time: '19:48',
    pinned: true,
    messages: [
      {
        id: 'daily-summary-user',
        role: 'user',
        text: 'Сводка по чатам за сегодня',
        time: '12:10'
      },
      {
        id: 'daily-summary-assistant',
        role: 'assistant',
        text: dailySummaryText,
        time: '12:10',
        showApproval: true,
        approvalState: null
      }
    ]
  },
  {
    id: 'shipment-question',
    title: 'Вопрос по отгрузке',
    description: 'Отгрузка 20 августа 2026',
    time: '19:48',
    pinned: true,
    messages: [
      {
        id: 'shipment-user',
        role: 'user',
        text: 'Когда запланирована ближайшая отгрузка?',
        time: '10:44'
      },
      {
        id: 'shipment-assistant',
        role: 'assistant',
        text: 'Ближайшая отгрузка запланирована на 20 августа 2026 года. Документы уже подготовлены.',
        time: '10:45'
      }
    ]
  },
  {
    id: 'waybill',
    title: 'Создание накладной',
    description: 'Документ готов',
    time: '19:48',
    messages: [
      {
        id: 'waybill-user',
        role: 'user',
        text: 'Создай накладную для сегодняшней отгрузки',
        time: '10:40'
      },
      {
        id: 'waybill-assistant',
        role: 'assistant',
        text: 'Накладная подготовлена. Перед сохранением проверьте количество позиций.',
        time: '10:41',
        showApproval: true,
        approvalState: null
      }
    ]
  }
];

const initialTasks = (): AiAutomationTask[] => [
  {
    id: 'daily-automation',
    title: 'Ежедневная сводка',
    description: 'Информация о 20 августа',
    schedule: 'Ежедневная сводка в 8:00',
    enabled: true,
    pinned: true
  }
];

const loadState = (): PersistedAiState => {
  if (typeof window === 'undefined') {
    return { sessions: initialSessions(), tasks: initialTasks() };
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as PersistedAiState) : null;

    if (
      parsed &&
      Array.isArray(parsed.sessions) &&
      Array.isArray(parsed.tasks)
    ) {
      return parsed;
    }
  } catch {
    // Mock state must remain usable when localStorage is unavailable.
  }

  return { sessions: initialSessions(), tasks: initialTasks() };
};

const persisted = reactive<PersistedAiState>(loadState());
const activeTab = ref<AiAssistantTab>('chats');
const activeView = ref<AiAssistantView>('chat');
const activeSessionId = ref<string | null>(null);
const isThinking = ref(false);
const isVoiceModeOpen = ref(false);
const permissionMode = ref<'ask' | 'automatic'>('ask');
let responseTimer: number | null = null;

const persist = (): void => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sessions: persisted.sessions, tasks: persisted.tasks })
    );
  } catch {
    // Persistence is best-effort for the design-only mock.
  }
};

watch(() => [persisted.sessions, persisted.tasks], persist, { deep: true });

const nowLabel = (): string =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());

const createId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const activeSession = computed(
  () =>
    persisted.sessions.find(session => session.id === activeSessionId.value) ||
    null
);

const activeTitle = computed(() => {
  if (activeView.value === 'tasks') return 'СЭПИ';
  if (activeSession.value?.id === 'daily-summary') {
    return 'Сводка по чатам за сегодня';
  }
  return activeSession.value?.title || 'СЭПИ';
});

const startNewSession = (): void => {
  activeTab.value = 'chats';
  activeView.value = 'chat';
  activeSessionId.value = null;
  isThinking.value = false;
};

const selectSession = (sessionId: string): void => {
  activeTab.value = 'chats';
  activeView.value = 'chat';
  activeSessionId.value = sessionId;
  isThinking.value = false;
};

const setTab = (tab: AiAssistantTab): void => {
  activeTab.value = tab;

  if (tab === 'tasks') {
    activeView.value = 'tasks';
    isThinking.value = false;
  } else {
    activeView.value = 'chat';
  }
};

const showTasks = (): void => {
  activeTab.value = 'tasks';
  activeView.value = 'tasks';
  isThinking.value = false;
};

const buildMockResponse = (input: string): string => {
  const normalized = input.toLocaleLowerCase('ru-RU');

  if (normalized.includes('задач')) {
    return 'На сегодня у вас 5 задач. Две отмечены как приоритетные: согласовать макет ИИ‑ассистента и проверить отгрузочные документы.';
  }

  if (normalized.includes('сводк') || normalized.includes('чат')) {
    return dailySummaryText;
  }

  return 'Готово. Я подготовил черновик по вашему запросу. Проверьте результат — при необходимости его можно уточнить следующим сообщением.';
};

const finishMockResponse = (
  sessionId: string,
  input: string,
  responseTime = nowLabel()
): void => {
  const session = persisted.sessions.find(item => item.id === sessionId);
  if (!session) return;

  session.messages.push({
    id: createId('assistant'),
    role: 'assistant',
    text: buildMockResponse(input),
    time: responseTime,
    showApproval: input.toLocaleLowerCase('ru-RU').includes('сводк'),
    approvalState: null
  });
  session.description =
    session.id === 'daily-summary'
      ? 'Сводка предоставлена ниже'
      : 'Ответ подготовлен';
  session.time = session.id === 'daily-summary' ? '19:48' : responseTime;
  isThinking.value = false;
  persist();
};

const sendMessage = (rawInput: string): void => {
  const input = rawInput.trim();
  if (!input || isThinking.value) return;

  activeTab.value = 'chats';
  activeView.value = 'chat';

  let session = activeSession.value;
  if (!session) {
    session = {
      id: createId('session'),
      title: input.length > 36 ? `${input.slice(0, 36)}…` : input,
      description: 'Думает…',
      time: nowLabel(),
      messages: []
    };
    persisted.sessions.unshift(session);
    activeSessionId.value = session.id;
  }

  session.messages.push({
    id: createId('user'),
    role: 'user',
    text: input,
    time: nowLabel()
  });
  session.description = 'Думает…';
  session.time = nowLabel();
  isThinking.value = true;
  persist();

  if (responseTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(responseTimer);
  }

  if (typeof window === 'undefined') {
    finishMockResponse(session.id, input);
    return;
  }

  responseTimer = window.setTimeout(() => {
    responseTimer = null;
    finishMockResponse(session!.id, input);
  }, 1050);
};

const sendSuggestedPrompt = (prompt: 'summary' | 'tasks'): void => {
  if (prompt === 'tasks') {
    startNewSession();
    sendMessage('Мои задачи на сегодня');
    return;
  }

  const session = persisted.sessions.find(item => item.id === 'daily-summary');
  if (!session) return;

  activeTab.value = 'chats';
  activeView.value = 'chat';
  activeSessionId.value = session.id;
  session.messages.splice(0, session.messages.length, {
    id: 'daily-summary-user',
    role: 'user',
    text: 'Сводка по чатам за сегодня',
    time: '12:10'
  });
  session.description = 'Думает…';
  session.time = '19:48';
  isThinking.value = true;
  persist();

  if (responseTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(responseTimer);
  }

  if (typeof window === 'undefined') {
    finishMockResponse(session.id, 'Сводка по чатам за сегодня', '12:10');
    return;
  }

  responseTimer = window.setTimeout(() => {
    responseTimer = null;
    finishMockResponse(session.id, 'Сводка по чатам за сегодня', '12:10');
  }, 1050);
};

const updateApproval = (
  messageId: string,
  state: 'approved' | 'rejected'
): void => {
  const message = activeSession.value?.messages.find(
    item => item.id === messageId
  );
  if (!message) return;
  message.approvalState = state;
  persist();
};

const toggleSessionPin = (sessionId: string): void => {
  const session = persisted.sessions.find(item => item.id === sessionId);
  if (!session) return;
  session.pinned = !session.pinned;
};

const deleteSession = (sessionId: string): void => {
  const index = persisted.sessions.findIndex(item => item.id === sessionId);
  if (index === -1) return;
  persisted.sessions.splice(index, 1);
  if (activeSessionId.value === sessionId) startNewSession();
};

const toggleTask = (taskId: string): void => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task) return;
  task.enabled = !task.enabled;
};

const toggleTaskPin = (taskId: string): void => {
  const task = persisted.tasks.find(item => item.id === taskId);
  if (!task) return;
  task.pinned = !task.pinned;
};

const deleteTask = (taskId: string): void => {
  const index = persisted.tasks.findIndex(item => item.id === taskId);
  if (index === -1) return;
  persisted.tasks.splice(index, 1);
};

const clearAll = (): void => {
  persisted.sessions.splice(0, persisted.sessions.length, ...initialSessions());
  persisted.tasks.splice(0, persisted.tasks.length, ...initialTasks());
  startNewSession();
  persist();
};

export const useAiAssistantMock = () => ({
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
  selectSession,
  setTab,
  showTasks,
  sendMessage,
  sendSuggestedPrompt,
  updateApproval,
  toggleSessionPin,
  deleteSession,
  toggleTask,
  toggleTaskPin,
  deleteTask,
  clearAll
});
