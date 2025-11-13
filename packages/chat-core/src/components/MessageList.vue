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
    @scroll="handleScroll"
  >
    <div class="chat__message-bubble">
      <PersonalMessageBubble
        v-for="(message, index) in state.messages"
        :key="index"
        :class="
          messageChat(props.contactId === message.recvID ? 'user' : 'assistant')
        "
        :message="message.textElem.content"
        :is-me-sender="props.contactId === message.recvID"
        :time="message.sendTime"
      />
    </div>
  </div>
  <EmptyChat
    :chapter="props.chapter"
    v-if="!state.messages.length && !aiMessages.length"
  />
  <div class="chat__input" v-if="props.chapter">
    <ContentEditor v-model="inputText" @unmount-send="handleSend" />
  </div>
</template>

<script lang="ts" setup>
import {
  ref,
  reactive,
  watch,
  onMounted,
  useTemplateRef,
  nextTick,
  onUnmounted,
  computed
} from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import EmptyChat from './EmptyChat.vue';
import { ContentEditor } from 'sep-yui';
import { removeMessageLoading, useMastra } from '../services/useMastra';
import {
  getMessagesByConversationId,
  getSavedMessages,
  markAsRead,
  sendMessageIM
} from '../services/useOpenIM';
import type { IMessageListProps } from './interfaces/message-list';
import PersonalMessageBubble from './Messages/PersonalMessageBubble.vue';

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const inputText = ref('');

const state = reactive({
  messages: computed(() => getSavedMessages(props.conversionId || '')),
  chatId: null
});

const {
  messages: aiMessages,
  sendMessage,
  clearMessages: clearAiMessages,
  generateChatId
} = useMastra('generalAgent', state.chatId, props.baseUrl);

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

const scrollToBottom = (): void => {
  if (chatWrapperRef?.value) {
    chatWrapperRef.value.scrollTop = chatWrapperRef.value.scrollHeight;
  }
};

const inBottom = (): boolean => {
  if (chatWrapperRef?.value) {
    const { scrollTop, scrollHeight, clientHeight } = chatWrapperRef.value;
    return scrollTop + clientHeight >= scrollHeight - 20;
  }
  return false;
};

const inTop = (): boolean => {
  if (chatWrapperRef?.value) {
    return chatWrapperRef.value.scrollTop < 20;
  }
  return false;
};

const handleScroll = async (): Promise<void> => {
  if (chatWrapperRef?.value) {
    const scrollHeight = chatWrapperRef.value.scrollHeight;
    if (inTop()) {
      await getMessagesByConversationId(
        props.conversionId,
        state.messages[0]?.clientMsgID
      );
      nextTick(() => {
        chatWrapperRef.value!.scrollTop =
          chatWrapperRef.value!.scrollHeight - scrollHeight;
      });
    }
  }
};

watch(
  () => props.chapter,
  (newValue, oldValue) => {
    if (newValue !== oldValue) {
      getMessagesByConversationId(props.conversionId);
    }
    if (aiMessages.value.length || state.messages.length) {
      nextTick(() => scrollToBottom());
    }
  }
);

watch(
  () => state.messages.length,
  () => {
    if (!state.messages.length) {
      return;
    }

    if (!inTop()) {
      nextTick(() => scrollToBottom());
    }
    const lastMessage = state.messages[state.messages.length - 1];

    if (lastMessage.sendID === props.contactId && inBottom()) {
      markAsRead(props.conversionId);
    }
  }
);

const handleClear = (): void => {
  clearAiMessages();
};

const handleSend = async (): Promise<void> => {
  if (!inputText.value.trim()) return;
  const text = inputText.value;
  inputText.value = '';

  if (props.chapter === 'ai') {
    await sendMessage(text, scrollToBottom);
  } else {
    await sendMessageIM({
      message: text,
      to: props.contactId || '',
      groupId: props.contactId || ''
    });
  }
  nextTick(() => scrollToBottom());
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
