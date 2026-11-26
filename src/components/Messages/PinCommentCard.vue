<template>
  <div
    class="pin-note"
    :class="{
      'pin-note--outgoing': outgoing,
      'pin-note--pending': comment.pending
    }"
    :data-testid="`PinComment-${comment.id}`"
    @click.stop="openMobileMenu"
    @dblclick.stop
    @contextmenu.prevent.stop="openMenu"
  >
    <div class="pin-note__card">
      <div class="pin-note__heading">
        <span class="pin-note__author">{{ comment.authorName }}</span>
        <div v-if="own && !comment.pending" class="pin-note__actions">
          <button
            aria-label="Редактировать комментарий"
            @click.stop="emit('edit', comment)"
          >
            <Icon :name="IconNameEnum.editing" />
          </button>
          <button
            aria-label="Удалить комментарий"
            @click.stop="emit('delete', comment)"
          >
            <Icon :name="IconNameEnum.crossLarge" />
          </button>
        </div>
      </div>
      <div
        class="pin-note__body"
        :class="{ 'pin-note__body--multiline': comment.text.includes('\n') }"
      >
        <span class="pin-note__text">{{ comment.text }}</span>
        <time class="pin-note__time" :datetime="comment.updatedAt"
          ><span v-if="comment.pending" aria-label="Ожидает сохранения">◷ </span
          >{{ dateLabel }}</time
        >
      </div>
    </div>
    <Teleport to="body">
      <ContextMenu
        :visible="menu"
        :position="menuPosition"
        data-testid="PinComment-Menu"
        role="menu"
        @unmount-close="menu = false"
      >
        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          role="menuitem"
          @click.stop="
            menu = false;
            emit('edit', comment);
          "
        >
          <EditIcon /> Редактировать комментарий
        </Button>
        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          class="red-context-button"
          role="menuitem"
          @click.stop="
            menu = false;
            emit('delete', comment);
          "
        >
          <Icon :name="IconNameEnum.deleteSmall" /> Удалить комментарий
        </Button>
      </ContextMenu>
    </Teleport>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  SizesEnum,
  Icon,
  IconNameEnum
} from '@pksep/yui';
import ContextMenu from '../ContactList/ContextMenu.vue';
import EditIcon from '../UI/EditIcon.vue';
import type { PinComment } from '../../services/pin-comments';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
const props = defineProps<{
  comment: PinComment;
  outgoing?: boolean;
  own: boolean;
}>();
const emit = defineEmits<{
  edit: [comment: PinComment];
  delete: [comment: PinComment];
}>();
const menu = ref(false);
const menuPosition = ref({ x: 0, y: 0 });
const openMenu = (event: MouseEvent) => {
  if (!props.own || props.comment.pending) return;
  menuPosition.value = { x: event.clientX, y: event.clientY };
  menu.value = true;
};
const { state: isMobile } = useResizeState(MAX_W_MD);
const openMobileMenu = (event: MouseEvent) => {
  if (
    isMobile.value &&
    props.own &&
    !props.comment.pending &&
    window.getSelection()?.isCollapsed !== false
  )
    openMenu(event);
};
const dateLabel = computed(
  () =>
    new Date(props.comment.updatedAt).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long'
    }) +
    ', ' +
    new Date(props.comment.updatedAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    })
);
</script>
