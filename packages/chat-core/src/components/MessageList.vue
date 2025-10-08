<template>
  <section class="chat">
    <div v-if="props.chapter === 'ai'" class="chat__message-bubble">
      <MessageBubble
        v-for="(message, index) in aiMessages"
        :key="index"
        :class="[
          'message__bubble',
          { message__other: message.role === 'assistant' }
        ]"
        :message="message.content"
        :time="getTime(index)"
        :loader="loading && index === aiMessages.length - 1"
      />
      {{ aiMessages }}
    </div>
    <div v-else-if="!props.chapter" class="chat__nothing">
      <p class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
    </div>
    <div v-else class="chat__message-bubble">
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
    <div class="chat__input">
      <ContentEditor v-model="inputText" @unmount-send="handleSend" />
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import { ContentEditor } from 'sep-yui';
import { useMastra } from '../services/useMastra';
import type { IMessageListProps } from './interfaces/message-list';

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const inputText = ref('');
const {
  messages: aiMessagesRaw,
  loading,
  sendMessage
} = useMastra('generalAgent');

const aiMessages = computed(() => aiMessagesRaw.value);

const getTime = (index: number) => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const handleSend = async () => {
  if (!inputText.value.trim() || loading.value) return;
  await sendMessage(inputText.value);
  inputText.value = '';
};
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
