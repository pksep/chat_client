<template>
  <section
    :class="[
      'chat-folders-panel',
      {
        'chat-folders-panel--mobile': props.mobile,
        'chat-folders-panel--with-rail': props.mobile && !!$slots.folders
      }
    ]"
    data-testid="ChatFolders-Panel"
    @click="closeFolderMenu"
  >
    <MenuSectionHeading class="chat-folders-panel__header">
      <h4>Папки</h4>
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        class="chat-folders-panel__add"
        aria-label="Создать папку"
        data-testid="ChatFolders-CreateButton"
        @click="openCreateEditor"
      >
        <Icon :name="IconNameEnum.plus" viewBox="0 0 24 24" />
      </Button>
    </MenuSectionHeading>

    <MenuSearch
      v-model="folderSearch"
      class="chat-folders-panel__search"
      placeholder="Поиск"
      data-testid="ChatFolders-Search"
    />

    <div v-if="props.mobile && $slots.folders" class="chat-folders-panel__rail">
      <slot name="folders" />
    </div>

    <ul
      v-if="props.loading && !props.folders.length"
      class="chat-folders-panel__list"
      aria-busy="true"
      aria-label="Загрузка папок"
      data-testid="ChatFolders-List-Skeleton"
    >
      <li
        v-for="index in 3"
        :key="index"
        aria-hidden="true"
        :data-testid="`ChatFolders-List-Skeleton-${index}`"
      >
        <div
          class="chat-folders-panel__folder chat-folders-panel__folder--skeleton"
        >
          <SkeletonBlock class="chat-folders-panel__folder-icon" />
          <SkeletonBlock class="chat-folders-panel__skeleton-name" />
          <SkeletonBlock class="chat-folders-panel__skeleton-count" />
        </div>
      </li>
    </ul>
    <div v-else-if="!filteredFolders.length" class="chat-folders-panel__state">
      {{ folderSearch ? 'Папки не найдены' : 'Здесь будут папки' }}
    </div>

    <ul
      v-else
      v-menu-list-press
      ref="containerRef"
      class="chat-folders-panel__list"
      :aria-busy="props.loading || isReordering"
      @pointerdown="onPointerDown"
      @touchstart.passive="onTouchStart"
      @click.capture="onClickCapture"
      @contextmenu.capture="onClickCapture"
      @keydown="onKeydown"
    >
      <TransitionGroup name="chat-folder-sort">
        <li
          v-for="folder in orderedFolders"
          :key="folder.id"
          :class="[
            'menu-list-row',
            { 'menu-list-row--active': props.selectedFolderId === folder.id }
          ]"
        >
          <button
            type="button"
            :class="[
              'chat-folders-panel__folder menu-list-item',
              { 'chat-folder-drag-source': draggedFolderId === folder.id }
            ]"
            :data-testid="`ChatFolders-Folder-${folder.id}`"
            :data-folder-id="folder.id"
            :aria-keyshortcuts="
              folder.isSystem ? undefined : 'Alt+ArrowUp Alt+ArrowDown'
            "
            :aria-description="
              folder.isSystem
                ? 'Системная папка'
                : props.mobile
                  ? 'Удерживайте и перетащите, чтобы изменить порядок'
                  : 'Перетащите, чтобы изменить порядок'
            "
            @click="openDetails(folder.id)"
            @contextmenu.prevent="openFolderMenu(folder.id, $event)"
          >
            <span class="chat-folders-panel__folder-icon">
              <ChatFolderGlyph :name="folder.icon || 'folder'" />
            </span>
            <span class="chat-folders-panel__folder-name">{{
              folder.name
            }}</span>
            <span class="chat-folders-panel__folder-count">
              {{ folder.topicIds.length }}
            </span>
          </button>
        </li>
      </TransitionGroup>
    </ul>

    <ContextMenu
      :visible="!!openMenuFolderId && !!isOpen.folderMenu"
      :position="contextMenuPosition"
      data-testid="ChatFolders-Actions"
      @unmount-close="closeFolderMenu"
    >
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click="openSelectedFolderDetails"
      >
        <Icon :name="IconNameEnum.editing" />
        Редактировать папку
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        class="red-context-button"
        @click="requestDeleteSelectedFolder"
      >
        <Icon :name="IconNameEnum.deleteSmall" />
        Удалить папку
      </Button>
    </ContextMenu>
  </section>

  <Modal
    v-if="!props.mobile"
    :open="editorMode !== null"
    position="center"
    class="new-group chat-folder-editor-modal"
    data-testid="ChatFolders-EditorModal"
    @close="closeEditor"
  >
    <header class="new-group__header chat-folder-modal__header">
      <strong>{{
        editorMode === 'create' ? 'Создать папку' : 'Редактировать папку'
      }}</strong>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        class="new-group__button-close chat-folder-modal__close"
        aria-label="Закрыть"
        @click="closeEditor"
      >
        <Icon :name="IconNameEnum.crossSmall" />
      </Button>
    </header>

    <ChatFolderEditorForm
      :name="draftName"
      :search="topicSearch"
      :filter="topicFilter"
      :filter-options="topicFilterOptions"
      :topics="filteredTopics"
      :selected-topic-ids="draftTopicIds"
      :can-submit="canSubmit"
      :is-saving="isSaving"
      :submit-label="editorSubmitLabel"
      @update:name="updateDraftName"
      @update:search="topicSearch = $event"
      @update:filter="topicFilter = $event"
      @toggle-topic="toggleTopic"
      @submit="saveEditor"
    />
  </Modal>

  <MobileModal
    v-else
    :open="editorMode !== null"
    class="chat-folder-editor-modal chat-folder-editor-mobile"
    close-button-text="Назад"
    :title="editorTitle"
    :show-divider="false"
    menu-heading
    data-testid="ChatFolders-Editor"
    @unmount-close="closeEditor"
    @unmount-next="saveEditor"
  >
    <ChatFolderEditorForm
      mobile
      :name="draftName"
      :search="topicSearch"
      :filter="topicFilter"
      :filter-options="topicFilterOptions"
      :topics="filteredTopics"
      :selected-topic-ids="draftTopicIds"
      :can-submit="canSubmit"
      :is-saving="isSaving"
      :submit-label="editorSubmitLabel"
      :show-footer="false"
      @update:name="updateDraftName"
      @update:search="topicSearch = $event"
      @update:filter="topicFilter = $event"
      @toggle-topic="toggleTopic"
      @submit="saveEditor"
    />
    <template #footer>
      <footer
        class="chat-folder-editor__footer chat-folder-editor__footer--mobile"
      >
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          :disabled="!canSubmit || isSaving"
          :loading="isSaving"
          data-testid="ChatFolders-SaveButton"
          @click="saveEditor"
        >
          {{ editorSubmitLabel }}
        </Button>
      </footer>
    </template>
  </MobileModal>

  <Modal
    :open="detailsFolder !== null"
    position="right"
    class="chat-folder-details-modal"
    data-testid="ChatFolders-DetailsModal"
    @close="closeDetails"
  >
    <aside v-if="detailsFolder" class="chat-folder-details">
      <div class="chat-folder-details__info">
        <MenuSectionHeading
          :shared="props.mobile"
          :centered="props.mobile"
          class="chat-folder-details__header"
        >
          <Button
            v-if="props.mobile"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.little"
            class="chat-folder-details__back"
            @click="closeDetails"
          >
            Назад
          </Button>
          <div class="chat-folder-details__header-title">
            <strong>Информация о папке</strong>
            <span v-if="!props.mobile">{{ detailsChatsLabel }}</span>
          </div>
          <Button
            v-if="!props.mobile"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.little"
            class="chat-folder-details__close"
            aria-label="Закрыть"
            @click="closeDetails"
          >
            <Icon :name="IconNameEnum.crossLarge" />
          </Button>
        </MenuSectionHeading>

        <span v-if="props.mobile" class="chat-folder-details__subtitle">
          {{ detailsChatsLabel }}
        </span>

        <div ref="iconRowRef" class="chat-folder-details__icon-row">
          <button
            type="button"
            class="chat-folder-details__icon"
            aria-label="Выбрать иконку папки"
            :aria-expanded="isIconPickerOpen"
            :disabled="isSaving"
            data-testid="ChatFolders-IconButton"
            @click="isIconPickerOpen = !isIconPickerOpen"
          >
            <ChatFolderGlyph :name="detailsFolder.icon || 'folder'" />
            <span aria-hidden="true">
              <Icon :name="IconNameEnum.editing" />
            </span>
          </button>

          <div
            v-if="isIconPickerOpen"
            class="chat-folder-details__icon-picker"
            data-testid="ChatFolders-IconPicker"
          >
            <button
              v-for="icon in chatFolderIcons"
              :key="icon"
              type="button"
              :class="{
                'chat-folder-details__icon-option--active':
                  (detailsFolder.icon || 'folder') === icon
              }"
              :aria-label="`Выбрать иконку ${icon}`"
              :aria-pressed="(detailsFolder.icon || 'folder') === icon"
              :disabled="isSaving"
              :data-testid="`ChatFolders-Icon-${icon}`"
              @click="saveDetailsIcon(icon)"
            >
              <ChatFolderGlyph :name="icon" />
            </button>
          </div>
        </div>

        <div class="chat-folder-details__user-info">
          <div class="chat-folder-details__name-block">
            <Input
              :model-value="detailsName"
              class="minor chat-folder-details__name"
              aria-label="Название папки"
              data-testid="ChatFolders-DetailsNameInput"
              @update:model-value="updateDetailsName"
              @focusout="saveDetailsName"
              @keydown.enter="saveDetailsName"
            />
          </div>

          <div class="chat-folder-details__actions">
            <Button
              :type="ButtonTypeEnum.secondary"
              :size="SizesEnum.large"
              class="menu-info__secondary-button"
              @click="openEditEditor(detailsFolder)"
            >
              <MessageIcon />
              Добавить чат
            </Button>
            <Button
              :type="ButtonTypeEnum.secondary"
              :size="SizesEnum.large"
              class="menu-info__secondary-button"
              @click="requestDelete(detailsFolder.id)"
            >
              <Icon :name="IconNameEnum.deleteSmall" />
              Удалить папку
            </Button>
          </div>
        </div>
      </div>

      <TopicList
        class="chat-folder-details__topics"
        :folder-scope="props.scope"
        :topics="detailsTopics"
        show-last-online
        data-testid="ChatFolders-DetailsTopics"
        @unmount-topic="handleDetailsTopicSelect"
      />
    </aside>
  </Modal>

  <ConfirmModal
    :open="deleteFolderTarget !== null"
    class="chat-folder-delete-modal"
    title="Удалить папку"
    :description="deleteFolderDescription"
    data-testid="ChatFolders-DeleteModal"
    @unmount-close="cancelDelete"
    @unmount-confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
import MenuSearch from '../UI/MenuSearch.vue';
import { vMenuListPress } from '../../directives/menu-list-press';
import { computed, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import type { ITopic } from '../interfaces/interfaces';
import {
  chatFolderIcons,
  type ChatFolder,
  type ChatFolderIcon,
  type ChatFolderScope
} from '../../services/useChatSDK/chat-folder';
import type { ChatsToolbarFilter } from '../../composables/useChatsToolbarState';
import { useChatFolders } from '../../composables/useChatFolders';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';
import { useChatFolderDrag } from '../../composables/useChatFolderDrag';
import { getAuthUser } from '../../composables/useAuth';
import { getTopicsByChatsToolbarFilter } from '../../utils/chats-toolbar-filter';
import {
  matchesTopicSearch,
  normalizeAtSearchQuery
} from '../../utils/searchMatch';
import TopicList from '../ContactList/TopicList.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import MobileModal from '../UI/MobileModal.vue';
import MenuSectionHeading from '../UI/MenuSectionHeading.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import ChatFolderEditorForm from './ChatFolderEditorForm.vue';
import ChatFolderGlyph from './ChatFolderIcon.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import { showNotification } from '../../composables/useNotifications';
import Modal from '../UI/Modal.vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Input,
  SizesEnum
} from '@pksep/yui';

const props = withDefaults(
  defineProps<{
    topics: ITopic[];
    folders: readonly ChatFolder[];
    loading?: boolean;
    mobile?: boolean;
    selectedFolderId?: string | null;
    scope?: ChatFolderScope;
  }>(),
  { loading: false, mobile: false, selectedFolderId: null, scope: 'chats' }
);

const emits = defineEmits<{
  (e: 'close'): void;
  (e: 'select-folder', folderId: string | null): void;
  (e: 'select-topic', topic: ITopic): void;
}>();

const {
  createFolder,
  updateFolder,
  deleteFolder,
  isReordering,
  reorderFolders
} = useChatFolders(props.scope);
const folderSearch = ref('');
const openMenuFolderId = ref<string | null>(null);
const {
  isOpen,
  position: contextMenuPosition,
  openActivePopover,
  closeActivePopover
} = useContextMenu();
const editorMode = ref<'create' | 'edit' | null>(null);
const editingFolderId = ref<string | null>(null);
const draftName = ref('');
const draftTopicIds = ref<Set<string>>(new Set());
const topicSearch = ref('');
const topicFilter = ref<ChatsToolbarFilter>('all');
const detailsFolderId = ref<string | null>(null);
const detailsName = ref('');
const isIconPickerOpen = ref(false);
const iconRowRef = ref<HTMLElement | null>(null);
const deleteFolderTargetId = ref<string | null>(null);
const isSaving = ref(false);

useBackButtonHandler(
  () => true,
  () => emits('close')
);
useBackButtonHandler(
  isIconPickerOpen,
  () => {
    isIconPickerOpen.value = false;
  },
  BackButtonPriority.overlay
);

onClickOutside(iconRowRef, () => {
  isIconPickerOpen.value = false;
});

const topicFilterOptions: Array<{
  value: ChatsToolbarFilter;
  label: string;
}> = [
  { value: 'all', label: 'Все' },
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' }
];

const filteredFolders = computed(() => {
  const query = folderSearch.value.trim().toLocaleLowerCase();
  return query
    ? props.folders.filter(folder =>
        folder.name.toLocaleLowerCase().includes(query)
      )
    : props.folders;
});

const {
  containerRef,
  orderedFolders,
  draggedFolderId,
  onPointerDown,
  onTouchStart,
  onClickCapture,
  onKeydown
} = useChatFolderDrag({
  folders: () => filteredFolders.value,
  disabled: () =>
    props.loading || isReordering.value || !!folderSearch.value.trim(),
  onReorder: reorderFolders
});

const filteredTopics = computed(() => {
  const authUserId = getAuthUser()?.id;
  const query = normalizeAtSearchQuery(topicSearch.value);
  const byType = getTopicsByChatsToolbarFilter(
    props.topics,
    topicFilter.value,
    authUserId
  );
  return query
    ? byType.filter(topic => matchesTopicSearch(topic, query))
    : byType;
});

const detailsFolder = computed(
  () =>
    props.folders.find(folder => folder.id === detailsFolderId.value) || null
);

const detailsTopics = computed(() => {
  const ids = new Set(detailsFolder.value?.topicIds || []);
  return props.topics.filter(topic => ids.has(topic.id));
});

const detailsChatsLabel = computed(() => {
  const count = detailsFolder.value?.topicIds.length || 0;
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  let word = 'чатов';

  if (lastTwoDigits < 11 || lastTwoDigits > 14) {
    if (lastDigit === 1) word = 'чат';
    if (lastDigit >= 2 && lastDigit <= 4) word = 'чата';
  }

  return `${count} ${word}`;
});

const deleteFolderTarget = computed(
  () =>
    props.folders.find(folder => folder.id === deleteFolderTargetId.value) ||
    null
);

const deleteFolderDescription = computed(() =>
  deleteFolderTarget.value
    ? `Вы уверены, что хотите удалить папку «${deleteFolderTarget.value.name}»?`
    : ''
);

const canSubmit = computed(() => {
  const nameLength = draftName.value.trim().length;
  return nameLength > 0 && nameLength <= 15 && draftTopicIds.value.size > 0;
});

const editorTitle = computed(() =>
  editorMode.value === 'edit' ? 'Редактировать папку' : 'Создать папку'
);

const editorSubmitLabel = computed(() =>
  editorMode.value === 'edit' ? 'Сохранить' : 'Создать'
);

const updateDraftName = (value: string): void => {
  draftName.value = value.slice(0, 15);
};

const updateDetailsName = (value: string): void => {
  detailsName.value = value.slice(0, 15);
};

const openFolderMenu = (folderId: string, event: MouseEvent): void => {
  if (props.folders.find(folder => folder.id === folderId)?.isSystem) return;

  openMenuFolderId.value = folderId;
  openActivePopover('folderMenu', event);
};

const closeFolderMenu = (): void => {
  openMenuFolderId.value = null;
  closeActivePopover('folderMenu');
};

const openSelectedFolderDetails = (): void => {
  const folderId = openMenuFolderId.value;
  if (!folderId) return;
  closeFolderMenu();
  openDetails(folderId);
};

const requestDeleteSelectedFolder = (): void => {
  const folderId = openMenuFolderId.value;
  if (!folderId) return;
  closeFolderMenu();
  requestDelete(folderId);
};

const resetEditor = (): void => {
  topicSearch.value = '';
  topicFilter.value = 'all';
};

const openCreateEditor = (): void => {
  resetEditor();
  editingFolderId.value = null;
  draftName.value = '';
  draftTopicIds.value = new Set();
  editorMode.value = 'create';
};

const openEditEditor = (folder: ChatFolder): void => {
  if (folder.isSystem) return;

  resetEditor();
  editingFolderId.value = folder.id;
  draftName.value =
    folder.id === detailsFolderId.value ? detailsName.value : folder.name;
  draftTopicIds.value = new Set(folder.topicIds);
  detailsFolderId.value = null;
  isIconPickerOpen.value = false;
  editorMode.value = 'edit';
};

const closeEditor = (): void => {
  editorMode.value = null;
  editingFolderId.value = null;
};

const toggleTopic = (topic: ITopic): void => {
  const next = new Set(draftTopicIds.value);
  if (next.has(topic.id)) next.delete(topic.id);
  else next.add(topic.id);
  draftTopicIds.value = next;
};

const saveEditor = async (): Promise<void> => {
  if (!canSubmit.value || isSaving.value) return;
  isSaving.value = true;

  try {
    if (editorMode.value === 'create') {
      await createFolder(draftName.value, [...draftTopicIds.value]);
    } else if (editingFolderId.value) {
      await updateFolder(editingFolderId.value, {
        name: draftName.value,
        topicIds: [...draftTopicIds.value]
      });
    }
    closeEditor();
  } catch (error) {
    showNotification({
      title: 'Не удалось сохранить папку',
      description: error
    });
  } finally {
    isSaving.value = false;
  }
};

const openDetails = (folderId: string): void => {
  const folder = props.folders.find(item => item.id === folderId);
  if (!folder) return;
  if (folder.isSystem) {
    emits('select-folder', folderId);
    return;
  }

  closeFolderMenu();
  isIconPickerOpen.value = false;
  detailsFolderId.value = folderId;
  detailsName.value = folder.name;
};

const closeDetails = (): void => {
  detailsFolderId.value = null;
  isIconPickerOpen.value = false;
};

watch(detailsFolder, (folder, previous) => {
  if (!folder) closeDetails();
  else if (detailsName.value === previous?.name)
    detailsName.value = folder.name;
});

watch(
  () => props.folders,
  folders => {
    const exists = (id: string | null) =>
      !id || folders.some(folder => folder.id === id);
    if (!exists(editingFolderId.value)) closeEditor();
    if (!exists(openMenuFolderId.value)) closeFolderMenu();
    if (!exists(deleteFolderTargetId.value)) deleteFolderTargetId.value = null;
  }
);

const handleDetailsTopicSelect = (topic: ITopic): void => {
  closeDetails();
  emits('select-topic', topic);
};

const saveDetailsName = async (): Promise<void> => {
  const folder = detailsFolder.value;
  const name = detailsName.value.trim();
  if (folder && !name) {
    detailsName.value = folder.name;
    return;
  }
  if (
    !folder ||
    !name ||
    name.length > 15 ||
    name === folder.name ||
    isSaving.value
  )
    return;

  isSaving.value = true;
  try {
    await updateFolder(folder.id, { name });
  } catch (error) {
    showNotification({
      title: 'Не удалось переименовать папку',
      description: error
    });
    detailsName.value = folder.name;
  } finally {
    isSaving.value = false;
  }
};

const saveDetailsIcon = async (icon: ChatFolderIcon): Promise<void> => {
  const folder = detailsFolder.value;
  if (!folder || isSaving.value) return;
  if ((folder.icon || 'folder') === icon) {
    isIconPickerOpen.value = false;
    return;
  }

  isSaving.value = true;
  try {
    await updateFolder(folder.id, { icon });
    isIconPickerOpen.value = false;
  } catch (error) {
    showNotification({
      title: 'Не удалось изменить иконку',
      description: error
    });
  } finally {
    isSaving.value = false;
  }
};

const requestDelete = (folderId: string): void => {
  if (props.folders.find(folder => folder.id === folderId)?.isSystem) return;

  closeFolderMenu();
  deleteFolderTargetId.value = folderId;
};

const cancelDelete = (): void => {
  if (isSaving.value) return;
  deleteFolderTargetId.value = null;
};

const confirmDelete = async (): Promise<void> => {
  const folderId = deleteFolderTargetId.value;
  if (!folderId || isSaving.value) return;
  isSaving.value = true;
  try {
    await deleteFolder(folderId);
    deleteFolderTargetId.value = null;
    if (detailsFolderId.value === folderId) closeDetails();
  } catch (error) {
    showNotification({ title: 'Не удалось удалить папку', description: error });
  } finally {
    isSaving.value = false;
  }
};
</script>
