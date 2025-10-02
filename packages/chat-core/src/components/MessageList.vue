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
    <ContentEditor class="chat__input" />
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
  height: 100%;
  padding: 15px;
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
  --blockquoute-bg-color: #9abdff;
  --blockquoute-border-color: var(--white);
}

.chat__input {
  align-self: end;
}
</style>
