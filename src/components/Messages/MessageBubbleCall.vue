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
      :class="messageArticleStyles"
      :data-testid="`${props.dataTestid}-Article`"
    >
      <MessageBubbleTail
        v-if="!props.continuesWithNext"
        :is-me-sender="props.isMeSender"
      />
      <MessageReferenceBlock
        :forward-user="showExternalForward ? undefined : props.forwardUser"
        :reply-message="props.replyMessage"
        :is-me-sender="props.isMeSender"
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
import { computed } from 'vue';
import type { IMessageBubbleProps } from './interface/interface';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageBubbleTail from './MessageBubbleTail.vue';
import MessageCallTypeIcon from './MessageCallTypeIcon.vue';
import MessageCallInfoIcon from './MessageCallInfoIcon.vue';
import { parseCallMessage } from '../../utils/parseCallMessage';

const props = defineProps<IMessageBubbleProps>();

defineEmits(['navigate-message']);

const route = useUrlWatcher();
const isDialogRoute = computed(() => route.value.type === RouteTypes.DIALOGS);

const callMessage = computed(() =>
  parseCallMessage(props.message || '', {
    messageEx: props.messageEx,
    isMeSender: props.isMeSender,
    authUserId: props.authUserId
  })
);
const showExternalForward = computed(
  () => !isDialogRoute.value && Boolean(props.forwardUser)
);

const messageArticleStyles = computed(() => [
  'message__article',
  'message__article--call',
  {
    'message__no-author': props.isMeSender
  }
]);
</script>
