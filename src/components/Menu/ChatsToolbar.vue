<template>
  <div class="chats-toolbar" :data-testid="`${props.dataTestid}-ChatsToolbar`">
    <div class="chats-toolbar__headline menu-section-heading">
      <h4
        v-if="!props.isCollapse"
        class="chats-toolbar__title"
        :data-testid="`${props.dataTestid}-ChatsToolbar-Title`"
      >
        {{ props.title }}
      </h4>

      <ConnectionStatus
        v-if="!props.isCollapse && !!isWaitingConnection"
        :refresh-failed="getTopicsRefreshFailed()"
      />

      <Button
        v-if="props.showCreate"
        class="chats-toolbar__create-button"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-ChatsToolbar-CreateButton`"
        @click="evt => openActivePopover('plusMenu', evt as MouseEvent)"
      >
        <Icon
          :name="IconNameEnum.plus"
          viewBox="0 0 24 24"
          :data-testid="`${props.dataTestid}-ChatsToolbar-PlusIcon`"
        />
      </Button>

      <ContextMenu
        v-if="props.showCreate"
        :visible="!!isOpen['plusMenu']"
        :position="props.contextMenuPosition || position"
        @unmount-close="closeActivePopover('plusMenu')"
        @click="closeActivePopover('plusMenu')"
        :data-testid="`${props.dataTestid}-ChatsToolbar-ContextMenu`"
        class="chats-toolbar__context-menu"
      >
        <Button
          @click="handleCreateChat"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ChatsToolbar-CreateChatButton`"
        >
          <MessageIcon /> Создать чат
        </Button>
        <Button
          @click="handleCreateGroup"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-ChatsToolbar-CreateGroupButton`"
        >
          <GroupIcon /> Создать группу
        </Button>
        <Button
          @click="handleCreateBot"
          :type="ButtonTypeEnum.popover"
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

      <template v-if="!props.isCollapse">
        <slot name="filters">
          <ChatsToolbarFilters
            :model-value="props.filter"
            :options="filterOptions"
            :counts="props.filterCounts"
            :muted-only="props.filterMutedOnly"
            :data-testid="`${props.dataTestid}-ChatsToolbar`"
            @update:model-value="emits('update:filter', $event)"
          />
        </slot>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Search,
  SizesEnum
} from '@pksep/yui';
import Line from '../UI/Line.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import ContextMenu from '../ContactList/ContextMenu.vue';
import BotIcon from '../UI/BotIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import GroupIcon from '../UI/GroupIcon.vue';
import type { ChatsToolbarFilter } from '../../composables/useChatsToolbarState';
import ConnectionStatus from '../UI/ConnectionStatus.vue';
import ChatsToolbarFilters from './ChatsToolbarFilters.vue';
import { getTopicsRefreshFailed } from '../../composables/useTopics';
import {
  getHasBrowserNetwork,
  getHasWebsocketConnection
} from '../../services/useChat';

type ChatsToolbarCounts = Record<ChatsToolbarFilter, number>;
type ChatsToolbarMutedOnly = Record<ChatsToolbarFilter, boolean>;

const props = withDefaults(
  defineProps<{
    modelValue: string;
    title?: string;
    showCreate?: boolean;
    filter?: ChatsToolbarFilter;
    filterCounts?: ChatsToolbarCounts;
    filterMutedOnly?: ChatsToolbarMutedOnly;
    isCollapse?: boolean;
    dataTestid?: string;
    contextMenuPosition?: { x: number; y: number };
  }>(),
  {
    title: 'Чаты',
    showCreate: true,
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

const hasRenderableTopics = computed(() =>
  Object.values(props.filterCounts).some(count => count > 0)
);

const isWaitingConnection = computed(() => {
  if (!getHasBrowserNetwork() || getTopicsRefreshFailed()) {
    return true;
  }

  return !getHasWebsocketConnection() && !hasRenderableTopics.value;
});

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
