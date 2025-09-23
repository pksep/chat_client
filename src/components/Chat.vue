<template>
  <section class="chat">
    <MessageBubble
      v-if="!nothing"
      class="message__bubble"
      message="How are you?"
      time="12:10"
    />
    <MessageBubble
      v-if="!nothing"
      class="message__bubble message__other"
      message="I'm doing great, thanks for asking!"
      time="12:11"
    />
    <div v-else class="chat__nothing">
      <p class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
    </div>
  </section>
</template>

<script lang="ts" setup>
import MessageBubble from './Messages/MessageBubble.vue';

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
  align-content: start;
  height: 100%;
  gap: 25px;
  padding: 15px;
}

.message__other {
  flex-direction: row-reverse;
  --background-color: var(--blue1);
  --message-text-color: var(--white);
  --message-time-color: var(--white);
}
</style>
