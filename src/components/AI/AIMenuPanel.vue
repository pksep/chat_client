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
        'ai-menu-panel__header menu-section-heading',
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
              @click="handleCollapsedItemSelect(item)"
              @contextmenu="handleCollapsedItemContextMenu(item, $event)"
              @mouseenter="showCollapsedItemPreview(item, $event)"
              @mouseleave="scheduleCollapsedItemPreviewClose"
              @focus="showCollapsedItemPreview(item, $event)"
              @blur="scheduleCollapsedItemPreviewClose"
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
                <Tooltip
                  v-if="backgroundActivityStatusBySessionId[session.id]"
                  :hint="
                    getActivityStatusLabel(
                      backgroundActivityStatusBySessionId[session.id]
                    )
                  "
                  position="top-center"
                  type="black"
                  size="small"
                  :data-testid="`AI-MenuPanel-ActivityTooltip-${session.id}`"
                >
                  <span
                    :class="[
                      'ai-menu-panel__activity-status',
                      `ai-menu-panel__activity-status--${backgroundActivityStatusBySessionId[session.id]}`
                    ]"
                    :aria-label="
                      getActivityStatusLabel(
                        backgroundActivityStatusBySessionId[session.id]
                      )
                    "
                  ></span>
                </Tooltip>
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

      <template
        v-else-if="
          activeTab === 'tasks' &&
          (filteredTasks.length || filteredTaskSessions.length)
        "
      >
        <template v-for="task in filteredTasks" :key="task.id">
          <article
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
                <Icon
                  :name="task.enabled ? IconNameEnum.play : IconNameEnum.pause"
                  :width="16"
                  :height="16"
                />
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
          </article>
        </template>

        <article
          v-for="session in filteredTaskSessions"
          :key="session.id"
          :class="[
            'ai-menu-panel__row',
            'ai-menu-panel__row--task',
            'ai-menu-panel__row--task-session',
            { 'ai-menu-panel__row--active': isTaskActive(session.id) }
          ]"
          @contextmenu="openActivePopover(sessionMenuId(session.id), $event)"
        >
          <button
            type="button"
            class="ai-menu-panel__row-main"
            :aria-current="isTaskActive(session.id) ? 'true' : undefined"
            :aria-expanded="!!isOpen[sessionMenuId(session.id)]"
            aria-haspopup="menu"
            @click="handleSelectTaskSession(session.id)"
          >
            <span
              class="ai-menu-panel__task-state ai-menu-panel__task-state--draft"
              aria-hidden="true"
            >
              <Icon :name="IconNameEnum.circle" :width="16" :height="16" />
            </span>
            <span class="ai-menu-panel__row-copy">
              <strong>{{ session.title }}</strong>
              <small>{{ session.description }}</small>
            </span>
            <span class="ai-menu-panel__row-meta">
              <time>{{ session.time }}</time>
              <div
                v-if="session.pinned"
                class="contact-list__pin"
                aria-label="Закреплено"
              >
                <PinIcon />
              </div>
            </span>
          </button>
        </article>
      </template>

      <MenuEmptyState v-else />
    </div>
  </section>

  <Teleport to="body">
    <ContextMenu
      v-for="task in tasks"
      :key="taskMenuId(task.id)"
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
        <Icon
          class="ai-menu-panel__context-state"
          :name="task.enabled ? IconNameEnum.pause : IconNameEnum.play"
          :width="16"
          :height="16"
        />
        {{ task.enabled ? 'Остановить' : 'Возобновить' }}
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handlePinTask(task.id)"
      >
        <template v-if="task.pinned"> <UnpinIcon /> Открепить </template>
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
    <ContextMenu
      v-for="session in taskSessions"
      :key="sessionMenuId(session.id)"
      :visible="!!isOpen[sessionMenuId(session.id)]"
      :position="position"
      :data-testid="`AI-MenuPanel-TaskSessionContext-${session.id}`"
      @unmount-close="() => closeActivePopover(sessionMenuId(session.id))"
    >
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handlePinSession(session.id)"
      >
        <template v-if="session.pinned"> <UnpinIcon /> Открепить </template>
        <template v-else> <PinIcon /> Закрепить </template>
      </Button>
      <Button
        class="red-context-button"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handleDeleteSession(session.id)"
      >
        <Icon :name="IconNameEnum.deleteSmall" />
        Удалить задачу
      </Button>
    </ContextMenu>
    <ContextMenu
      :visible="props.isCollapse && !!collapsedPreviewItem"
      :position="collapsedPreviewPosition"
      :style="collapsedPreviewStyle"
      class="ai-activity-popover ai-menu-panel__collapsed-preview"
      data-testid="AI-MenuPanel-CollapsedPreview"
      @mouseenter="cancelCollapsedItemPreviewClose"
      @mouseleave="scheduleCollapsedItemPreviewClose"
      @unmount-close="closeCollapsedItemPreview"
    >
      <AIActivityPanel
        :activities="collapsedPreviewActivities"
        aria-label="Состояние выбранного пункта ИИ"
        data-testid="AI-MenuPanel-CollapsedPreview-Activity"
        show-status
        @select="handleCollapsedPreviewSelect"
      />
    </ContextMenu>
  </Teleport>

  <ConfirmModal
    :open="!!pendingDeleteSessionId"
    :title="pendingDeleteIsTask ? 'Удаление задачи' : 'Удаление чата'"
    :description="
      pendingDeleteIsTask
        ? 'Вы действительно хотите удалить задачу?'
        : 'Вы действительно хотите удалить чат?'
    "
    @unmount-close="handleCloseDeleteSessionModal"
    @unmount-confirm="handleConfirmDeleteSession"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Search,
  SizesEnum,
  Tooltip
} from '@pksep/yui';
import { navigateToAI } from '../../composables/navigation';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  type AiAssistantActivity,
  type AiAssistantActivityStatus,
  type AiAssistantTab,
  useAiAssistant
} from '../../composables/useAiAssistant';
import ContextMenu from '../ContactList/ContextMenu.vue';
import MenuEmptyState from '../Menu/MenuEmptyState.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';
import AIActivityPanel from './AIActivityPanel.vue';

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
      description: string;
      status: AiAssistantActivityStatus;
      statusLabel: string;
      sessionId?: string;
      taskId?: string;
    }
  | {
      kind: 'chat';
      id: string;
      title: string;
      description: string;
      status: AiAssistantActivityStatus;
      statusLabel: string;
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
  selectTaskSession,
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
const pendingDeleteIsTask = computed(() =>
  sessions.value.some(
    session =>
      session.id === pendingDeleteSessionId.value && session.kind === 'task'
  )
);
const selectedCollapsedTaskId = ref<string | null>(null);
const collapsedPreviewItem = ref<CollapsedAiMenuItem | null>(null);
const collapsedPreviewPosition = ref({ x: 0, y: 0 });
const collapsedPreviewStyle = { width: '250px' };
let collapsedPreviewCloseTimer: ReturnType<typeof setTimeout> | null = null;
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

const backgroundActivityBySessionId = computed(
  () =>
    new Map(
      backgroundActivities.value.map(activity => [activity.sessionId, activity])
    )
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

const persistedTaskSessionIds = computed(
  () =>
    new Set(
      tasks.value.flatMap(task => (task.sessionId ? [task.sessionId] : []))
    )
);

const chatSessions = computed(() =>
  sessions.value.filter(
    session =>
      session.kind !== 'task' && !persistedTaskSessionIds.value.has(session.id)
  )
);

const taskSessions = computed(() =>
  sessions.value.filter(
    session =>
      session.kind === 'task' && !persistedTaskSessionIds.value.has(session.id)
  )
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
const filteredTaskSessions = computed(() => {
  if (!normalizedQuery.value) return taskSessions.value;
  return taskSessions.value.filter(session =>
    `${session.title} ${session.description}`
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

const getCollapsedItemActivity = (
  sessionId: string | undefined,
  fallback: {
    description: string;
    status: AiAssistantActivityStatus;
    statusLabel: string;
  }
): typeof fallback => {
  const activity = sessionId
    ? backgroundActivityBySessionId.value.get(sessionId)
    : undefined;

  if (!activity) return fallback;

  return {
    description: activity.description,
    status: activity.status,
    statusLabel: getActivityStatusLabel(activity.status)
  };
};

const collapsedItems = computed<CollapsedAiMenuItem[]>(() => [
  ...tasks.value.map(task => ({
    kind: 'task' as const,
    id: task.id,
    taskId: task.id,
    title: task.title,
    ...getCollapsedItemActivity(task.sessionId, {
      description: task.description,
      status: task.enabled ? ('success' as const) : ('attention' as const),
      statusLabel: task.enabled ? 'Активна' : 'Приостановлена'
    }),
    ...(task.sessionId ? { sessionId: task.sessionId } : {})
  })),
  ...taskSessions.value.map(session => ({
    kind: 'task' as const,
    id: `session:${session.id}`,
    title: session.title,
    ...getCollapsedItemActivity(session.id, {
      description: session.description,
      status: 'attention' as const,
      statusLabel: 'Ожидает подтверждения'
    }),
    sessionId: session.id
  })),
  ...chatSessions.value.map(session => ({
    kind: 'chat' as const,
    id: session.id,
    title: session.title,
    ...getCollapsedItemActivity(session.id, {
      description: session.description,
      status: 'success' as const,
      statusLabel: 'Готов к работе'
    })
  }))
]);

const collapsedPreviewActivities = computed<
  Array<AiAssistantActivity & { statusLabel: string }>
>(() => {
  const item = collapsedPreviewItem.value;
  if (!item) return [];

  return [
    {
      sessionId: item.kind === 'task' ? item.sessionId || item.id : item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      statusLabel: item.statusLabel,
      updatedAt: 0,
      isBackground: false
    }
  ];
});

const isSelectedCollapsedTask = (item: CollapsedAiMenuItem): boolean => {
  if (item.kind !== 'task') return false;

  return item.sessionId
    ? isTaskActive(item.sessionId)
    : selectedCollapsedTaskId.value === item.id && activeTab.value === 'tasks';
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

const getCollapsedItemLabel = (item: CollapsedAiMenuItem): string => {
  const type =
    item.kind === 'chat'
      ? 'Чат с ИИ'
      : item.taskId
        ? 'Запланированная задача'
        : 'Задача с ИИ';
  return `${type}: ${item.title}`;
};

const cancelCollapsedItemPreviewClose = (): void => {
  if (collapsedPreviewCloseTimer) {
    clearTimeout(collapsedPreviewCloseTimer);
    collapsedPreviewCloseTimer = null;
  }
};

const closeCollapsedItemPreview = (): void => {
  cancelCollapsedItemPreviewClose();
  collapsedPreviewItem.value = null;
};

const scheduleCollapsedItemPreviewClose = (): void => {
  cancelCollapsedItemPreviewClose();
  collapsedPreviewCloseTimer = setTimeout(() => {
    collapsedPreviewItem.value = null;
    collapsedPreviewCloseTimer = null;
  }, 120);
};

const showCollapsedItemPreview = (
  item: CollapsedAiMenuItem,
  event: MouseEvent | FocusEvent
): void => {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  cancelCollapsedItemPreviewClose();
  const rect = target.getBoundingClientRect();
  collapsedPreviewPosition.value = {
    x: rect.right + 8,
    y: rect.top
  };
  collapsedPreviewItem.value = item;
};

const handleCollapsedPreviewSelect = (): void => {
  const item = collapsedPreviewItem.value;
  closeCollapsedItemPreview();
  if (item) handleCollapsedItemSelect(item);
};

const handleCollapsedItemSelect = (item: CollapsedAiMenuItem): void => {
  closeCollapsedItemPreview();
  if (item.kind === 'task') {
    selectedCollapsedTaskId.value = item.id;
    if (item.taskId) handleSelectTask(item.taskId);
    else if (item.sessionId) handleSelectTaskSession(item.sessionId);
    return;
  }

  selectedCollapsedTaskId.value = null;
  handleSelectSession(item.id);
};

const handleCollapsedItemContextMenu = (
  item: CollapsedAiMenuItem,
  event: MouseEvent
): void => {
  if (item.kind !== 'task') return;
  closeCollapsedItemPreview();
  if (item.taskId) openActivePopover(taskMenuId(item.taskId), event);
  else if (item.sessionId)
    openActivePopover(sessionMenuId(item.sessionId), event);
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

const handleSelectTaskSession = (sessionId: string): void => {
  selectTaskSession(sessionId);
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
  handleSelectTask(taskId);
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

watch(
  () => props.isCollapse,
  isCollapse => {
    if (!isCollapse) closeCollapsedItemPreview();
  }
);

onBeforeUnmount(cancelCollapsedItemPreviewClose);
</script>
