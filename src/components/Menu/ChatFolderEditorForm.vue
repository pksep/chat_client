<template>
  <section
    :class="[
      'chat-folder-editor',
      {
        'chat-folder-editor--mobile': props.mobile
      }
    ]"
  >
    <label class="chat-folder-editor__field">
      <span>Название:</span>
      <Input
        :model-value="props.name"
        class="minor chat-folder-editor__name-input"
        placeholder="Введите название"
        data-testid="ChatFolders-NameInput"
        @update:model-value="emits('update:name', $event)"
      />
    </label>

    <div class="chat-folder-editor__label">
      {{ props.choices ? 'Добавить чаты и задачи:' : 'Добавить чаты:' }}
    </div>
    <MenuSearch
      :model-value="props.search"
      class="chat-folder-editor__search"
      placeholder="Поиск"
      data-testid="ChatFolders-TopicSearch"
      @update:model-value="emits('update:search', $event)"
    />

    <ChatsToolbarFilters
      :model-value="props.filter"
      class="chat-folder-editor__filters"
      :options="props.filterOptions"
      data-testid="ChatFolders-TopicFilters"
      @update:model-value="emits('update:filter', $event)"
    />

    <TopicList
      v-if="!props.choices"
      class="chat-folder-editor__topics"
      :topics="props.topics"
      :selected-topic-ids="props.selectedTopicIds"
      :search-query="props.search"
      show-checkbox
      show-last-online
      data-testid="ChatFolders-TopicList"
      @unmount-topic="emits('toggle-topic', $event)"
    />
    <ChatFolderChoiceList
      v-else
      class="chat-folder-editor__topics"
      :items="props.choices"
      :selected-keys="props.selectedTopicIds"
      @select="emits('toggle-choice', $event)"
    />

    <footer v-if="props.showFooter" class="chat-folder-editor__footer">
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        :disabled="!props.canSubmit || props.isSaving"
        :loading="props.isSaving"
        data-testid="ChatFolders-SaveButton"
        @click="emits('submit')"
      >
        {{ props.submitLabel }}
      </Button>
    </footer>
  </section>
</template>

<script setup lang="ts" generic="T extends string">
import type { ITopic } from '../interfaces/interfaces';
import type { AiFolderChoice } from '../../services/useChatSDK/chat-folder';
import ChatFolderChoiceList from './ChatFolderChoiceList.vue';
import TopicList from '../ContactList/TopicList.vue';
import ChatsToolbarFilters from './ChatsToolbarFilters.vue';
import { Button, ButtonTypeEnum, Input, SizesEnum } from '@pksep/yui';
import MenuSearch from '../UI/MenuSearch.vue';

const props = withDefaults(
  defineProps<{
    name: string;
    search: string;
    filter: T;
    filterOptions: Array<{ value: T; label: string }>;
    choices?: readonly AiFolderChoice[];
    topics: ITopic[];
    selectedTopicIds: Set<string>;
    canSubmit: boolean;
    isSaving: boolean;
    submitLabel: string;
    showFooter?: boolean;
    mobile?: boolean;
  }>(),
  { showFooter: true, mobile: false }
);

const emits = defineEmits<{
  (e: 'update:name', value: string): void;
  (e: 'update:search', value: string): void;
  (e: 'update:filter', value: T): void;
  (e: 'toggle-choice', item: AiFolderChoice): void;
  (e: 'toggle-topic', topic: ITopic): void;
  (e: 'submit'): void;
}>();
</script>
