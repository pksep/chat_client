<template>
  <div class="chats-toolbar" :data-testid="`${props.dataTestid}-ChatsToolbar`">
    <div class="chats-toolbar__headline">
      <h4
        v-if="!props.isCollapse"
        class="chats-toolbar__title"
        :data-testid="`${props.dataTestid}-ChatsToolbar-Title`"
      >
        Чаты
      </h4>

      <ConnectionStatus v-if="!props.isCollapse && !!isWaitingConnection" />

      <Button
        class="chats-toolbar__create-button"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-ChatsToolbar-CreateButton`"
        @click="evt => openActivePopover('plusMenu', evt as MouseEvent)"
      >
        <NewTopicIcon
          :data-testid="`${props.dataTestid}-ChatsToolbar-PlusIcon`"
        />
      </Button>

      <ContextMenu
        :visible="!!isOpen['plusMenu']"
        :position="props.contextMenuPosition || position"
        @unmount-close="closeActivePopover('plusMenu')"
        @click="closeActivePopover('plusMenu')"
        :data-testid="`${props.dataTestid}-ChatsToolbar-ContextMenu`"
        class="chats-toolbar__context-menu"
      >
        <Button
          @click="handleCreateChat"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ChatsToolbar-CreateChatButton`"
        >
          <MessageIcon /> Создать чат
        </Button>
        <Button
          @click="handleCreateGroup"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ChatsToolbar-CreateGroupButton`"
        >
          <GroupIcon /> Создать группу
        </Button>
        <Button
          @click="handleCreateBot"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ChatsToolbar-CreateBotButton`"
        >
          <BotIcon /> Создать бота
        </Button>
      </ContextMenu>
    </div>

    <Line :data-testid="`${props.dataTestid}-ChatsToolbar-Line`" />

    <div class="chats-toolbar__controls">
      <Search
        v-if="!props.isCollapse"
        class="chats-toolbar__search"
        :model-value="props.modelValue"
        @update:model-value="value => emits('update:modelValue', value)"
        :data-testid="`${props.dataTestid}-ChatsToolbar-Search`"
      />

      <div
        v-if="!props.isCollapse"
        class="chats-toolbar__filters"
        :data-testid="`${props.dataTestid}-ChatsToolbar-Filters`"
      >
        <button
          v-for="filterOption in filterOptions"
          :key="filterOption.value"
          type="button"
          :class="[
            'chats-toolbar__filter-button',
            {
              'chats-toolbar__filter-button--active':
                props.filter === filterOption.value
            }
          ]"
          :data-testid="`${props.dataTestid}-ChatsToolbar-Filter-${filterOption.value}`"
          @click="emits('update:filter', filterOption.value)"
        >
          <span>{{ filterOption.label }}</span>
          <span
            v-if="!!props.filterCounts[filterOption.value]"
            :class="[
              'chats-toolbar__filter-count',
              {
                'chats-toolbar__filter-count--muted':
                  props.filterMutedOnly[filterOption.value]
              }
            ]"
          >
            {{ props.filterCounts[filterOption.value] }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Button, ButtonTypeEnum, Search, SizesEnum } from '@pksep/yui';
import Line from '../UI/Line.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import ContextMenu from '../ContactList/ContextMenu.vue';
import BotIcon from '../UI/BotIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import GroupIcon from '../UI/GroupIcon.vue';
import NewTopicIcon from '../UI/NewTopicIcon.vue';
import type { ChatsToolbarFilter } from '../../composables/useChatsToolbarState';
import ConnectionStatus from '../UI/ConnectionStatus.vue';
import { getHasWebsocketConnection } from '../../services/useChat';

type ChatsToolbarCounts = Record<ChatsToolbarFilter, number>;
type ChatsToolbarMutedOnly = Record<ChatsToolbarFilter, boolean>;

const props = withDefaults(
  defineProps<{
    modelValue: string;
    filter?: ChatsToolbarFilter;
    filterCounts?: ChatsToolbarCounts;
    filterMutedOnly?: ChatsToolbarMutedOnly;
    isCollapse?: boolean;
    dataTestid?: string;
    contextMenuPosition?: { x: number; y: number };
  }>(),
  {
    filter: 'all',
    filterCounts: () => ({
      all: 0,
      chats: 0,
      groups: 0,
      bots: 0
    }),
    filterMutedOnly: () => ({
      all: false,
      chats: false,
      groups: false,
      bots: false
    }),
    isCollapse: false,
    dataTestid: 'ChatsToolbar'
  }
);

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:filter', value: ChatsToolbarFilter): void;
  (e: 'create-chat'): void;
  (e: 'create-group'): void;
  (e: 'create-bot'): void;
}>();

const isWaitingConnection = computed(() => !getHasWebsocketConnection());

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const handleCreateChat = () => {
  closeActivePopover('plusMenu');
  emits('create-chat');
};

const handleCreateGroup = () => {
  closeActivePopover('plusMenu');
  emits('create-group');
};

const handleCreateBot = () => {
  closeActivePopover('plusMenu');
  emits('create-bot');
};

const filterOptions: Array<{ value: ChatsToolbarFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' }
];
</script>
