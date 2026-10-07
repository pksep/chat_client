<template>
  <nav
    :class="['chat-folder-rail', { 'chat-folder-rail--mobile': props.mobile }]"
    aria-label="Папки чатов"
  >
    <div
      ref="containerRef"
      class="chat-folder-rail__items"
      :aria-busy="props.loading || isReordering"
      @pointerdown="onPointerDown"
      @touchstart.passive="onTouchStart"
      @click.capture="onClickCapture"
      @contextmenu.capture="onClickCapture"
      @keydown="onKeydown"
    >
      <button
        v-if="props.mobile"
        type="button"
        :class="[
          'chat-folder-rail__item',
          'chat-folder-rail__item--manage',
          {
            'chat-folder-rail__item--active': props.isActive && props.isManaging
          }
        ]"
        title="Настройки"
        aria-label="Открыть папки"
        :aria-pressed="props.isActive && props.isManaging"
        data-testid="ChatFolders-Rail-Manage"
        @click="emits('manage')"
      >
        <span class="chat-folder-rail__avatar">
          <span class="chat-folder-rail__manage-icon" aria-hidden="true" />
        </span>
        <span class="visually-hidden">Настройки</span>
      </button>

      <button
        type="button"
        :class="[
          'chat-folder-rail__item',
          {
            'chat-folder-rail__item--active':
              props.isActive &&
              !props.selectedFolderId &&
              !props.isManaging &&
              !props.systemActive
          }
        ]"
        title="Все чаты"
        :aria-pressed="
          props.isActive &&
          !props.selectedFolderId &&
          !props.isManaging &&
          !props.systemActive
        "
        data-testid="ChatFolders-Rail-All"
        @click="emits('select', null)"
      >
        <span class="chat-folder-rail__avatar">
          <MessageIcon />
          <span
            v-if="!props.mobile && allUnreadCount"
            class="chat-folder-rail__badge"
            :class="{
              'chat-folder-rail__badge--wide': allUnreadCount > 9,
              'chat-folder-rail__badge--muted': allUnreadBadge.isMuted
            }"
            :aria-label="`Непрочитанных сообщений: ${allUnreadCount}`"
            data-testid="ChatFolders-Rail-All-UnreadCount"
          >
            {{ allUnreadCount > 99 ? '99+' : allUnreadCount }}
          </span>
        </span>
        <span class="chat-folder-rail__label">Все чаты</span>
        <span
          v-if="props.mobile && allUnreadCount"
          class="chat-folder-rail__badge chat-folder-rail__badge--inline"
          :class="{ 'chat-folder-rail__badge--muted': allUnreadBadge.isMuted }"
          :aria-label="`Непрочитанных сообщений: ${allUnreadCount}`"
          data-testid="ChatFolders-Rail-All-UnreadCount"
        >
          {{ allUnreadCount > 99 ? '99+' : allUnreadCount }}
        </span>
      </button>

      <template v-if="props.loading && !props.folders.length">
        <span
          v-for="index in 3"
          :key="`folder-skeleton-${index}`"
          class="chat-folder-rail__item chat-folder-rail__item--skeleton"
          aria-hidden="true"
          :data-testid="`ChatFolders-Rail-Skeleton-${index}`"
        >
          <SkeletonBlock class="chat-folder-rail__avatar" />
          <SkeletonBlock class="chat-folder-rail__skeleton-name" />
        </span>
      </template>
      <TransitionGroup v-else name="chat-folder-sort">
        <button
          v-for="folder in orderedFolders"
          :key="folder.id"
          type="button"
          :class="[
            'chat-folder-rail__item',
            {
              'chat-folder-drag-source': draggedFolderId === folder.id,
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
          :data-folder-id="folder.id"
          :aria-keyshortcuts="
            props.mobile
              ? 'Alt+ArrowLeft Alt+ArrowRight'
              : 'Alt+ArrowUp Alt+ArrowDown'
          "
          :aria-description="
            props.mobile
              ? 'Удерживайте и перетащите, чтобы изменить порядок'
              : 'Перетащите, чтобы изменить порядок'
          "
          @click="handleFolderSelect(folder.id)"
        >
          <span
            class="chat-folder-rail__avatar chat-folder-rail__avatar--folder"
          >
            <ChatFolderIcon :name="folder.icon || 'folder'" />
            <span
              v-if="!props.mobile && getUnreadCount(folder)"
              class="chat-folder-rail__badge"
              :class="{
                'chat-folder-rail__badge--wide': getUnreadCount(folder) > 9,
                'chat-folder-rail__badge--muted': folderUnreadBadges.get(
                  folder.id
                )?.isMuted
              }"
            >
              {{ getUnreadCount(folder) > 99 ? '99+' : getUnreadCount(folder) }}
            </span>
          </span>
          <span class="chat-folder-rail__label">{{ folder.name }}</span>
        </button>
      </TransitionGroup>

      <slot v-if="props.mobile" name="system-folders" />
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
import { computed } from 'vue';
import type { ITopic } from '../interfaces/interfaces';
import type { ChatFolder } from '../../services/useChatSDK/chat-folder';
import { getTopicsUnreadBadgeState } from '../../utils/chats-toolbar-filter-badge';
import MessageIcon from '../UI/MessageIcon.vue';
import ChatFolderIcon from './ChatFolderIcon.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import { useChatFolders } from '../../composables/useChatFolders';
import { useChatFolderDrag } from '../../composables/useChatFolderDrag';
import type { ChatFolderScope } from '../../services/useChatSDK/chat-folder';

const props = withDefaults(
  defineProps<{
    folders: readonly ChatFolder[];
    topics: ITopic[];
    selectedFolderId: string | null;
    isManaging: boolean;
    isActive: boolean;
    mobile?: boolean;
    authUserId?: string;
    scope?: ChatFolderScope;
    loading?: boolean;
    systemActive?: boolean;
  }>(),
  {
    mobile: false,
    authUserId: '',
    scope: 'chats',
    loading: false
  }
);

const emits = defineEmits<{
  (e: 'select', folderId: string | null): void;
  (e: 'manage'): void;
}>();

const handleFolderSelect = (folderId: string): void => {
  const isSelected =
    props.isActive && !props.isManaging && props.selectedFolderId === folderId;
  emits('select', isSelected ? null : folderId);
};

const isReordering = computed(
  () => useChatFolders(props.scope).isReordering.value
);
const {
  containerRef,
  orderedFolders,
  draggedFolderId,
  onPointerDown,
  onTouchStart,
  onClickCapture,
  onKeydown
} = useChatFolderDrag({
  folders: () => props.folders,
  disabled: () => props.loading || isReordering.value,
  horizontal: () => props.mobile,
  wrapped: () => props.mobile,
  onReorder: folderIds => useChatFolders(props.scope).reorderFolders(folderIds)
});

const folderUnreadBadges = computed(
  () =>
    new Map(
      props.folders.map(folder => {
        const topicIds = new Set(folder.topicIds);
        return [
          folder.id,
          getTopicsUnreadBadgeState(
            props.topics.filter(topic => topicIds.has(topic.id)),
            props.authUserId
          )
        ] as const;
      })
    )
);

const getUnreadCount = (folder: ChatFolder): number =>
  folderUnreadBadges.value.get(folder.id)?.count || 0;

const allUnreadBadge = computed(() =>
  getTopicsUnreadBadgeState(props.topics, props.authUserId)
);
const allUnreadCount = computed(() => allUnreadBadge.value.count);
</script>
