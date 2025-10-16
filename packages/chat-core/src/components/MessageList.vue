<template>
  <section class="chat">
    <div
      class="chat__message-bubble"
      v-if="props.chapter === 'ai' && aiMessages.length"
    >
      <MessageBubble
        v-for="(message, index) in aiMessages"
        :key="index"
        :class="[
          'message__bubble',
          { message__other: message.role === 'user' }
        ]"
        :message="message.content"
        :author="message.role"
        :time="message.timestamp"
        :loader="message.loading"
      />
    </div>
    <div class="chat__message-bubble" v-else-if="state.messages.length">
      <MessageBubble
        v-for="(message, index) in state.messages"
        :key="index"
        :class="[
          'message__bubble',
          { message__other: message.role === 'user' }
        ]"
        :message="message.content"
        :author="message.role"
        :time="time"
        :loader="message.loading"
      />
    </div>
    <div v-else class="chat__nothing">
      <p class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
    </div>
    <div class="chat__input">
      <ContentEditor v-model="inputText" @unmount-send="handleSend" />
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ref, reactive, watch, onMounted } from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import { ContentEditor } from 'sep-yui';
import { useMastra } from '../services/useMastra';
import type { IMessageListProps } from './interfaces/message-list';
import { useTime } from '../composables/useTime';

const state = reactive({
  messages: [],
  chatId: null
});

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const inputText = ref('');

const {
  messages: aiMessages,
  sendMessage,
  clearMessages: clearAiMessages,
  generateChatId
} = useMastra('generalAgent', state.chatId);

const { time } = useTime();

watch(
  () => props.chapter,
  (newValue, oldValue) => {
    if (newValue !== oldValue) {
      state.messages = [];
    }
  }
);

const handleClear = () => {
  state.messages = [];
  clearAiMessages();
};

const handleSend = async () => {
  if (!inputText.value.trim()) return;
  const text = inputText.value;
  inputText.value = '';
  if (props.chapter === 'ai') {
    await sendMessage(text);
  } else {
    state.messages.push({ role: 'user', content: text });
  }
};

onMounted(() => {
  if (state.chatId === null) {
    state.chatId = generateChatId();
  }
});

defineExpose({
  handleClear
});
</script>

<style scoped>
.chat__nothing {
  display: grid;
  place-items: center;
  height: calc(var(--basic-height) - 140px);
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
  overflow-x: scroll;
  overflow-y: hidden;
  min-height: var(--basic-height);
}

.chat__message-bubble {
  display: grid;
  max-height: calc(var(--basic-height) - 135px);
  overflow-y: scroll;
  overflow-x: hidden;
  align-content: start;
  gap: 25px;
}

.message__bubble {
  text-wrap: balance;
  width: clamp(400px, 100%, 400px);
  justify-self: start;
  &:last-child {
    margin-bottom: 25px;
  }
}

.message__other {
  justify-self: end;
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
    100vw - var(--size-left-menu) - var(--size-right-menu) - 36px
  );

  :deep(.editor-content) {
    max-height: calc(var(--basic-height) / 2);
    overflow: scroll;
  }
}

:deep(.primary-yui-kit.toolbar-button) {
  color: var(--white);
}
</style>
