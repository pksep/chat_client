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
    v-if="state.messages.length"
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
          class="top-element"
          v-if="
            isNewDate(index) ||
            message.isSystemMessage ||
            message.notificationElem
          "
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
            class="system-message"
            :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${index + 1}`"
              class="system-message-text"
            >
              {{ getSystemMessageContent(message) }}
            </span>
          </div>
        </div>

        <MessageBubble
          v-if="!(message.isSystemMessage || message.notificationElem)"
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
          :is-read="message.isRead"
          :message-status="message.status"
          :loader="message.loading"
          :data-testid="`${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`"
        />
      </template>
    </div>
  </div>
  <EmptyChat
    :chapter="props.chapter"
    :data-testid="`${props.dataTestid}-MessageList-EmptyChat`"
    v-if="
      !state.messages.length &&
      !aiMessages.length &&
      !getIsWebsocketConnecting()
    "
  />
  <div
    class="chat__input"
    v-if="props.chapter && isEnableSend"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
  >
    <ContentEditor
      v-model="inputText"
      active-attach-file
      send-on-enter
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
  onMounted,
  computed
} from 'vue';
import MessageBubble from './Messages/MessageBubble.vue';
import EmptyChat from './EmptyChat.vue';
import { ContentEditor } from '@pksep/yui';
import { useMastra } from '../services/useMastra';
import { removeMessageLoading } from '../services/useChatDb';
import {
  getMessagesByConversationId,
  getMessagesWithLoadingStatus,
  markAsRead,
  sendMessageIM,
  getIsWebsocketConnecting
} from '../services/useOpenIM';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';
import {
  OpenIMNotificationType,
  parseGroupNotification
} from '../utils/systemMessages';
import type { OpenIMMessage, AIMessage } from '../types/messages';
import { authedUser } from '../composables/useAuth';

interface OpenIMMessageWithLoading extends OpenIMMessage {
  loading?: boolean;
}

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
  messages: [] as OpenIMMessageWithLoading[],
  chatId: null as string | null
});

const updateMessages = () => {
  if (props.contact?.conversationId) {
    state.messages = [
      ...getMessagesWithLoadingStatus(props.contact.conversationId)
    ];
  } else {
    state.messages = [];
  }
};

const scrollState = reactive({
  isUserScrolling: false,
  previousScrollTop: 0,
  shouldAutoScroll: true,
  isInitialLoad: true
});

const scrollToBottom = (smooth: boolean = false): void => {
  if (!chatWrapperRef?.value || !scrollState.shouldAutoScroll) return;

  // Ensure DOM is updated before scrolling
  nextTick().then(() => {
    requestAnimationFrame(() => {
      if (chatWrapperRef.value) {
        if (smooth) {
          chatWrapperRef.value.scrollTo({
            top: chatWrapperRef.value.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          chatWrapperRef.value.scrollTop = chatWrapperRef.value.scrollHeight;
        }
      }
    });
  });
};

const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
) => {
  let inThrottle: boolean;
  return function (this: any) {
    const args = arguments;
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => func.apply(null, args), delay);
  };
};

let isScrollLoading = false;

const handleScroll = throttle((): void => {
  if (!chatWrapperRef?.value) return;

  const { scrollTop, scrollHeight, clientHeight } = chatWrapperRef.value;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

  scrollState.shouldAutoScroll = distanceFromBottom < 100;
  scrollState.isUserScrolling = distanceFromBottom >= 100;
  scrollState.previousScrollTop = scrollTop;

  if (scrollState.isInitialLoad) {
    scrollState.isInitialLoad = false;
  }

  if (scrollTop < 20 && !isScrollLoading && props.contact?.conversationId) {
    isScrollLoading = true;

    // Try to load more messages from the service if connected
    if (!getIsWebsocketConnecting()) {
      getMessagesByConversationId(
        props.contact.conversationId,
        state.messages[0]?.clientMsgID
      )
        .then(() => {
          updateMessages(); // Update to reflect any changes
        })
        .finally(() => {
          isScrollLoading = false;
        });
    } else {
      // Service is disconnected, but still update to show cached messages with loading status
      updateMessages();
      isScrollLoading = false;
    }
  }
}, 100);

const isEnableSend = computed(() => {
  try {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage.contentType === OpenIMNotificationType.GroupDeleted) {
      return false;
    }
    const detail = JSON.parse(lastMessage.notificationElem.detail);
    return detail.quitUser.userID !== authedUser.value.userID;
  } catch (e) {
    return true;
  }
});

watch(
  () => props.contact?.conversationId,
  async (newConversationId, oldConversationId) => {
    if (newConversationId && newConversationId !== oldConversationId) {
      // Reset messages when changing conversations
      state.messages = [];
      // Load messages for the new conversation
      if (!getIsWebsocketConnecting()) {
        await getMessagesByConversationId(newConversationId, '');
      }
      updateMessages();

      await nextTick();
      requestAnimationFrame(() => {
        if (chatWrapperRef?.value) {
          scrollToBottom(false); // Direct scroll when changing conversations
          scrollState.shouldAutoScroll = true;
          scrollState.isInitialLoad = true;
        }
      });
    }
  },
  { immediate: true }
);

// Watch for changes in connection status to update message loading status
watch(
  () => getIsWebsocketConnecting(),
  () => {
    // Update messages when connection status changes, to show/hide loading indicators
    updateMessages();
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

const handleNewMessages = debounce(
  async (newLength: number, oldLength: number) => {
    if (props.chapter === 'ai' || !state.messages.length) return;

    await nextTick();

    if (oldLength === 0 && newLength > 0) {
      if (!getIsWebsocketConnecting()) {
        requestAnimationFrame(() => {
          scrollState.shouldAutoScroll = true;
          scrollToBottom(true);
        });
      }
    } else if (scrollState.shouldAutoScroll && !getIsWebsocketConnecting()) {
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    }
  },
  50
);

watch(
  () => state.messages.length,
  (newLength, oldLength) => {
    handleNewMessages(newLength, oldLength);
  },
  { immediate: true }
);

watch(
  () => chatWrapperRef?.value?.scrollTop,
  newScrollTop => {
    if (!chatWrapperRef?.value || scrollState.isInitialLoad) return;

    const distanceFromBottom =
      chatWrapperRef.value.scrollHeight -
      chatWrapperRef.value.clientHeight -
      newScrollTop;

    scrollState.shouldAutoScroll = distanceFromBottom < 100;
    scrollState.isUserScrolling = distanceFromBottom >= 100;
  }
);

watch(
  () => props.chapter,
  async (newValue, oldValue) => {
    if (newValue === oldValue) return;

    if (chatWrapperRef?.value) {
      scrollState.previousScrollTop = chatWrapperRef.value.scrollTop;
    }

    // Only load messages if we're not in AI chat mode and have a contact
    if (props.chapter !== 'ai' && props.contact?.conversationId) {
      state.messages = [];
      if (!getIsWebsocketConnecting()) {
        await getMessagesByConversationId(props.contact.conversationId, '');
      }
      updateMessages();
    } else {
      state.messages = [];
    }

    await nextTick();

    scrollState.isInitialLoad = true;
    scrollState.shouldAutoScroll = true;
    scrollState.isUserScrolling = false;

    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollToBottom(false);
        scrollState.isInitialLoad = false;
      }
    });
  },
  { immediate: true }
);

const handleClear = (): void => {
  clearAiMessages();
};

const handleSend = async (): Promise<void> => {
  if (!inputText.value.trim()) return;

  if (props.chapter === 'ai') {
    const text = inputText.value;
    inputText.value = '';
    await sendMessage(text, () => {
      requestAnimationFrame(() => scrollToBottom(true));
    });
    return;
  }

  if (!props.contact) {
    console.error('[OpenIM] Cannot send message: no contact provided');
    return;
  }

  let resolvedUserId = props.contact.userId;
  let resolvedGroupId = props.contact.groupId;

  if (!resolvedUserId && !resolvedGroupId && props.contact.conversationId) {
    if (props.contact.conversationId.startsWith('si_')) {
      const parts = props.contact.conversationId.substring(3).split('_');
      if (parts.length === 2) {
        const [smallerId, largerId] = parts;
        if (props.user?.id) {
          resolvedUserId = smallerId === props.user.id ? largerId : smallerId;
        } else {
          resolvedUserId = largerId;
        }
      }
    } else if (props.contact.conversationId.startsWith('sg_')) {
      resolvedGroupId = props.contact.conversationId.substring(3);
    }
  }

  if (!resolvedUserId && !resolvedGroupId) {
    console.error(
      '[OpenIM] Cannot send message: no valid recipient (userId or groupId) available'
    );
    return;
  }

  const text = inputText.value;
  inputText.value = '';

  try {
    if (resolvedGroupId) {
      await sendMessageIM({
        message: text,
        to: '',
        groupId: resolvedGroupId
      });
    } else if (resolvedUserId) {
      await sendMessageIM({
        message: text,
        to: resolvedUserId,
        groupId: ''
      });
    }
  } catch (error) {
    console.error('[OpenIM] Failed to send message:', error);
  }

  // Update messages to show the sent message in UI
  updateMessages();

  setTimeout(() => {
    scrollToBottom(true);
  }, 10);
};

const handleAttachFile = async (files: FileList, onlyMedia: boolean) => {
  if (!files.length) return;

  if (!props.contact) {
    console.error('[OpenIM] Cannot send message: no contact provided');
    return;
  }

  let resolvedUserId = props.contact.userId;
  let resolvedGroupId = props.contact.groupId;

  if (!resolvedUserId && !resolvedGroupId && props.contact.conversationId) {
    if (props.contact.conversationId.startsWith('si_')) {
      const parts = props.contact.conversationId.substring(3).split('_');
      if (parts.length === 2) {
        const [smallerId, largerId] = parts;
        if (props.user?.id) {
          resolvedUserId = smallerId === props.user.id ? largerId : smallerId;
        } else {
          resolvedUserId = largerId;
        }
      }
    } else if (props.contact.conversationId.startsWith('sg_')) {
      resolvedGroupId = props.contact.conversationId.substring(3);
    }
  }

  if (!resolvedUserId && !resolvedGroupId) {
    console.error(
      '[OpenIM] Cannot send message: no valid recipient (userId or groupId) available'
    );
    return;
  }

  Array.from(files).forEach(async file => {
    try {
      if (resolvedGroupId) {
        await sendMessageIM({
          type: onlyMedia ? 'image' : 'file',
          to: '',
          groupId: resolvedGroupId,
          file
        });
      } else if (resolvedUserId) {
        await sendMessageIM({
          type: onlyMedia ? 'image' : 'file',
          to: resolvedUserId,
          groupId: '',
          file
        });
      }

      // Update messages to show the sent file in UI
      updateMessages();

      setTimeout(() => {
        scrollToBottom(true);
      }, 10);
    } catch (error) {
      console.error('[OpenIM] Failed to send file:', error);
    }
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

onMounted(async () => {
  if (props.contact?.conversationId) {
    state.messages = [];
    if (!getIsWebsocketConnecting()) {
      await getMessagesByConversationId(props.contact.conversationId, '');
    }
    updateMessages();

    await nextTick();
    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollToBottom(false); // Direct scroll to bottom
        scrollState.shouldAutoScroll = true;
        scrollState.isInitialLoad = true;
      }
    });
  }
});

onUnmounted(() => {
  if (state.chatId) {
    removeMessageLoading(state.chatId, aiMessages.value.length);
  }
});

defineExpose({
  handleClear
});
</script>
