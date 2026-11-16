<template>
  <div class="contact-list chat-folder-choice-list">
    <div
      v-for="item in items"
      :key="aiFolderItemKey(item)"
      class="menu-list-row chat-folder-choice-list__row"
    >
      <button
        type="button"
        class="menu-list-item chat-folder-choice-list__item"
        :data-testid="`AI-FolderChoice-${aiFolderItemKey(item)}`"
        @click="emit('select', item)"
      >
        <ChatFolderIcon :name="item.kind === 'tasks' ? 'lightbulb' : 'robot'" />
        <span class="chat-folder-choice-list__copy"
          ><strong>{{ item.title }}</strong
          ><small>{{ item.description }}</small></span
        >
      </button>
      <Checkbox
        v-if="selectedKeys"
        :size="CheckboxSizeEnum.small"
        :model-value="selectedKeys.has(aiFolderItemKey(item))"
        @click.stop
        @update:model-value="emit('select', item)"
      />
    </div>
    <MenuEmptyState
      v-if="!items.length"
      text="Здесь пока нет чатов и задач"
      hide-icon
    />
  </div>
</template>

<script setup lang="ts">
import { Checkbox, CheckboxSizeEnum } from '@pksep/yui';
import type { AiFolderChoice } from '../../services/useChatSDK/chat-folder';
import { aiFolderItemKey } from '../../utils/ai-folder';
import ChatFolderIcon from './ChatFolderIcon.vue';
import MenuEmptyState from './MenuEmptyState.vue';

defineProps<{ items: readonly AiFolderChoice[]; selectedKeys?: Set<string> }>();
const emit = defineEmits<{ select: [item: AiFolderChoice] }>();
</script>

<style scoped>
.chat-folder-choice-list__row {
  display: flex;
  align-items: center;
  padding-right: 12px;
}
.chat-folder-choice-list__item {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 12px;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
}
.chat-folder-choice-list__item > svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}
.chat-folder-choice-list__copy {
  display: grid;
  flex: 1;
  gap: 4px;
  min-width: 0;
}
.chat-folder-choice-list__copy strong,
.chat-folder-choice-list__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-folder-choice-list__copy small {
  color: var(--text-secondary);
}
</style>
