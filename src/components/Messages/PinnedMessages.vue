<template>
  <PinnedMessageBanner
    v-if="currentPinnedMessage"
    :preview-text="pinnedPreviewText"
    :preview-key="pinnedPreviewKey"
    @navigate="handleChangeCurrentIndex"
    @request-unpin="handleOpenUnpinModal"
  />

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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { togglePinMessageChat } from '../../services/useChat';
import ConfirmModal from '../UI/ConfirmModal.vue';
import PinnedMessageBanner from './PinnedMessageBanner.vue';
import type {
  IMessage,
  IMessageViewportSnapshot
} from '../interfaces/interfaces';

interface Props {
  topicId?: string | null;
  viewportSnapshot?: IMessageViewportSnapshot | null;
}

const route = useUrlWatcher();
const props = defineProps<Props>();
const activeTopicId = computed(() => props.topicId || route.value.id || '');

const getMessageTimestamp = (message?: Pick<IMessage, 'createdAt'>): number => {
  const timestamp = new Date(message?.createdAt || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pinnedMessages = computed(() =>
  [...getPinnedMessagesByTopicId(activeTopicId.value)].sort(
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
const pinnedPreviewKey = computed(
  () =>
    `${activeTopicId.value || 'no-topic'}:${currentPinnedMessage.value?.id || 'no-message'}:${pinnedPreviewText.value}`
);

const unpinModalOpen = ref(false);
const prefetchedPinnedContextKeys = new Set<string>();
let pinnedContextPrefetchTimerId: ReturnType<typeof setTimeout> | null = null;

const emits = defineEmits(['unmount-set-selected-message']);

const handleChangeCurrentIndex = () => {
  if (!currentPinnedMessage.value) {
    return;
  }

  emits('unmount-set-selected-message', {
    message: currentPinnedMessage.value,
    allowOptimisticTarget: true,
    scrollBehavior: 'auto'
  });
};

const handleOpenUnpinModal = () => {
  unpinModalOpen.value = true;
};

const handleCloseUnpinModal = () => {
  unpinModalOpen.value = false;
};

const handleConfirmUnpinMessage = async () => {
  if (!currentPinnedMessage.value) {
    handleCloseUnpinModal();
    return;
  }

  const topicId = activeTopicId.value;

  if (!topicId) {
    handleCloseUnpinModal();
    return;
  }

  if (!currentPinnedMessage.value.isPinnedOnlyMe) {
    editMessageFromLocal(topicId, {
      ...currentPinnedMessage.value,
      isPin: false
    });

    await togglePinMessageChat({
      topicId,
      messageId: currentPinnedMessage.value.id,
      scope: 'ALL'
    });
  } else {
    unpinLocalMessageForMe(topicId, currentPinnedMessage.value.id);
    await togglePinMessageChat({
      topicId,
      messageId: currentPinnedMessage.value.id,
      scope: 'SELF'
    });
  }

  handleCloseUnpinModal();
};

watch(
  () => ({
    topicId: activeTopicId.value,
    messageId: currentPinnedMessage.value?.id || ''
  }),
  ({ topicId, messageId }) => {
    if (pinnedContextPrefetchTimerId) {
      clearTimeout(pinnedContextPrefetchTimerId);
      pinnedContextPrefetchTimerId = null;
    }

    if (!topicId || !messageId) {
      return;
    }

    const prefetchKey = `${topicId}:${messageId}`;

    if (prefetchedPinnedContextKeys.has(prefetchKey)) {
      return;
    }

    pinnedContextPrefetchTimerId = setTimeout(() => {
      pinnedContextPrefetchTimerId = null;
      prefetchedPinnedContextKeys.add(prefetchKey);
      void prefetchAroundMessageContext(messageId, topicId);
    }, 250);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (pinnedContextPrefetchTimerId) {
    clearTimeout(pinnedContextPrefetchTimerId);
    pinnedContextPrefetchTimerId = null;
  }
});
</script>
