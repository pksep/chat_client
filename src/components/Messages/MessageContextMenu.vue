<template>
  <ContextMenu
    class="message-context-menu"
    :visible="!!props.isOpen[props.messageId]"
    :position="props.position"
    @unmount-close="handleClosePopover"
    :data-testid="`${props.dataTestid}-MessageBubble-ContextMenu`"
  >
    <EmojiPicker
      ref="reactionRow"
      v-on-click-outside="toggleShowEmojies"
      v-if="showEmojies"
      @select="handleSelectEmoji"
    />
    <template v-else>
      <div
        class="select-reactions"
        ref="reactionRow"
        :class="{ 'select-reactions--flip': flipReactions }"
      >
        <div
          v-for="value in quickReactonList"
          :key="value"
          @click.stop="handleReactMessage(value)"
          class="select-reactions-item"
        >
          {{ value }}
        </div>
        <div>
          <Button
            class="select-reactions-list-button"
            :type="ButtonTypeEnum.primary"
            :size="SizesEnum.little"
            @click="toggleShowEmojies"
          >
            <Icon
              :name="IconNameEnum.plus"
              :data-testid="`${props.dataTestid}-Reaction-PlusIcon`"
            />
          </Button>
        </div>
      </div>

      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleReplyMessage"
        :data-testid="`${props.dataTestid}-MessageBubble-ReplyButton`"
      >
        <ReplyIcon /> Ответить
      </Button>

      <Button
        v-if="props.isMeSender && !!props.message"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleEditMessage"
        :data-testid="`${props.dataTestid}-MessageBubble-EditButton`"
      >
        <EditIcon /> Редактировать
      </Button>

      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handlePinMessage"
        :data-testid="`${props.dataTestid}-MessageBubble-PinButton`"
      >
        <template v-if="!props.isPin"> <PinIcon /> Закрепить </template>
        <template v-else> <UnpinIcon /> Открепить </template>
      </Button>

      <Button
        v-if="props.isMeSender"
        class="red-context-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleOpenModal"
        :data-testid="`${props.dataTestid}-MessageBubble-DeleteButton`"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </template>
  </ContextMenu>

  <!-- DELETE CONFIRM -->
  <ConfirmModal
    :open="deleteModalOpen"
    title="Удалить сообщение"
    description="Вы уверены, что хотите удалить сообщение для всех участников чата?"
    @unmount-close="handleCloseModal"
    @unmount-confirm="handleDeleteMessage"
  />
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  SizesEnum,
  Icon,
  IconNameEnum
} from '@pksep/yui';

import ContextMenu from '../ContactList/ContextMenu.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import EditIcon from '../UI/EditIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';

import { IMessageContextMenu } from './interface/interface';
import { closeActivePopover } from '../../composables/useContextMenu';

import {
  deleteMessageChat,
  setReactionMessage,
  togglePinMessageChat
} from '../../services/useChat';

import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const props = withDefaults(defineProps<IMessageContextMenu>(), {
  dataTestid: 'MessageContextMenu'
});

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id'
]);

const quickReactonList = computed(() => ['♥️', '🔥', '👍', '😂', '👌', '😭']);

const deleteModalOpen = ref(false);
const reactionRow = ref<HTMLElement | null>(null);
const flipReactions = ref(false);
const showEmojies = ref(false);

const checkFlip = async () => {
  const windowWidth = window.innerWidth;
  await nextTick();

  const el = reactionRow.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  flipReactions.value = rect.right > windowWidth;
};

watch(
  () => props.isOpen[props.messageId],
  opened => {
    if (opened) checkFlip();
  }
);

const handleOpenModal = () => {
  deleteModalOpen.value = true;
};

const handleCloseModal = () => {
  deleteModalOpen.value = false;
};

const handleDeleteMessage = async (): Promise<void> => {
  await deleteMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });

  handleCloseModal();
  handleClosePopover();
};

const handleEditMessage = () => {
  emits('unmount-edit-message-id', props.messageId);
  handleClosePopover();
};

const handleReplyMessage = () => {
  emits('unmount-reply-message-id', props.messageId);
  handleClosePopover();
};

const handleReactMessage = (emoji: string) => {
  setReactionMessage({
    messageId: props.messageId,
    emoji,
    topicId: props.topicId
  });
  handleClosePopover();
};

const handlePinMessage = async () => {
  await togglePinMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });

  handleClosePopover();
};

const toggleShowEmojies = () => {
  showEmojies.value = !showEmojies.value;
};

const handleSelectEmoji = (emoji: { i: string }) => {
  handleReactMessage(emoji.i);
};

const handleClosePopover = () => {
  closeActivePopover(props.messageId);
  showEmojies.value = false;
};
</script>
