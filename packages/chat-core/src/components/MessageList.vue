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
          v-if="message.isSystemMessage || message.notificationElem"
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${index + 1}`"
            class="system-message-text"
          >
            {{ getSystemMessageContent(message) }}
          </span>
        </div>

        <MessageBubble
          v-else
          :class="
            messageChat(props.user.id === message.sendID ? 'user' : 'assistant')
          "
          :message="message.textElem?.content || ''"
          :media="message.pictureElem"
          :file="message.fileElem"
          :is-me-sender="props.user.id === message.sendID"
          :time="formatTime(new Date(message.sendTime))"
          :sender="message.senderNickname"
          :avatar="message.faceURL"
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
  useTemplateRef,
  nextTick,
  onUnmounted,
  computed,
  type ComputedRef
} from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import EmptyChat from './EmptyChat.vue';
import { ContentEditor } from '@pksep/yui';
import { useMastra, generateChatId } from '../services/useMastra';
import { removeMessageLoading } from '../services/useChatDb';
import {
  getMessagesByConversationId,
  getSavedMessages,
  markAsRead,
  sendMessageIM
} from '../services/useOpenIM';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';
import { parseGroupNotification } from '../utils/systemMessages';
import type { OpenIMMessage, AIMessage } from '../types/messages';

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
  messages: computed(() =>
    getSavedMessages(props.contact?.conversationId || '')
  ) as ComputedRef<OpenIMMessage[]>,
  chatId: null as string | null
});

// Set chatId when component is initialized if chapter is 'ai'
if (props.chapter === 'ai' && !state.chatId) {
  state.chatId = generateChatId();
}

// Watch for changes to chapter to handle AI mode properly
watch(
  () => props.chapter,
  newChapter => {
    if (newChapter === 'ai' && !state.chatId) {
      state.chatId = generateChatId();
    }
  }
);

const mastraResult = useMastra(
  props.chapter === 'ai' && state.chatId
    ? {
        agentId: 'generalAgent',
        chatId: state.chatId,
        baseUrl: props.baseUrl
      }
    : false
);

// Create a reactive reference to the messages
const aiMessages = computed<AIMessage[]>(() => {
  if (mastraResult.messages) {
    return mastraResult.messages.value;
  }
  return [];
});

const sendMessage = mastraResult.sendMessage;
const clearAiMessages = mastraResult.clearMessages;

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
        props.contact?.conversationId,
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
      getMessagesByConversationId(props.contact?.conversationId);
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

// Only watch OpenIM messages (not AI messages) to avoid interference
watch(
  () => state.messages.length,
  () => {
    // Skip this logic when in AI mode to avoid interference
    if (props.chapter === 'ai') {
      return;
    }

    if (!state.messages.length || chatWrapperRef.value?.scrollTop > 200) {
      return;
    }

    nextTick(() => scrollToBottom());

    const newMessage = state.messages[state.messages.length - 1];

    if (newMessage.sendID !== props.user.id) {
      markAsRead(props.contact?.conversationId);
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
      await sendMessageIM({
        message: text,
        to: '',
        groupId: props.contact.groupId
      });
    } else {
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

  let current: string, prev: string;

  if (isMastra) {
    const currentMsg = aiMessages.value[index];
    const prevMsg = aiMessages.value[index - 1];
    current = formatDay(currentMsg.timestamp);
    prev = formatDay(prevMsg.timestamp);
  } else {
    const currentMsg = state.messages[index];
    const prevMsg = state.messages[index - 1];
    current = formatDay(currentMsg.sendTime);
    prev = formatDay(prevMsg.sendTime);
  }

  return current !== prev;
};

const getSystemMessageContent = message => {
  const notification = parseGroupNotification(message);
  return notification || message.textElem?.content || message.showName || '';
};

onUnmounted(() => {
  if (state.chatId) {
    removeMessageLoading(state.chatId, aiMessages.value.length);
  }
});

defineExpose({
  handleClear
});
</script>
