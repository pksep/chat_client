<template>
  <nav
    :class="['chat-folder-rail', { 'chat-folder-rail--mobile': props.mobile }]"
    aria-label="Папки чатов"
  >
    <div class="chat-folder-rail__items">
      <button
        type="button"
        :class="[
          'chat-folder-rail__item',
          {
            'chat-folder-rail__item--active':
              props.isActive && !props.selectedFolderId && !props.isManaging
          }
        ]"
        title="Все чаты"
        :aria-pressed="
          props.isActive && !props.selectedFolderId && !props.isManaging
        "
        data-testid="ChatFolders-Rail-All"
        @click="emits('select', null)"
      >
        <span class="chat-folder-rail__avatar">
          <MessageIcon />
        </span>
        <span>Все чаты</span>
      </button>

      <button
        v-for="folder in props.folders"
        :key="folder.id"
        type="button"
        :class="[
          'chat-folder-rail__item',
          {
            'chat-folder-rail__item--active':
              props.isActive &&
              !props.isManaging &&
              props.selectedFolderId === folder.id
          }
        ]"
        :title="folder.name"
        :aria-pressed="
          props.isActive &&
          !props.isManaging &&
          props.selectedFolderId === folder.id
        "
        :data-testid="`ChatFolders-Rail-Folder-${folder.id}`"
        @click="emits('select', folder.id)"
      >
        <span class="chat-folder-rail__avatar chat-folder-rail__avatar--folder">
          <ChatFolderIcon :name="folder.icon || 'folder'" />
          <span
            v-if="!props.mobile && getUnreadCount(folder)"
            class="chat-folder-rail__badge"
            :class="{
              'chat-folder-rail__badge--wide': getUnreadCount(folder) > 9
            }"
          >
            {{ getUnreadCount(folder) > 99 ? '99+' : getUnreadCount(folder) }}
          </span>
        </span>
        <span>{{ folder.name }}</span>
      </button>

      <button
        v-if="props.mobile"
        type="button"
        class="chat-folder-rail__item chat-folder-rail__item--manage"
        title="Настройки"
        aria-label="Открыть папки"
        data-testid="ChatFolders-Rail-Manage"
        @click="emits('manage')"
      >
        <span class="chat-folder-rail__avatar">
          <span class="chat-folder-rail__manage-icon" aria-hidden="true" />
        </span>
        <span>Настройки</span>
      </button>
    </div>

    <div v-if="!props.mobile" class="chat-folder-rail__footer">
      <button
        type="button"
        :class="[
          'chat-folder-rail__manage',
          {
            'chat-folder-rail__manage--active':
              props.isActive && props.isManaging
          }
        ]"
        title="Папки"
        aria-label="Открыть папки"
        :aria-pressed="props.isActive && props.isManaging"
        data-testid="ChatFolders-Rail-Manage"
        @click="emits('manage')"
      >
        <span class="chat-folder-rail__manage-icon" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import type { ITopic } from '../interfaces/interfaces';
import type { ChatFolder } from '../../services/useChatSDK/chat-folder';
import { getTopicUnreadBadgeCount } from '../../utils/topicUnreadBadge';
import MessageIcon from '../UI/MessageIcon.vue';
import ChatFolderIcon from './ChatFolderIcon.vue';

const props = withDefaults(
  defineProps<{
    folders: readonly ChatFolder[];
    topics: ITopic[];
    selectedFolderId: string | null;
    isManaging: boolean;
    isActive: boolean;
    mobile?: boolean;
    authUserId?: string;
  }>(),
  {
    mobile: false,
    authUserId: ''
  }
);

const emits = defineEmits<{
  (e: 'select', folderId: string | null): void;
  (e: 'manage'): void;
}>();

const getUnreadCount = (folder: ChatFolder): number => {
  const topicIds = new Set(folder.topicIds);
  return props.topics.reduce(
    (count, topic) =>
      count +
      (topicIds.has(topic.id)
        ? getTopicUnreadBadgeCount(topic, props.authUserId)
        : 0),
    0
  );
};
</script>
