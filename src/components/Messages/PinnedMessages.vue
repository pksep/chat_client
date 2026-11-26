<template>
  <PinnedMessageBanner
    v-if="currentPinnedMessage"
    :preview-text="pinnedPreviewText"
    :preview-key="pinnedPreviewKey"
    :show-list="true"
    @open-list="openPinnedMessagesView(activeTopicId)"
    @navigate="handleChangeCurrentIndex"
    @request-unpin="handleOpenUnpinModal"
  />
  <PinCommentNotices :topic-id="activeTopicId" />

  <ConfirmModal
    :open="unpinModalOpen"
    title="Открепить сообщение"
    description="Вы уверены, что хотите открепить сообщение?"
    @unmount-close="handleCloseUnpinModal"
    @unmount-confirm="handleConfirmUnpinMessage"
  />
</template>
<script setup lang="ts">
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import {
  editMessageFromLocal,
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  getPinnedMessagesByTopicId,
  prefetchAroundMessageContext,
  unpinLocalMessageForMe
} from '../../services/useMessages';
import { computed, ref, watch } from 'vue';
import { togglePinMessageChat } from '../../services/useChat';
import ConfirmModal from '../UI/ConfirmModal.vue';
import PinnedMessageBanner from './PinnedMessageBanner.vue';
import PinCommentNotices from './PinCommentNotices.vue';
import { openPinnedMessagesView } from '../../services/pinned-messages-view';
import { usePinComments } from '../../services/usePinComments';
import type {
  IMessage,
  IMessageViewportSnapshot
} from '../interfaces/interfaces';

interface Props {
  topicId?: string | null;
  viewportSnapshot?: IMessageViewportSnapshot | null;
  inert?: boolean;
}

const route = useUrlWatcher();
const props = defineProps<Props>();
const activeTopicId = computed(() => props.topicId || route.value.id || '');
const { state: pinCommentState, pinComments } = usePinComments(
  () => activeTopicId.value
);

const getMessageTimestamp = (message?: Pick<IMessage, 'createdAt'>): number => {
  const timestamp = new Date(message?.createdAt || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pinnedMessages = computed(() =>
  (void pinCommentState.value,
  pinComments.projectPins(
    activeTopicId.value,
    getPinnedMessagesByTopicId(activeTopicId.value)
  )).sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  )
);
const lastPinnedMessage = computed(
  () => pinnedMessages.value[pinnedMessages.value.length - 1] || null
);
const isViewportAtLoadedStart = computed(
  () => (props.viewportSnapshot?.firstVisibleIndex ?? 1) <= 0
);

const firstVisibleMessage = computed(() => {
  const firstVisibleMessageId = props.viewportSnapshot?.visibleMessageIds[0];

  if (!firstVisibleMessageId) {
    return null;
  }

  const topicMessages = [
    ...getMessagesByTopicId(activeTopicId.value),
    ...getFullMessagesByTopicId(activeTopicId.value)
  ];

  return (
    topicMessages.find(message => message.id === firstVisibleMessageId) || null
  );
});

const currentPinnedMessage = computed(() => {
  if (pinnedMessages.value.length === 0) {
    return null;
  }

  const firstVisibleTimestamp = getMessageTimestamp(firstVisibleMessage.value);

  if (!firstVisibleTimestamp || isViewportAtLoadedStart.value) {
    return lastPinnedMessage.value;
  }

  const previousPinnedMessages = pinnedMessages.value.filter(
    message => getMessageTimestamp(message) < firstVisibleTimestamp
  );

  return (
    previousPinnedMessages[previousPinnedMessages.length - 1] ||
    lastPinnedMessage.value
  );
});

const pinnedPreviewText = computed(() =>
  stripHtml(currentPinnedMessage.value?.text || 'Вложение')
);

watch(
  () => currentPinnedMessage.value?.id,
  () => {
    const message = currentPinnedMessage.value;
    if (message) void prefetchAroundMessageContext(message.id, message.topicId);
  },
  { immediate: true }
);
const pinnedPreviewKey = computed(
  () =>
    `${activeTopicId.value || 'no-topic'}:${currentPinnedMessage.value?.id || 'no-message'}:${pinnedPreviewText.value}`
);

const unpinModalOpen = ref(false);

const emits = defineEmits(['unmount-set-selected-message']);

const handleChangeCurrentIndex = () => {
  if (!currentPinnedMessage.value) {
    return;
  }

  emits('unmount-set-selected-message', {
    message: currentPinnedMessage.value,
    allowOptimisticTarget: true,
    shortTransition: true,
    scrollBehavior: 'smooth'
  });
};

const handleOpenUnpinModal = () => {
  unpinModalOpen.value = true;
};

const handleCloseUnpinModal = () => {
  unpinModalOpen.value = false;
};

const handleConfirmUnpinMessage = async () => {
  const message = currentPinnedMessage.value;
  if (message && pinComments.pending(activeTopicId.value, message.id)) return;
  if (!message) {
    handleCloseUnpinModal();
    return;
  }

  const topicId = activeTopicId.value;

  if (!topicId) {
    handleCloseUnpinModal();
    return;
  }

  handleCloseUnpinModal();

  if (!message.isPinnedOnlyMe) {
    editMessageFromLocal(topicId, {
      ...message,
      isPin: false
    });

    await togglePinMessageChat({
      topicId,
      messageId: message.id,
      scope: 'ALL'
    });
  } else {
    unpinLocalMessageForMe(topicId, message.id);
    await togglePinMessageChat({
      topicId,
      messageId: message.id,
      scope: 'SELF'
    });
  }
};
</script>
