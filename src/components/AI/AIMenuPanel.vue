<template>
  <section
    :class="[
      'ai-menu-panel',
      {
        'ai-menu-panel--searching': !props.isCollapse && query.trim(),
        'ai-menu-panel--collapse': props.isCollapse
      }
    ]"
    data-testid="AI-MenuPanel"
  >
    <header
      :class="[
        'ai-menu-panel__header',
        {
          'ai-menu-panel__header--collapse': props.isCollapse,
          'chats-toolbar__headline': props.isCollapse
        }
      ]"
    >
      <h2 v-if="!props.isCollapse">ИИ-Ассистент</h2>
      <Button
        v-if="props.isCollapse"
        class="ai-menu-panel__collapsed-create chats-toolbar__create-button"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        aria-label="Создать чат или повторяемую задачу"
        title="Создать"
        aria-haspopup="menu"
        :aria-expanded="!!isOpen[createMenuId]"
        @click="event => openActivePopover(createMenuId, event as MouseEvent)"
      >
        <Icon :name="IconNameEnum.plus" />
      </Button>
      <button
        v-else
        type="button"
        class="ai-menu-panel__new"
        aria-label="Создать"
        title="Создать"
        aria-haspopup="menu"
        :aria-expanded="!!isOpen[createMenuId]"
        @click="openActivePopover(createMenuId, $event)"
      >
        <Icon :name="IconNameEnum.plus" />
      </button>
      <Teleport to="body">
        <ContextMenu
          :visible="!!isOpen[createMenuId]"
          :position="position"
          class="ai-menu-panel__create-menu"
          data-testid="AI-MenuPanel-CreateContext"
          @unmount-close="closeActivePopover(createMenuId)"
          @click="closeActivePopover(createMenuId)"
        >
          <Button
            :type="ButtonTypeEnum.popover"
            :size="SizesEnum.small"
            @click="handleNewSession"
          >
            <MessageIcon /> Новый чат
          </Button>
          <Button
            :type="ButtonTypeEnum.popover"
            :size="SizesEnum.small"
            @click="handleNewTask"
          >
            <TasksSuggestionIcon /> Новая задача
          </Button>
        </ContextMenu>
      </Teleport>
    </header>

    <div v-if="!props.isCollapse" class="ai-menu-panel__search-shell">
      <Search
        class="ai-menu-panel__search"
        :model-value="query"
        @update:model-value="value => (query = value)"
      />
    </div>

    <div
      v-if="!props.isCollapse && !query.trim()"
      class="ai-menu-panel__tabs"
      role="tablist"
      aria-label="Разделы ИИ"
    >
      <button
        type="button"
        :class="{ 'ai-menu-panel__tab--active': activeTab === 'chats' }"
        role="tab"
        :aria-selected="activeTab === 'chats'"
        @click="handleTab('chats')"
      >
        Чаты
      </button>
      <button
        type="button"
        :class="{ 'ai-menu-panel__tab--active': activeTab === 'tasks' }"
        role="tab"
        :aria-selected="activeTab === 'tasks'"
        @click="handleTab('tasks')"
      >
        Задачи
      </button>
    </div>

    <div class="ai-menu-panel__list">
      <template v-if="props.isCollapse">
        <nav
          v-if="collapsedItems.length"
          class="ai-menu-panel__collapsed-list contact-list"
          aria-label="Запланированные задачи и чаты с ИИ"
        >
          <div
            v-for="(item, index) in collapsedItems"
            :key="`${item.kind}:${item.id}`"
            class="ai-menu-panel__collapsed-entry"
          >
            <button
              type="button"
              :class="[
                'ai-menu-panel__collapsed-item',
                'contact-list__item',
                {
                  'ai-menu-panel__collapsed-item--active':
                    isCollapsedItemActive(item),
                  'contact-list__item--active': isCollapsedItemActive(item)
                }
              ]"
              :aria-label="getCollapsedItemLabel(item)"
              :aria-current="isCollapsedItemActive(item) ? 'page' : undefined"
              :title="getCollapsedItemLabel(item)"
              @click="handleCollapsedItemSelect(item)"
            >
              <span class="ai-menu-panel__collapsed-avatar" aria-hidden="true">
                <TasksSuggestionIcon
                  v-if="item.kind === 'task'"
                  class="ai-menu-panel__collapsed-icon"
                />
                <Icon
                  v-else
                  :name="IconNameEnum.chat"
                  :width="24"
                  :height="24"
                  class="ai-menu-panel__collapsed-icon"
                />
              </span>
            </button>
            <span
              v-if="index < collapsedItems.length - 1"
              class="ai-menu-panel__collapsed-divider"
              aria-hidden="true"
            />
          </div>
        </nav>
      </template>

      <template v-else-if="activeTab === 'chats' && filteredSessions.length">
        <template v-for="session in filteredSessions" :key="session.id">
          <article
            :class="[
              'ai-menu-panel__row',
              { 'ai-menu-panel__row--active': isSessionActive(session.id) }
            ]"
            @contextmenu="openActivePopover(sessionMenuId(session.id), $event)"
          >
            <button
              type="button"
              class="ai-menu-panel__row-main"
              :aria-current="isSessionActive(session.id) ? 'true' : undefined"
              :aria-expanded="!!isOpen[sessionMenuId(session.id)]"
              aria-haspopup="menu"
              @click="handleSelectSession(session.id)"
            >
              <span class="ai-menu-panel__row-copy">
                <strong>{{ session.title }}</strong>
                <small>{{ session.description }}</small>
              </span>
              <span class="ai-menu-panel__row-meta">
                <time>{{ session.time }}</time>
                <span
                  v-if="backgroundActivityStatusBySessionId[session.id]"
                  :class="[
                    'ai-menu-panel__activity-status',
                    `ai-menu-panel__activity-status--${backgroundActivityStatusBySessionId[session.id]}`
                  ]"
                  :aria-label="
                    getActivityStatusLabel(
                      backgroundActivityStatusBySessionId[session.id]
                    )
                  "
                  :title="
                    getActivityStatusLabel(
                      backgroundActivityStatusBySessionId[session.id]
                    )
                  "
                >
                  <FileIcon
                    v-if="
                      backgroundActivityStatusBySessionId[session.id] ===
                      'running'
                    "
                    is-me-sender
                    background-color="transparent"
                  />
                </span>
                <div
                  v-else-if="session.pinned"
                  class="contact-list__pin"
                  aria-label="Закреплено"
                >
                  <PinIcon />
                </div>
              </span>
            </button>
            <Teleport to="body">
              <ContextMenu
                :visible="!!isOpen[sessionMenuId(session.id)]"
                :position="position"
                :data-testid="`AI-MenuPanel-SessionContext-${session.id}`"
                @unmount-close="
                  () => closeActivePopover(sessionMenuId(session.id))
                "
              >
                <Button
                  :type="ButtonTypeEnum.popover"
                  :size="SizesEnum.small"
                  @click.stop="handlePinSession(session.id)"
                >
                  <template v-if="session.pinned">
                    <UnpinIcon /> Открепить
                  </template>
                  <template v-else> <PinIcon /> Закрепить </template>
                </Button>
                <Button
                  :type="ButtonTypeEnum.popover"
                  :size="SizesEnum.small"
                  @click.stop="handleClearSession(session.id)"
                >
                  <Icon :name="IconNameEnum.imagePaint" />
                  Очистить чат
                </Button>
                <Button
                  class="red-context-button"
                  :type="ButtonTypeEnum.popover"
                  :size="SizesEnum.small"
                  @click.stop="handleDeleteSession(session.id)"
                >
                  <Icon :name="IconNameEnum.deleteSmall" />
                  Удалить чат
                </Button>
              </ContextMenu>
            </Teleport>
          </article>

          <div class="ai-menu-panel__delimetr"></div>
        </template>
      </template>

      <template v-else-if="activeTab === 'tasks' && filteredTasks.length">
        <article
          v-for="task in filteredTasks"
          :key="task.id"
          :class="[
            'ai-menu-panel__row',
            'ai-menu-panel__row--task',
            { 'ai-menu-panel__row--active': isTaskActive(task.sessionId) }
          ]"
          @contextmenu="openActivePopover(taskMenuId(task.id), $event)"
        >
          <button
            type="button"
            class="ai-menu-panel__row-main"
            :aria-current="isTaskActive(task.sessionId) ? 'true' : undefined"
            :aria-expanded="!!isOpen[taskMenuId(task.id)]"
            aria-haspopup="menu"
            @click="handleSelectTask(task.id)"
          >
            <span
              :class="[
                'ai-menu-panel__task-state',
                { 'ai-menu-panel__task-state--paused': !task.enabled }
              ]"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16">
                <circle cx="8" cy="8" r="6.5" />
                <path d="m6.5 5.6 4 2.4-4 2.4V5.6Z" />
              </svg>
            </span>
            <span class="ai-menu-panel__row-copy">
              <strong>{{ task.title }}</strong>
              <small>{{ task.description }}</small>
            </span>
            <span class="ai-menu-panel__row-meta">
              <time>{{ formatTaskTime(task.nextRunAt) }}</time>
              <div
                v-if="task.pinned"
                class="contact-list__pin"
                aria-label="Закреплено"
              >
                <PinIcon />
              </div>
            </span>
          </button>
          <Teleport to="body">
            <ContextMenu
              :visible="!!isOpen[taskMenuId(task.id)]"
              :position="position"
              :data-testid="`AI-MenuPanel-TaskContext-${task.id}`"
              @unmount-close="() => closeActivePopover(taskMenuId(task.id))"
            >
              <Button
                :type="ButtonTypeEnum.popover"
                :size="SizesEnum.small"
                @click.stop="handleToggleTask(task.id)"
              >
                <svg class="ai-menu-panel__context-state" viewBox="0 0 18 18">
                  <circle cx="9" cy="9" r="7" />
                  <path v-if="task.enabled" d="M7.2 6.5v5M10.8 6.5v5" />
                  <path v-else d="m7.2 5.8 5 3.2-5 3.2V5.8Z" />
                </svg>
                {{ task.enabled ? 'Приостановить' : 'Возобновить' }}
              </Button>
              <Button
                :type="ButtonTypeEnum.popover"
                :size="SizesEnum.small"
                @click.stop="handlePinTask(task.id)"
              >
                <template v-if="task.pinned">
                  <UnpinIcon /> Открепить
                </template>
                <template v-else> <PinIcon /> Закрепить </template>
              </Button>
              <Button
                class="red-context-button"
                :type="ButtonTypeEnum.popover"
                :size="SizesEnum.small"
                @click.stop="handleDeleteTask(task.id)"
              >
                <Icon :name="IconNameEnum.deleteSmall" />
                Удалить автоматизацию
              </Button>
            </ContextMenu>
          </Teleport>
        </article>
      </template>

      <div v-else class="ai-menu-panel__empty">
        <svg
          class="ai-menu-panel__empty-face"
          viewBox="0 0 74 74"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="32" cy="32" r="24" />
          <circle cx="25" cy="28" r="2" />
          <circle cx="39" cy="28" r="2" />
          <path d="M24 39h16M50 50l12 12" />
        </svg>
        <p>Ничего не найдено</p>
      </div>
    </div>
  </section>

  <ConfirmModal
    :open="!!pendingDeleteSessionId"
    title="Удаление чата"
    description="Вы действительно хотите удалить чат?"
    @unmount-close="handleCloseDeleteSessionModal"
    @unmount-confirm="handleConfirmDeleteSession"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Search,
  SizesEnum
} from '@pksep/yui';
import { navigateToAI } from '../../composables/navigation';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  type AiAssistantActivityStatus,
  type AiAssistantTab,
  useAiAssistant
} from '../../composables/useAiAssistant';
import ContextMenu from '../ContactList/ContextMenu.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import FileIcon from '../UI/FileIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';

const props = withDefaults(
  defineProps<{
    isCollapse?: boolean;
  }>(),
  {
    isCollapse: false
  }
);

type CollapsedAiMenuItem =
  | {
      kind: 'task';
      id: string;
      title: string;
      sessionId?: string;
    }
  | {
      kind: 'chat';
      id: string;
      title: string;
    };

const {
  sessions,
  tasks,
  activeTab,
  activeSessionId,
  backgroundActivities,
  startNewSession,
  startNewTask,
  selectSession,
  selectTask,
  setTab,
  toggleSessionPin,
  clearSession,
  deleteSession,
  toggleTask,
  toggleTaskPin,
  deleteTask
} = useAiAssistant();

const query = ref('');
const pendingDeleteSessionId = ref<string | null>(null);
const selectedCollapsedTaskId = ref<string | null>(null);
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const createMenuId = 'create';
const sessionMenuId = (sessionId: string): string => `session:${sessionId}`;
const taskMenuId = (taskId: string): string => `task:${taskId}`;

/** Подсвечивает сессию, которая фактически открыта в AI-ассистенте. */
const isSessionActive = (sessionId: string): boolean =>
  activeTab.value === 'chats' && activeSessionId.value === sessionId;

const isTaskActive = (sessionId?: string): boolean =>
  activeTab.value === 'tasks' &&
  !!sessionId &&
  activeSessionId.value === sessionId;

const backgroundActivityStatusBySessionId = computed(
  () =>
    Object.fromEntries(
      backgroundActivities.value.map(activity => [
        activity.sessionId,
        activity.status
      ])
    ) as Record<string, AiAssistantActivityStatus | undefined>
);

const getActivityStatusLabel = (
  status: AiAssistantActivityStatus | undefined
): string => {
  if (status === 'running') return 'Выполняется';
  if (status === 'success') return 'Успешно завершено';
  return 'Требуется внимание';
};

const normalizedQuery = computed(() =>
  query.value.trim().toLocaleLowerCase('ru-RU')
);

const taskSessionIds = computed(
  () =>
    new Set(
      tasks.value.flatMap(task => (task.sessionId ? [task.sessionId] : []))
    )
);

const chatSessions = computed(() =>
  sessions.value.filter(session => !taskSessionIds.value.has(session.id))
);

const filteredSessions = computed(() => {
  if (!normalizedQuery.value) return chatSessions.value;
  return chatSessions.value.filter(session =>
    `${session.title} ${session.description}`
      .toLocaleLowerCase('ru-RU')
      .includes(normalizedQuery.value)
  );
});
const filteredTasks = computed(() => {
  if (!normalizedQuery.value) return tasks.value;
  return tasks.value.filter(task =>
    `${task.title} ${task.description}`
      .toLocaleLowerCase('ru-RU')
      .includes(normalizedQuery.value)
  );
});
const formatTaskTime = (timestamp?: number | null): string => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
};

const collapsedItems = computed<CollapsedAiMenuItem[]>(() => [
  ...tasks.value.map(task => ({
    kind: 'task' as const,
    id: task.id,
    title: task.title,
    ...(task.sessionId ? { sessionId: task.sessionId } : {})
  })),
  ...chatSessions.value.map(session => ({
    kind: 'chat' as const,
    id: session.id,
    title: session.title
  }))
]);

const isSelectedCollapsedTask = (item: CollapsedAiMenuItem): boolean => {
  if (item.kind !== 'task' || selectedCollapsedTaskId.value !== item.id) {
    return false;
  }

  return item.sessionId
    ? activeSessionId.value === item.sessionId
    : activeTab.value === 'tasks';
};

const isCollapsedItemActive = (item: CollapsedAiMenuItem): boolean => {
  if (isSelectedCollapsedTask(item)) return true;
  if (item.kind === 'task') return false;

  const selectedTaskOwnsActiveSession = collapsedItems.value.some(
    candidate =>
      candidate.kind === 'task' &&
      isSelectedCollapsedTask(candidate) &&
      candidate.sessionId === item.id
  );

  return !selectedTaskOwnsActiveSession && isSessionActive(item.id);
};

const getCollapsedItemLabel = (item: CollapsedAiMenuItem): string =>
  `${item.kind === 'task' ? 'Запланированная задача' : 'Чат с ИИ'}: ${item.title}`;

const handleCollapsedItemSelect = (item: CollapsedAiMenuItem): void => {
  if (item.kind === 'task') {
    selectedCollapsedTaskId.value = item.id;
    handleSelectTask(item.id);
    return;
  }

  selectedCollapsedTaskId.value = null;
  handleSelectSession(item.id);
};

const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 768px)').matches;

const openAssistant = (sessionId: string | null = null): void => {
  navigateToAI(sessionId);
};

const handleNewSession = (): void => {
  closeActivePopover(createMenuId);
  selectedCollapsedTaskId.value = null;
  startNewSession();
  openAssistant();
};

const handleNewTask = (): void => {
  closeActivePopover(createMenuId);
  selectedCollapsedTaskId.value = null;
  startNewTask();
  openAssistant();
};

const handleSelectSession = (sessionId: string): void => {
  selectSession(sessionId);
  openAssistant(sessionId);
};

const handleSelectTask = (taskId: string): void => {
  const sessionId = selectTask(taskId);
  openAssistant(sessionId);
};

const handleTab = (tab: AiAssistantTab): void => {
  selectedCollapsedTaskId.value = null;
  setTab(tab);
  closeActivePopover();

  if (!isMobileViewport()) {
    openAssistant();
  }
};

const handlePinSession = (sessionId: string): void => {
  toggleSessionPin(sessionId);
  closeActivePopover(sessionMenuId(sessionId));
};

const handleClearSession = async (sessionId: string): Promise<void> => {
  closeActivePopover(sessionMenuId(sessionId));
  await clearSession(sessionId);
};

const handleDeleteSession = (sessionId: string): void => {
  closeActivePopover(sessionMenuId(sessionId));
  pendingDeleteSessionId.value = sessionId;
};

const handleCloseDeleteSessionModal = (): void => {
  pendingDeleteSessionId.value = null;
};

const handleConfirmDeleteSession = (): void => {
  const sessionId = pendingDeleteSessionId.value;
  if (!sessionId) return;

  const wasActive = activeSessionId.value === sessionId;
  deleteSession(sessionId);
  pendingDeleteSessionId.value = null;

  if (wasActive) openAssistant();
};

const handleToggleTask = (taskId: string): void => {
  void toggleTask(taskId).catch(error => {
    console.error('Failed to request automation state change:', error);
  });
  closeActivePopover(taskMenuId(taskId));
};

const handlePinTask = (taskId: string): void => {
  toggleTaskPin(taskId);
  closeActivePopover(taskMenuId(taskId));
};

const handleDeleteTask = (taskId: string): void => {
  void deleteTask(taskId).catch(error => {
    console.error('Failed to request automation deletion:', error);
  });
  closeActivePopover(taskMenuId(taskId));
};
</script>
