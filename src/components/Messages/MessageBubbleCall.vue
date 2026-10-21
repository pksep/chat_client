<template>
  <div class="message-bubble-stack">
    <MessageReferenceBlock
      v-if="showExternalForward"
      :forward-user="props.forwardUser"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />
    <article
      v-if="callMessage"
      ref="callArticleRef"
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <slot name="quick-reply" />
      <MessageBubbleTail
        v-if="!props.continuesWithNext"
        :is-me-sender="props.isMeSender"
      />
      <MessageReferenceBlock
        v-if="props.replyMessage || (!showExternalForward && props.forwardUser)"
        :forward-user="showExternalForward ? undefined : props.forwardUser"
        :reply-message="props.replyMessage"
        :message-ex="props.messageEx"
        :is-me-sender="props.isMeSender"
        :reference-width="replyReferenceWidth"
        @navigate-message="$emit('navigate-message')"
      />
      <div class="message-call" :data-testid="`${props.dataTestid}-Content`">
        <MessageCallTypeIcon :kind="callMessage.kind" />
        <div class="message-call__main">
          <div
            class="message-call__title"
            :class="`message-call__title--${callMessage.kind}`"
          >
            {{ callMessage.title }}
          </div>
          <div
            v-if="callMessage.duration"
            class="message-call__duration"
            :data-testid="`${props.dataTestid}-CallDuration`"
          >
            {{ callMessage.duration }}
          </div>
        </div>
        <div class="message-call__meta">
          <span :data-testid="`${props.dataTestid}-TimeText`">{{
            props.time
          }}</span>
          <MessageCallInfoIcon />
        </div>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import MessageCallTypeIcon from './MessageCallTypeIcon.vue';
import MessageCallInfoIcon from './MessageCallInfoIcon.vue';
import { parseCallMessage } from '../../utils/parseCallMessage';
import { useReferenceWidth } from './composables/useReferenceWidth';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const callArticleRef = ref<HTMLElement | null>(null);
const hasReplyReference = computed(() => Boolean(props.replyMessage));
const replyReferenceWidth = useReferenceWidth(callArticleRef, {
  freezeAfterFirstMeasure: true,
  enabled: hasReplyReference
});

const callMessage = computed(() =>
  props.parsedCallMessage !== undefined
    ? props.parsedCallMessage
    : parseCallMessage(props.message || '', {
        messageEx: props.messageEx,
        isMeSender: props.isMeSender,
        authUserId: props.authUserId
      })
);
const showExternalForward = computed(
  () => !props.isDialog && Boolean(props.forwardUser)
);

const messageArticleStyles = computed(() => [
  'message__article',
  'message__article--call',
  {
    'message__no-author': props.isMeSender,
    'message__article--call-outgoing': props.isMeSender,
    'message__article--call-incoming': !props.isMeSender
  }
]);
</script>
