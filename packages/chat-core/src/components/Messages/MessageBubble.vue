<template>
  <div class="message">
    <Avatar
      class="message__avatar"
      v-if="author && !props.loader"
      initials="Orange"
    />
    <article
      :class="[
        'message__article',
        {
          'message__no-author': !author
        }
      ]"
    >
      <div class="message-content">
        <blockquote v-if="blockquote" class="message-content__blockquote">
          <div class="message-content__blockquote-container">
            <h5>Ivan Ivanov</h5>
            How are you?
          </div>
        </blockquote>
        <div class="message-content__loading" v-if="props.loader">
          <template v-for="i in generateArray(3)" :key="i">
            <div class="message-content__loading-circle"></div>
          </template>
        </div>
        <template v-else-if="!props.loader">
          {{ props.message }}
        </template>
      </div>
      <div class="message-time" v-if="!props.loader">
        <Icon v-if="read" :name="IconNameEnum.read" />
        {{ props.time }}
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Icon, IconNameEnum } from 'sep-yui';
import type { IMessageBubbleProps } from './interface/interface';

const props = defineProps<IMessageBubbleProps>();

const read = false;
const author = true;
const blockquote = false;

const generateArray = (n: number): number[] => {
  return Array.from({ length: n });
};
</script>

<style scoped>
.message {
  display: flex;
  gap: 10px;
}

.avatar-yui-kit.message__avatar {
  --background-color: var(--green2);
  align-self: start;
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

blockquote.message-content__blockquote {
  padding: 0;
  margin: 0;
  padding-right: 10px;
  background-color: var(--blockquote-bg-color, var(--blue9));
  border-left-color: var(--blockquote-border-color, var(--blue1));
  border-left-width: 4px;
  border-left-style: solid;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
  margin-bottom: 5px;
}

blockquote.message-content__blockquote
  div.message-content__blockquote-container {
  display: grid;
  margin-left: 4px;
  padding-block: 2px;
  & h5 {
    margin: 0;
  }
}
div.message-content__loading {
  display: flex;
  gap: 4px;
  align-content: center;
}

div.message-content__loading-circle {
  background-color: var(--white);
  border-radius: 50%;
  font-size: 8px;
  width: 1em;
  height: 1em;
}
</style>
