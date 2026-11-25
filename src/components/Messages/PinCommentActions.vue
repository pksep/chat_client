<template>
  <p v-if="error && !editing" class="pin-note-notice" role="alert">
    {{ error }}
  </p>
  <PinCommentCard
    v-for="comment in comments"
    :key="comment.id"
    :comment="comment"
    :outgoing="outgoing"
    :own="comment.authorId === authedUser?.id"
    @edit="openEditor"
    @delete="deleting = $event"
  />
  <Modal
    :open="!!editing"
    width="492px"
    position="center"
    class="pin-note-dialog"
    @close="editing = null"
  >
    <h2>Комментарий к закреплению</h2>
    <textarea
      v-model="text"
      aria-label="Комментарий к закреплению"
      maxlength="4000"
      rows="5"
    />
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="confirm__modal__buttons">
      <Button :type="ButtonTypeEnum.secondary" @click="editing = null"
        >Отмена</Button
      ><Button
        :type="ButtonTypeEnum.primary"
        :disabled="!text.trim() || text.length > 4000"
        @click="save"
        >Сохранить</Button
      >
    </div>
  </Modal>
  <ConfirmModal
    :open="!!deleting"
    title="Удалить комментарий?"
    description="Закреплённое сообщение останется в списке."
    @unmount-close="deleting = null"
    @unmount-confirm="remove"
  />
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
import { authedUser } from '../../composables/useAuth';
import { usePinComments } from '../../services/usePinComments';
import type { PinComment } from '../../services/pin-comments';
import PinCommentCard from './PinCommentCard.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import Modal from '../UI/Modal.vue';
const props = defineProps<{
  topicId: string;
  messageId: string;
  outgoing?: boolean;
}>();
const { pinComments, state } = usePinComments(() => props.topicId, false);
const comments = computed(() => {
  void state.value;
  return pinComments.commentsFor(props.topicId, props.messageId);
});
const editing = ref<PinComment | null>(null);
const deleting = ref<PinComment | null>(null);
const text = ref('');
const error = ref('');
watch(
  () => authedUser.value?.id,
  () => {
    editing.value = null;
    deleting.value = null;
    text.value = '';
    error.value = '';
  }
);
const openEditor = (comment: PinComment) => {
  editing.value = comment;
  text.value = comment.text;
  error.value = '';
};
const save = () => {
  const comment = editing.value;
  if (!comment) return;
  try {
    pinComments.enqueue(props.topicId, {
      commandId: crypto.randomUUID(),
      messageId: props.messageId,
      action: 'EDIT',
      scope: comment.scope,
      commentId: comment.id,
      expectedRevision: comment.revision,
      text: text.value
    });
    editing.value = null;
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};
const remove = () => {
  const comment = deleting.value;
  if (!comment) return;
  try {
    pinComments.enqueue(props.topicId, {
      commandId: crypto.randomUUID(),
      messageId: props.messageId,
      action: 'DELETE',
      scope: comment.scope,
      commentId: comment.id,
      expectedRevision: comment.revision
    });
    deleting.value = null;
  } catch (cause) {
    error.value = (cause as Error).message;
  }
};
</script>
