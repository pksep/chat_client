<template>
  <div class="message">
    <YAvatar class="message__avatar" v-if="author" />
    <article
      :class="[
        'message__article',
        {
          'message__no-author': !author
        }
      ]"
    >
      <div class="message-content">{{ message }}</div>
      <div class="message-time">
        <YIcon v-if="read" name="read" />
        {{ time }}
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { IMessageBubbleProps } from './interface/interface';

defineProps<IMessageBubbleProps>();

const read = false;
const author = true;
</script>

<style scoped>
.message {
  display: flex;
  gap: 10px;
}

.user__avatar.message__avatar {
  line-height: 35px;
  padding-inline: 11.5px;
  --background-color: var(--green2);
}

.message__article {
  display: grid;
  gap: 4px;
  width: max-content;
  padding: 8px 16px;
  background-color: var(--background-color, var(--white));
  border-radius: 12px;
  align-self: start;
}

.message-content {
  font-size: 14px;
  color: var(--message-text-color, var(--text-black));
}

.message-time {
  display: flex;
  gap: 2px;
  font-size: 10px;
  color: var(--message-time-color, var(--text-grey));
  align-items: center;
  justify-self: end;
  & svg.icon-yui-kit {
    font-size: 16px;
  }
}

.message__no-author {
  margin-left: 30px;
  margin-right: 30px;
}
</style>
