<template>
  <div
    class="pin-note"
    :class="{
      'pin-note--outgoing': outgoing,
      'pin-note--pending': comment.pending
    }"
    :data-testid="`PinComment-${comment.id}`"
    @click.stop="openMobileMenu"
    @contextmenu.prevent.stop="menu = own && !comment.pending"
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
      <p class="pin-note__text">{{ comment.text }}</p>
      <time class="pin-note__time" :datetime="comment.updatedAt"
        ><span v-if="comment.pending" aria-label="Ожидает сохранения">◷ </span
        >{{ dateLabel }}</time
      >
    </div>
    <div v-if="menu" class="pin-note__menu" role="menu">
      <button
        role="menuitem"
        @click.stop="
          menu = false;
          emit('edit', comment);
        "
      >
        Редактировать комментарий
      </button>
      <button
        role="menuitem"
        @click.stop="
          menu = false;
          emit('delete', comment);
        "
      >
        Удалить комментарий
      </button>
      <button role="menuitem" @click.stop="menu = false">Отмена</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
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
const { state: isMobile } = useResizeState(MAX_W_MD);
const openMobileMenu = () => {
  if (
    isMobile.value &&
    props.own &&
    !props.comment.pending &&
    window.getSelection()?.isCollapsed !== false
  )
    menu.value = !menu.value;
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
