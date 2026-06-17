<template>
  <MobileModal
    class="share-selection-modal"
    :open="props.open"
    :show-divider="true"
    :data-testid="`${props.dataTestid}-ShareSelectionModal`"
    @unmount-close="emits('cancel')"
  >
    <template #header>
      <button
        class="mobile__modal-header--button share-selection-modal__header-button"
        :data-testid="`${props.dataTestid}-ShareSelectionModal-BackButton`"
        @click="emits('cancel')"
      >
        Назад
      </button>

      <div class="share-selection-modal__header-copy">
        <h3
          class="mobile__modal-header--title share-selection-modal__header-title"
          :data-testid="`${props.dataTestid}-ShareSelectionModal-Title`"
        >
          Поделиться
        </h3>
        <p
          class="share-selection-modal__subtitle"
          :data-testid="`${props.dataTestid}-ShareSelectionModal-Subtitle`"
        >
          Выберите чаты
        </p>
      </div>

      <div class="share-selection-modal__header-spacer" />
    </template>

    <section class="share-selection-modal__body">
      <div class="share-selection-modal__controls">
        <Search
          class="share-selection-modal__search"
          :model-value="props.search"
          :data-testid="`${props.dataTestid}-ShareSelectionModal-Search`"
          @update:model-value="value => emits('update:search', value)"
        />

        <div
          class="chats-toolbar__filters"
          :data-testid="`${props.dataTestid}-ShareSelectionModal-Filters`"
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
            :data-testid="`${props.dataTestid}-ShareSelectionModal-Filter-${filterOption.value}`"
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

      <div class="share-selection-modal__list-shell">
        <TopicList
          :topics="props.topics"
          :show-checkbox="true"
          :selected-topic-ids="props.selectedTopicIds"
          :data-testid="`${props.dataTestid}-ShareSelectionModal-TopicList`"
          @unmount-topic="topic => emits('toggle-topic', topic)"
        />
      </div>

      <MessageListInput
        :model-value="props.message"
        :edit-message="null"
        :reply-message="null"
        :forward-messages="[]"
        :allow-empty-send="props.selectedCount > 0 && props.filesCount > 0"
        :allow-attach-file="true"
        :allow-select-user="false"
        custom-action-title="Прикреплено"
        :custom-action-description="props.summaryLabel"
        :data-testid="`${props.dataTestid}-ShareSelectionModal-Input`"
        @update:model-value="value => emits('update:message', value)"
        @attach-file="handleAttachFiles"
        @send="handleSubmitInput"
      />
    </section>
  </MobileModal>
</template>

<script setup lang="ts">
import { Search } from '@pksep/yui';
import MobileModal from '../UI/MobileModal.vue';
import TopicList from '../ContactList/TopicList.vue';
import MessageListInput from '../Messages/MessageListInput.vue';
import type { ITopic } from '../interfaces/interfaces';
import type { ChatsToolbarFilter } from '../../composables/useChatsToolbarState';

type ChatsToolbarCounts = Record<ChatsToolbarFilter, number>;
type ChatsToolbarMutedOnly = Record<ChatsToolbarFilter, boolean>;

interface IShareInputPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    topics: ITopic[];
    message: string;
    search: string;
    filter?: ChatsToolbarFilter;
    filterCounts?: ChatsToolbarCounts;
    filterMutedOnly?: ChatsToolbarMutedOnly;
    selectedTopicIds: Set<string>;
    selectedCount: number;
    filesCount: number;
    summaryLabel: string;
    isSending?: boolean;
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
    filterMutedOnly: () => ({
      all: false,
      chats: false,
      groups: false,
      bots: false
    }),
    isSending: false,
    dataTestid: 'ShareSelectionModal'
  }
);

const emits = defineEmits<{
  (e: 'update:message', value: string): void;
  (e: 'update:search', value: string): void;
  (e: 'update:filter', value: ChatsToolbarFilter): void;
  (e: 'toggle-topic', topic: ITopic): void;
  (e: 'attach-files', files: FileList, isMedia?: boolean): void;
  (e: 'cancel'): void;
  (e: 'submit-input', payload?: IShareInputPayload): void;
}>();

const filterOptions: Array<{ value: ChatsToolbarFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' }
];

const handleAttachFiles = (files: FileList, isMedia?: boolean): void => {
  emits('attach-files', files, isMedia);
};

const handleSubmitInput = (payload?: IShareInputPayload): void => {
  emits('submit-input', payload);
};
</script>

<style scoped>
.share-selection-modal :deep(.modal-yui-kit__modal-content) {
  gap: 0;
  padding: 0;
}

.share-selection-modal :deep(.mobile__modal-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  height: auto;
  min-height: 74px;
  padding: 18px 16px 14px;
}

.share-selection-modal__header-button,
.share-selection-modal__header-spacer {
  width: 56px;
  min-width: 56px;
}

.share-selection-modal__header-button {
  padding: 0;
  text-align: left;
  white-space: nowrap;
}

.share-selection-modal__header-copy {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.share-selection-modal__header-title {
  width: auto;
  max-width: none;
  font-size: 18px;
  font-weight: 700;
}

.share-selection-modal__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--text-grey);
}

.share-selection-modal__body {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: min(78vh, 640px);
  overflow: hidden;
}

.share-selection-modal__controls {
  display: grid;
  gap: 10px;
  padding: 12px 12px 10px;
}

.share-selection-modal__list-shell {
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 12px 12px;
}

@media (width >= 768px) {
  .share-selection-modal__body {
    height: 620px;
  }
}
</style>
