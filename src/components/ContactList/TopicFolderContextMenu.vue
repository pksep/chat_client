<template>
  <Teleport to="body" :disabled="!isMobile">
    <ContextMenu
      class="topic-folder-context-menu"
      :class="{ 'topic-folder-context-menu--folders': folders.length }"
      :visible="true"
      :position="props.position"
      :data-testid="props.dataTestid"
      @unmount-close="emit('close')"
      @keydown.stop
      @keydown.esc.stop.prevent="handleEscape"
    >
      <template v-if="!isMobile || !showFolders">
        <slot name="before" />
        <Button
          v-if="folders.length"
          ref="triggerRef"
          class="topic-folder-context-menu__trigger"
          :class="{ 'topic-folder-context-menu__trigger--active': showFolders }"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          aria-haspopup="menu"
          :aria-expanded="showFolders"
          :aria-controls="panelId"
          :data-testid="`${props.dataTestid}-AddToFolder`"
          @click.stop="openFolders()"
          @mouseenter="handleHover"
          @mouseleave="scheduleClose"
          @keydown.right.stop.prevent="openFolders(true)"
        >
          <ChatFolderIcon name="folder" />
          <span class="topic-folder-context-menu__label">Добавить в папку</span>
          <Icon :name="IconNameEnum.chevronRight" :width="20" :height="20" />
        </Button>
        <slot name="after" />
      </template>
      <div
        v-if="showFolders && folders.length"
        :id="panelId"
        ref="panelRef"
        class="topic-folder-context-menu__folders"
        :class="{ 'topic-folder-context-menu__folders--mobile': isMobile }"
        :style="isMobile ? undefined : panelPosition"
        role="menu"
        aria-label="Добавить в папку"
        :aria-busy="!!savingFolderId"
        :data-testid="`${props.dataTestid}-Folders`"
        @mouseenter="cancelClose"
        @mouseleave="scheduleClose"
        @focusin="cancelClose"
        @keydown.left.stop.prevent="backToMenu"
        @keydown.down.stop.prevent="moveFolderFocus($event, 1)"
        @keydown.up.stop.prevent="moveFolderFocus($event, -1)"
      >
        <Button
          v-if="isMobile"
          class="topic-folder-context-menu__back"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          :data-testid="`${props.dataTestid}-FoldersBack`"
          @click.stop="backToMenu"
        >
          <Icon :name="IconNameEnum.arrowLeft" :width="20" :height="20" />
          Добавить в папку
        </Button>
        <Button
          v-for="folder in folders"
          :key="folder.id"
          class="topic-folder-context-menu__folder"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          role="menuitemcheckbox"
          :aria-checked="folder.topicIds.includes(props.topicId)"
          :disabled="!!savingFolderId"
          :title="folder.name"
          :data-testid="`${props.dataTestid}-Folder-${folder.id}`"
          @click.stop="selectFolder(folder.id)"
        >
          <ChatFolderIcon :name="folder.icon || 'folder'" />
          <span class="topic-folder-context-menu__label">{{
            folder.name
          }}</span>
          <Icon
            v-if="folder.topicIds.includes(props.topicId)"
            class="topic-folder-context-menu__check"
            :name="IconNameEnum.checked"
            :width="20"
            :height="20"
          />
        </Button>
      </div>
    </ContextMenu>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch
} from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import ContextMenu from './ContextMenu.vue';
import ChatFolderIcon from '../Menu/ChatFolderIcon.vue';
import { useChatFolders } from '../../composables/useChatFolders';
import { useResizeState } from '../../composables/useResizeState';
import { showNotification } from '../../composables/useNotifications';
import { authedUser } from '../../composables/useAuth';
import { MAX_W_MD } from '../../utils/constants';
import type { ChatFolderScope } from '../../services/useChatSDK/chat-folder';

const props = defineProps<{
  topicId: string;
  scope: ChatFolderScope;
  position: { x: number; y: number };
  dataTestid: string;
}>();
const emit = defineEmits<{ (event: 'close'): void }>();
const {
  folders: allFolders,
  loadFolders,
  addTopicToFolder,
  removeTopicFromFolder
} = useChatFolders(props.scope);
const folders = computed(() =>
  allFolders.value.filter(folder => !folder.isSystem)
);

const { state: isMobile } = useResizeState(MAX_W_MD);
const panelId = `topic-folders-${useId()}`;
const triggerRef = ref<InstanceType<typeof Button> | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const showFolders = ref(false);
const savingFolderId = ref('');
const panelPosition = ref({ left: '0px', top: '0px' });
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let layoutObserver: ResizeObserver | undefined;
let mounted = true;

const cancelClose = () => {
  clearTimeout(closeTimer);
  closeTimer = undefined;
};
const scheduleClose = () => {
  if (isMobile.value || savingFolderId.value) return;
  cancelClose();
  closeTimer = setTimeout(() => {
    if (!panelRef.value?.contains(document.activeElement))
      showFolders.value = false;
  }, 180);
};

const syncPanelPosition = () => {
  const trigger = triggerRef.value?.$el as HTMLElement | undefined;
  const menu = trigger?.closest('.context-menu');
  const panel = panelRef.value;
  if (isMobile.value || !showFolders.value || !trigger || !menu || !panel)
    return;
  const menuRect = menu.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const right = menuRect.right + 5;
  const left =
    right + panelRect.width <= window.innerWidth - 8
      ? right
      : menuRect.left - panelRect.width - 5;
  panelPosition.value = {
    left: `${Math.max(8, Math.min(left, window.innerWidth - panelRect.width - 8))}px`,
    top: `${Math.max(8, Math.min(triggerRect.top - 2, window.innerHeight - panelRect.height - 8))}px`
  };
};

const openFolders = async (focusFirst = false) => {
  cancelClose();
  showFolders.value = true;
  await nextTick();
  syncPanelPosition();
  if (focusFirst)
    panelRef.value
      ?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
      ?.focus();
};
const handleHover = () => {
  if (!isMobile.value) void openFolders();
};
const backToMenu = async () => {
  cancelClose();
  showFolders.value = false;
  await nextTick();
  (triggerRef.value?.$el as HTMLElement | undefined)?.focus();
};
const handleEscape = () => {
  if (showFolders.value) void backToMenu();
  else emit('close');
};
const moveFolderFocus = (event: KeyboardEvent, direction: number) => {
  const items = Array.from(
    panelRef.value?.querySelectorAll<HTMLElement>(
      '[role="menuitemcheckbox"]:not(:disabled)'
    ) || []
  );
  const index = items.indexOf(event.target as HTMLElement);
  items[(index + direction + items.length) % items.length]?.focus();
};

const selectFolder = async (folderId: string) => {
  if (savingFolderId.value) return;
  const isRemoving = !!folders.value
    .find(folder => folder.id === folderId)
    ?.topicIds.includes(props.topicId);
  cancelClose();
  savingFolderId.value = folderId;
  try {
    if (isRemoving) await removeTopicFromFolder(folderId, props.topicId);
    else await addTopicToFolder(folderId, props.topicId);
    if (mounted) emit('close');
  } catch (error) {
    if (mounted)
      showNotification({
        title: isRemoving
          ? 'Не удалось убрать чат из папки'
          : 'Не удалось добавить чат в папку',
        description: error
      });
  } finally {
    if (mounted) savingFolderId.value = '';
  }
};

watch(
  [showFolders, isMobile, () => props.position.x, () => props.position.y],
  async () => {
    await nextTick();
    layoutObserver?.disconnect();
    const menu = panelRef.value?.closest('.context-menu');
    if (showFolders.value && menu && panelRef.value) {
      layoutObserver = new ResizeObserver(syncPanelPosition);
      layoutObserver.observe(menu);
      layoutObserver.observe(panelRef.value);
      syncPanelPosition();
    }
  }
);
watch(
  () => folders.value.length,
  length => {
    if (!length) showFolders.value = false;
  }
);
watch(
  () => authedUser.value?.id,
  () => emit('close')
);
onMounted(() => {
  void loadFolders();
  window.addEventListener('resize', syncPanelPosition);
});
onBeforeUnmount(() => {
  mounted = false;
  cancelClose();
  layoutObserver?.disconnect();
  window.removeEventListener('resize', syncPanelPosition);
});
</script>

<style scoped>
.topic-folder-context-menu--folders.context-menu {
  width: 257px;
  min-width: 0;
  border: 0;
  border-radius: 15px;
  color: var(--text-primary);
  box-shadow: 0 4px 9.8px #0000000d;
}
.topic-folder-context-menu--folders::before,
.topic-folder-context-menu__folders:not(
    .topic-folder-context-menu__folders--mobile
  )::before {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--border-table);
  border-radius: inherit;
  pointer-events: none;
}
@media (min-resolution: 2dppx) {
  .topic-folder-context-menu--folders::before,
  .topic-folder-context-menu__folders:not(
      .topic-folder-context-menu__folders--mobile
    )::before {
    border-width: 0.5px;
  }
}
.topic-folder-context-menu :deep(.template) {
  overflow: visible;
}
.topic-folder-context-menu--folders :deep(button.button-yui-kit.small) {
  gap: 5px;
  min-width: 0;
  font-weight: 400;
  line-height: 100%;
  letter-spacing: 0;
}
.topic-folder-context-menu--folders :deep(button svg) {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.topic-folder-context-menu__trigger.button-yui-kit,
.topic-folder-context-menu__folder.button-yui-kit {
  justify-content: flex-start;
  color: var(--text-primary);
}
.topic-folder-context-menu__trigger--active.button-yui-kit {
  background: var(--action-secondary-hover-bg);
}
.topic-folder-context-menu__trigger.button-yui-kit:hover,
.topic-folder-context-menu__folder.button-yui-kit:not(:disabled):hover {
  background: var(--action-secondary-hover-bg);
}
.topic-folder-context-menu__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-align: left;
}
.topic-folder-context-menu__folders {
  position: fixed;
  display: grid;
  gap: 5px;
  box-sizing: border-box;
  width: 252px;
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 16px);
  padding: 10px;
  border-radius: 15px;
  background: var(--surface-overlay);
  color: var(--text-primary);
  box-shadow: 0 4px 9.8px #0000000d;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.topic-folder-context-menu__folders--mobile {
  position: static;
  width: 100%;
  padding: 0;
  max-height: calc(100dvh - 36px);
  border-radius: 0;
  box-shadow: none;
}
.topic-folder-context-menu__check {
  color: var(--action-primary-bg);
}
</style>
