<template>
  <template v-if="props.chapter === 'ai'">
    <div
      class="chat__message-wrapper"
      ref="chatWrapperRef"
      v-if="aiMessages.length"
      :data-testid="`${props.dataTestid}-MessageList-AIMessagesWrapper`"
    >
      <div
        class="chat__message-bubble"
        :data-testid="`${props.dataTestid}-MessageList-AIMessagesContainer`"
      >
        <template v-for="(message, index) in aiMessages" :key="index">
          <div
            v-if="isNewDate(index, true)"
            class="date-divider"
            :data-testid="`${props.dataTestid}-MessageList-DateDividerAI${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-DateLabelAI${index + 1}`"
              >{{ formatDay(message.timestamp) }}</span
            >
          </div>

          <MessageBubble
            :class="messageChat(message.role)"
            :message="message.content || ''"
            :author="message.role"
            :time="formatTime(new Date(message.timestamp))"
            :loader="message.loading"
            :is-me-sender="message.role === 'user'"
            :data-testid="`${props.dataTestid}-MessageList-MessageBubbleAI${index + 1}`"
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
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <div
      class="chat__message-bubble"
      :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
    >
      <template
        v-for="(message, index) in state.messages"
        :key="message.clientMsgID"
      >
        <div
          v-if="isNewDate(index)"
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${index + 1}`"
            >{{ formatDay(message.sendTime) }}</span
          >
        </div>

        <div
          v-if="message.notificationElem"
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${index + 1}`"
            >{{ parseNotification(message) }}</span
          >
        </div>

        <MessageBubble
          v-else
          :class="
            messageChat(props.user.id === message.sendID ? 'user' : 'assistant')
          "
          :message="message.textElem?.content || ''"
          :media="message.pictureElem?.sourcePicture?.url"
          :file="message.fileElem"
          :is-me-sender="props.user.id === message.sendID"
          :time="formatTime(new Date(message.sendTime))"
          :sender="message.senderNickname"
          :avatar="message.senderFaceUrl"
          :data-testid="`${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`"
        />
      </template>
    </div>
  </div>
  <EmptyChat
    :chapter="props.chapter"
    :data-testid="`${props.dataTestid}-MessageList-EmptyChat`"
    v-if="!state.messages.length && !aiMessages.length"
  />
  <div
    class="chat__input"
    v-if="props.chapter"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
  >
    <ContentEditor
      v-model="inputText"
      active-attach-file
      @unmount-send="handleSend"
      @unmount-attach-file="handleAttachFile"
      :data-testid="`${props.dataTestid}-MessageList-ContentEditor`"
    />
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

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  chapter: null,
  dataTestid: () => 'MessageList'
});

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const inputText = ref('');

const state = reactive({
  messages: computed(() => getSavedMessages(props.contact?.conversionId || '')),
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
        props.contact?.conversionId,
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
      getMessagesByConversationId(props.contact?.conversionId);
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
      markAsRead(props.contact?.conversionId);
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
    if (props.contact?.groupId) {
      // group chat
      await sendMessageIM({
        message: text,
        to: '',
        groupId: props.contact.groupId
      });
    } else {
      // private chat
      await sendMessageIM({
        message: text,
        to: props.contact?.userId || '',
        groupId: ''
      });
    }
  }
  nextTick(() => scrollToBottom());
};

const handleAttachFile = async (files: FileList, onlyMedia: boolean) => {
  if (!files.length) return;

  Array.from(files).forEach(async file => {
    const isGroup = !!props.contact?.groupId;
    await sendMessageIM({
      type: onlyMedia ? 'image' : 'file',
      to: isGroup ? '' : props.contact?.userId || '',
      groupId: isGroup ? props.contact.groupId : '',
      file
    });

    nextTick(() => scrollToBottom());
  });
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

interface MessageWithNotification {
  textElem?: {
    content?: string;
  };
  notification?: string;
  notificationElem?: {
    detail?: string;
  };
}

const parseNotification = (message: MessageWithNotification) => {
  if (message.notificationElem?.detail) {
    try {
      const parsed = JSON.parse(message.notificationElem.detail);
      const notification = parsed.group?.notification || '';
      return notification;
    } catch (error) {
      console.error('Failed to parse notification detail:', error);
      return '';
    }
  }
  return message.textElem?.content || null;
};

onUnmounted(() => {
  removeMessageLoading(state.chatId, state.messages.length);
});

defineExpose({
  handleClear
});
</script>
