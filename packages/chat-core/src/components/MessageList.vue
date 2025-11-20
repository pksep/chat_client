<template>
  <template v-if="props.chapter === 'ai'">
    <div
      class="chat__message-wrapper"
      ref="chatWrapperRef"
      v-if="aiMessages.length"
    >
      <div class="chat__message-bubble">
        <template v-for="(message, index) in aiMessages" :key="index">
          <div v-if="isNewDate(index, true)" class="date-divider">
            <span>{{ formatDay(message.timestamp) }}</span>
          </div>

          <MessageBubble
            :class="messageChat(message.role)"
            :message="message.content || ''"
            :author="message.role"
            :time="formatTime(new Date(message.timestamp))"
            :loader="message.loading"
            :is-me-sender="message.role === 'user'"
          />
        </template>
      </div>
    </div>
  </template>
  <div
    class="chat__message-wrapper"
    v-else-if="state.messages.length"
    ref="chatWrapperRef"
    @scroll="handleScroll"
  >
    <div class="chat__message-bubble">
      <template
        v-for="(message, index) in state.messages"
        :key="message.clientMsgID"
      >
        <div v-if="isNewDate(index)" class="date-divider">
          <span>{{ formatDay(message.sendTime) }}</span>
        </div>

        <MessageBubble
          :class="
            messageChat(props.user.id === message.sendID ? 'user' : 'assistant')
          "
          :message="message.textElem?.content || ''"
          :is-me-sender="props.user.id === message.sendID"
          :time="formatTime(new Date(message.sendTime))"
          :sender="message.senderNickname"
          :avatar="message.senderFaceUrl"
        />
      </template>
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
import { ContentEditor } from '@pksep/yui';
import {
  removeMessageLoading,
  useMastra,
  generateChatId
} from '../services/useMastra';
import {
  getMessagesByConversationId,
  getSavedMessages,
  markAsRead,
  sendMessageIM
} from '../services/useOpenIM';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';

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
  clearMessages: clearAiMessages
} = useMastra(
  props.chapter === 'ai' && {
    agentId: 'generalAgent',
    chatId: state.chatId,
    baseUrl: props.baseUrl
  }
);

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

const scrollToBottom = (): void => {
  if (chatWrapperRef?.value) {
    chatWrapperRef.value.scrollTop = chatWrapperRef.value.scrollHeight;
  }
};

const handleScroll = async (): Promise<void> => {
  if (chatWrapperRef?.value) {
    const scrollHeight = chatWrapperRef.value.scrollHeight;
    if (chatWrapperRef.value?.scrollTop < 20) {
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
    if (
      (aiMessages?.value && aiMessages?.value.length) ||
      state.messages.length
    ) {
      nextTick(() => scrollToBottom());
    }
  },
  { immediate: true }
);

watch(
  () => state.messages.length,
  () => {
    if (!state.messages.length || chatWrapperRef.value?.scrollTop > 200) {
      return;
    }

    nextTick(() => scrollToBottom());

    const newMessage = state.messages[state.messages.length - 1];

    if (newMessage.sendID !== props.user.id) {
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
    if (props.contactId) {
      await sendMessageIM({
        message: text,
        to: props.contactId || '',
        groupId: props.contactId || ''
      });
    } else {
      await sendMessageIM({
        message: text,
        to: '',
        groupId: props.conversionId.slice(3)
      });
    }
  }
  nextTick(() => scrollToBottom());
};

const isNewDate = (index: number, isMastra: boolean = false) => {
  if (index === 0) return true;

  const current = formatDay(
    isMastra
      ? aiMessages.value[index].timestamp
      : state.messages[index].sendTime
  );
  const prev = formatDay(
    isMastra
      ? aiMessages.value[index - 1].timestamp
      : state.messages[index - 1].sendTime
  );

  return current !== prev;
};

onMounted(() => {
  if (state.chatId === null && props.chapter === 'ai') {
    state.chatId = generateChatId();
  }
  if ((aiMessages?.value && aiMessages.value.length) || state.messages.length) {
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
