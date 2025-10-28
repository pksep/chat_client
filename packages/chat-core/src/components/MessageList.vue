<template>
  <section class="chat">
    <div
      class="chat__message-wrapper"
      ref="chatWrapperRef"
      v-if="props.chapter === 'ai' && aiMessages.length"
    >
      <div class="chat__message-bubble">
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
    </div>
    <div
      class="chat__message-wrapper"
      v-else-if="state.messages.length"
      ref="chatWrapperRef"
    >
      <div class="chat__message-bubble">
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
    </div>
    <div v-else class="chat__nothing">
      <p v-if="!props.chapter" class="chat__nothing-paragraph">
        Выберите, кому хотели бы написать
      </p>
      <p v-else class="chat__nothing-paragraph">Здесь пока ничего нет...</p>
    </div>
    <div class="chat__input" v-if="props.chapter">
      <ContentEditor v-model="inputText" @unmount-send="handleSend" />
    </div>
  </section>
</template>

<script lang="ts" setup>
import { ref, reactive, watch, onMounted, useTemplateRef, nextTick } from 'vue';
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

const chatWrapperRef = useTemplateRef('chatWrapperRef');

const inputText = ref('');

const {
  messages: aiMessages,
  sendMessage,
  clearMessages: clearAiMessages,
  generateChatId
} = useMastra('generalAgent', state.chatId, props.baseUrl);

const { time } = useTime();

const scrollToBottom = () => {
  if (chatWrapperRef?.value) {
    chatWrapperRef.value.scrollTop = chatWrapperRef.value.scrollHeight;
  }
};

watch(
  () => props.chapter,
  (newValue, oldValue) => {
    if (newValue !== oldValue) {
      state.messages = [];
    }
    if (aiMessages.value.length || state.messages.length) {
      nextTick(() => scrollToBottom());
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
    await sendMessage(text, scrollToBottom);
  } else {
    state.messages.push({ role: 'user', content: text });
  }
  scrollToBottom();
};

onMounted(() => {
  if (state.chatId === null) {
    state.chatId = generateChatId();
  }
  if (aiMessages.value.length || state.messages.length) {
    scrollToBottom();
  }
});

defineExpose({
  handleClear
});
</script>
