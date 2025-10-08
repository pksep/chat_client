<template>
  <section class="chat">
    <div class="chat__message-bubble" v-if="!nothing">
      <MessageBubble
        class="message__bubble"
        message="How are you?"
        time="12:10"
      />
      <MessageBubble
        class="message__bubble message__other"
        message="I'm doing great, thanks for asking!"
        time="12:11"
      />
    </div>
    <div v-else class="chat__nothing">
      <p class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
    </div>
    <div class="chat__input">
      <ContentEditor />
    </div>
  </section>
</template>

<script lang="ts" setup>
import MessageBubble from './Messages/MessageBubble.vue';
import { ContentEditor } from 'sep-yui';

const nothing = false;
</script>

<style scoped>
.chat__nothing {
  display: grid;
  place-items: center;
}

p.chat__nothing-paragraph {
  font-size: 14px;
  color: var(--text-grey);
}

.chat:not(.chat__nothing) {
  display: grid;
  padding: 15px;
}

.chat {
  --basic-height: calc(100vh - 56px);
  height: var(--basic-height);
  overflow: scroll;
}

.chat__message-bubble {
  display: grid;
  align-content: start;
  gap: 25px;
}

.message__other {
  flex-direction: row-reverse;
  --background-color: var(--blue1);
  --message-text-color: var(--white);
  --message-time-color: var(--white);
  --blockquote-bg-color: #9abdff;
  --blockquote-border-color: var(--white);
}

.chat__input {
  align-self: end;
  max-width: calc(
    100vw - var(--size-left-menu) - 36px - var(--size-right-menu)
  );
  :deep(.editor-content) {
    max-height: calc(var(--basic-height) / 2);
    overflow: scroll;
  }
}
</style>
