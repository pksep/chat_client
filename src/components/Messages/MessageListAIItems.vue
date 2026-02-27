<template>
  <div
    class="chat__message-bubble"
    :data-testid="`${props.dataTestid}-MessageList-AIMessagesContainer`"
  >
    <template v-for="(message, index) in props.messages" :key="index">
      <div
        v-if="isNewDate(index)"
        class="top-element"
        :data-divider="
          isNewDate(index) ? formatDay(new Date(message.timestamp)) : undefined
        "
      >
        <div
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-DateDividerAI${index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-DateLabelAI${index + 1}`"
          >
            {{ formatDay(new Date(message.timestamp)) }}
          </span>
        </div>
      </div>

      <MessageBubble
        :class="messageChat(message.role)"
        :message="message.content || ''"
        :author="message.role"
        :time="formatTime(new Date(message.timestamp))"
        :loader="message.loading"
        :is-me-sender="message.role === 'user'"
        :data-testid="`${props.dataTestid}-MessageList-MessageBubbleAI${index + 1}`"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import MessageBubble from './MessageBubble.vue';
import { formatDay, formatTime } from '../../composables/useTime';
import type { AIMessage } from '../../types/messages';

interface Props {
  dataTestid: string;
  messages: AIMessage[];
}

const props = defineProps<Props>();

const isNewDate = (index: number) => {
  if (index === 0) return true;

  const currentMsg = props.messages[index];
  const prevMsg = props.messages[index - 1];
  const currentDay = formatDay(new Date(currentMsg.timestamp));
  const prevDay = formatDay(new Date(prevMsg.timestamp));
  return currentDay !== prevDay;
};

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];
</script>
