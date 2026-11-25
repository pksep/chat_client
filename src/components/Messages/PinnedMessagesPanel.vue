<template>
  <section
    ref="panel"
    tabindex="-1"
    class="pinned-list chat-scrollbar"
    aria-label="Закреплённые сообщения"
    data-testid="PinnedList"
    @click.stop
    @pointerdown.stop
    @touchstart.stop
    @touchend.stop
    @contextmenu.prevent
    @keydown.esc.stop="closePinnedMessagesView"
  >
    <div v-if="!messages.length" class="pinned-list__empty" role="status">
      {{ loading ? 'Загрузка закреплений…' : 'Нет закреплённых сообщений' }}
    </div>
    <div v-if="state.error" class="pin-note-notice" role="status">
      {{ state.error }} <button @click="refresh">Повторить</button>
    </div>
    <PinCommentNotices :topic-id="topicId" />
    <template v-for="(message, index) in visibleMessages" :key="message.id">
      <div
        v-if="index === 0 || day(message) !== day(visibleMessages[index - 1])"
        class="date-divider"
      >
        <span>{{ day(message) }}</span>
      </div>
      <div
        class="pinned-list__item"
        :class="{ 'pinned-list__item--outgoing': isOwn(message) }"
        :data-testid="`PinnedList-Item-${message.id}`"
      >
        <MessageBubble
          class="message__bubble"
          :class="{ message__other: isOwn(message) }"
          :message="message.text || ''"
          :message-id="message.id"
          :topic-id="topicId"
          :media="message.media || []"
          :message-ex="message.ex"
          :is-me-sender="isOwn(message)"
          :is-dialog="getSelectedTopic(topicId)?.type !== 'GROUP'"
          :is-pin="true"
          :is-mobile="isMobile"
          :time="time(message)"
          :sender="message.senderUser?.initials"
          :sender-user="message.senderUser"
          :reply-message="message.replyMessage"
          :forward-user="message.forwardUser"
          :reactions="message.reactions"
          :pin-list-mode="true"
          :data-testid="`PinnedList-Message-${message.id}`"
          @unmount-navigate-original="navigate(message)"
          @unmount-navigate-message-id="emit('navigate', $event)"
          @open-sticker-pack="emit('open-sticker-pack', $event)"
        />
        <PinCommentActions
          :topic-id="topicId"
          :message-id="message.id"
          :outgoing="isOwn(message)"
        />
      </div>
    </template>
    <button
      v-if="visibleMessages.length < messages.length"
      class="pinned-list__more"
      @click="limit += 80"
    >
      Показать ещё закрепления
    </button>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { closePinnedMessagesView } from '../../services/pinned-messages-view';
import { authedUser } from '../../composables/useAuth';
import { getSelectedTopic } from '../../composables/useTopics';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import {
  fetchPinnedMessagesForTopic,
  getPinnedMessagesByTopicId
} from '../../services/useMessages';
import { usePinComments } from '../../services/usePinComments';
import type { IMessage } from '../interfaces/interfaces';
import MessageBubble from './MessageBubble.vue';
import PinCommentActions from './PinCommentActions.vue';
import PinCommentNotices from './PinCommentNotices.vue';
const props = defineProps<{ topicId: string }>();
const emit = defineEmits<{
  navigate: [message: IMessage | unknown];
  'open-sticker-pack': [pack: string];
}>();
const { state, pinComments } = usePinComments(() => props.topicId);
const { state: isMobile } = useResizeState(MAX_W_MD);
const loading = ref(false);
const panel = ref<HTMLElement | null>(null);
const limit = ref(80);
const messages = computed(() => {
  void state.value;
  return pinComments
    .projectPins(props.topicId, getPinnedMessagesByTopicId(props.topicId))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    );
});
const visibleMessages = computed(() => messages.value.slice(0, limit.value));
const isOwn = (message: IMessage) =>
  message.senderUserId === authedUser.value?.id;
const day = (message: IMessage) =>
  new Date(message.createdAt).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year:
      new Date(message.createdAt).getFullYear() === new Date().getFullYear()
        ? undefined
        : 'numeric'
  });
const time = (message: IMessage) =>
  new Date(message.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
const navigate = (message: IMessage) =>
  emit('navigate', {
    message,
    allowOptimisticTarget: true,
    shortTransition: true,
    scrollBehavior: 'smooth'
  });
const refresh = async () => {
  loading.value = true;
  await Promise.all([
    fetchPinnedMessagesForTopic(props.topicId),
    pinComments.refresh(props.topicId)
  ]);
  loading.value = false;
};
onMounted(() => {
  panel.value?.focus({ preventScroll: true });
  void refresh();
});
</script>
