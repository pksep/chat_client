<template>
  <section
    :class="['ai-menu-panel', { 'ai-menu-panel--searching': query.trim() }]"
    data-testid="AI-MenuPanel"
  >
    <header class="ai-menu-panel__header">
      <h2>ИИ-Ассистент</h2>
      <button
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
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            @click="handleNewSession"
          >
            <MessageIcon /> Новый чат
          </Button>
          <Button
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            @click="handleNewTask"
          >
            <TasksSuggestionIcon /> Новая задача
          </Button>
        </ContextMenu>
      </Teleport>
    </header>

    <label class="ai-menu-panel__search">
      <Icon :name="IconNameEnum.search" />
      <input v-model="query" type="search" placeholder="Поиск" />
    </label>

    <div
      v-if="!query.trim()"
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
      <template v-if="activeTab === 'chats' && filteredSessions.length">
        <article
          v-for="session in filteredSessions"
          :key="session.id"
          :class="[
            'ai-menu-panel__row',
            { 'ai-menu-panel__row--active': isSessionActive(session.id) }
          ]"
          @contextmenu="openActivePopover(sessionMenuId(session.id), $event)"
        >
          <button
            type="button"
            class="ai-menu-panel__row-main"
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
              <div
                v-if="session.pinned"
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
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                @click.stop="handlePinSession(session.id)"
              >
                <template v-if="session.pinned">
                  <UnpinIcon /> Открепить
                </template>
                <template v-else> <PinIcon /> Закрепить </template>
              </Button>
              <Button
                class="red-context-button"
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                @click.stop="handleDeleteSession(session.id)"
              >
                <Icon :name="IconNameEnum.deleteSmall" />
                Удалить чат
              </Button>
            </ContextMenu>
          </Teleport>
        </article>
      </template>

      <template v-else-if="activeTab === 'tasks' && filteredTasks.length">
        <article
          v-for="task in filteredTasks"
          :key="task.id"
          class="ai-menu-panel__row ai-menu-panel__row--task"
          @contextmenu="openActivePopover(taskMenuId(task.id), $event)"
        >
          <button
            type="button"
            class="ai-menu-panel__row-main"
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
                :type="ButtonTypeEnum.ghost"
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
                :type="ButtonTypeEnum.ghost"
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
                :type="ButtonTypeEnum.ghost"
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  type AiAssistantTab,
  useAiAssistant
} from '../../composables/useAiAssistant';
import ContextMenu from '../ContactList/ContextMenu.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';

const {
  sessions,
  tasks,
  activeTab,
  startNewSession,
  startNewTask,
  selectSession,
  selectTask,
  setTab,
  toggleSessionPin,
  deleteSession,
  toggleTask,
  toggleTaskPin,
  deleteTask
} = useAiAssistant();

const query = ref('');
const route = useUrlWatcher();
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const createMenuId = 'create';
const sessionMenuId = (sessionId: string): string => `session:${sessionId}`;
const taskMenuId = (taskId: string): string => `task:${taskId}`;

const isSessionActive = (sessionId: string): boolean =>
  route.value.type === RouteTypes.AI && route.value.id === sessionId;

const normalizedQuery = computed(() =>
  query.value.trim().toLocaleLowerCase('ru-RU')
);
const filteredSessions = computed(() => {
  if (!normalizedQuery.value) return sessions.value;
  return sessions.value.filter(session =>
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

const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(max-width: 768px)').matches;

const openAssistant = (sessionId: string | null = null): void => {
  navigateToAI(sessionId);
};

const handleNewSession = (): void => {
  closeActivePopover(createMenuId);
  startNewSession();
  openAssistant();
};

const handleNewTask = (): void => {
  closeActivePopover(createMenuId);
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

const handleDeleteSession = (sessionId: string): void => {
  deleteSession(sessionId);
  closeActivePopover(sessionMenuId(sessionId));
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
