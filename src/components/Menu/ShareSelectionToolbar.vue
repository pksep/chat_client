<template>
  <div class="share-selection-toolbar">
    <div class="share-selection-toolbar__headline">
      <div class="share-selection-toolbar__title-block">
        <h4
          v-if="!props.isCollapse"
          class="share-selection-toolbar__title"
          :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Title`"
        >
          Выберите чаты
        </h4>
        <p
          v-if="!props.isCollapse"
          class="share-selection-toolbar__summary"
          :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Summary`"
        >
          {{ props.summaryLabel }}
        </p>
      </div>

      <div class="share-selection-toolbar__actions">
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          @click="emits('cancel')"
          :data-testid="`${props.dataTestid}-ShareSelectionToolbar-CancelButton`"
        >
          Отмена
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.little"
          :disabled="props.isSending || props.selectedCount === 0"
          @click="emits('send')"
          :data-testid="`${props.dataTestid}-ShareSelectionToolbar-SendButton`"
        >
          {{ props.isSending ? 'Отправка...' : 'Отправить' }}
        </Button>
      </div>
    </div>

    <Line :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Line`" />

    <div class="share-selection-toolbar__controls">
      <Textarea
        v-if="!props.isCollapse"
        class="share-selection-toolbar__message"
        :model-value="props.message"
        placeholder="Добавьте сообщение"
        @update:model-value="value => emits('update:message', value)"
        :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Message`"
      />

      <Search
        v-if="!props.isCollapse"
        class="share-selection-toolbar__search"
        :model-value="props.search"
        @update:model-value="value => emits('update:search', value)"
        :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Search`"
      />

      <div
        v-if="!props.isCollapse"
        class="share-selection-toolbar__filters"
        :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Filters`"
      >
        <button
          v-for="filterOption in filterOptions"
          :key="filterOption.value"
          type="button"
          :class="[
            'share-selection-toolbar__filter-button',
            {
              'share-selection-toolbar__filter-button--active':
                props.filter === filterOption.value
            }
          ]"
          :data-testid="`${props.dataTestid}-ShareSelectionToolbar-Filter-${filterOption.value}`"
          @click="emits('update:filter', filterOption.value)"
        >
          <span>{{ filterOption.label }}</span>
          <span
            v-if="!!props.filterCounts[filterOption.value]"
            class="share-selection-toolbar__filter-count"
          >
            {{ props.filterCounts[filterOption.value] }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Search,
  SizesEnum,
  Textarea
} from '@pksep/yui';
import Line from '../UI/Line.vue';
import type { ChatsToolbarFilter } from '../../composables/useChatsToolbarState';

type ChatsToolbarCounts = Record<ChatsToolbarFilter, number>;

const props = withDefaults(
  defineProps<{
    message: string;
    search: string;
    filter?: ChatsToolbarFilter;
    filterCounts?: ChatsToolbarCounts;
    selectedCount: number;
    summaryLabel: string;
    isSending?: boolean;
    isCollapse?: boolean;
    dataTestid?: string;
  }>(),
  {
    filter: 'all',
    filterCounts: () => ({
      all: 0,
      chats: 0,
      groups: 0,
      bots: 0
    }),
    isSending: false,
    isCollapse: false,
    dataTestid: 'ShareSelectionToolbar'
  }
);

const emits = defineEmits<{
  (e: 'update:message', value: string): void;
  (e: 'update:search', value: string): void;
  (e: 'update:filter', value: ChatsToolbarFilter): void;
  (e: 'cancel'): void;
  (e: 'send'): void;
}>();

const filterOptions: Array<{ value: ChatsToolbarFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' }
];
</script>

<style scoped>
.share-selection-toolbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-selection-toolbar__headline {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.share-selection-toolbar__title-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.share-selection-toolbar__title {
  margin: 0;
}

.share-selection-toolbar__summary {
  margin: 0;
  color: var(--text-secondary-color, #6b7280);
  font-size: 13px;
}

.share-selection-toolbar__actions {
  display: flex;
  gap: 8px;
}

.share-selection-toolbar__controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-selection-toolbar__message,
.share-selection-toolbar__search {
  width: 100%;
}

.share-selection-toolbar__filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.share-selection-toolbar__filter-button {
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--background-secondary-color, #f3f4f6);
  cursor: pointer;
}

.share-selection-toolbar__filter-button--active {
  background: var(--primary-color, #2563eb);
  color: #fff;
}

.share-selection-toolbar__filter-count {
  margin-left: 6px;
}
</style>
