<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="props.chapter === 'ai' && aiMessages.length"
  >
    <div class="chat__message-bubble">
      <MessageBubble
        v-for="(message, index) in aiMessages"
        :key="index"
        :class="messageChat(message.role)"
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
        :class="messageChat(message.role)"
        :message="message.content"
        :author="message.role"
        :time="time"
        :loader="message.loading"
      />
    </div>
  </div>
  <EmptyChat v-else :chapter="props.chapter" />
  <div class="chat__input" v-if="props.chapter">
    <ContentEditor v-model="inputText" @unmount-send="handleSend" />
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, watch, onMounted, useTemplateRef, nextTick } from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import EmptyChat from './EmptyChat.vue';
import { ContentEditor } from 'sep-yui';
import { removeMessageLoading, useMastra } from '../services/useMastra';
import type { IMessageListProps } from './interfaces/message-list';
import { useTime } from '../composables/useTime';
import { onUnmounted } from 'vue';

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

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

const scrollToBottom = (): void => {
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

const handleClear = (): void => {
  state.messages = [];
  clearAiMessages();
};

const handleSend = async (): Promise<void> => {
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

onUnmounted(() => {
  removeMessageLoading(state.chatId, state.messages.length);
});

defineExpose({
  handleClear
});
</script>
