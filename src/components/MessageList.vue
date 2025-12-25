<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="props.chapter === 'ai'"
    :data-testid="`${props.dataTestid}-MessageList-AIMessagesWrapper`"
  >
    <div
      class="chat__message-bubble"
      :data-testid="`${props.dataTestid}-MessageList-AIMessagesContainer`"
    >
      <template v-for="(message, index) in state.aiMessages" :key="index">
        <div
          v-if="isNewDate(index, true)"
          class="top-element"
          :data-divider="
            isNewDate(index, true) ? formatDay(message.timestamp) : undefined
          "
        >
          <div
            class="date-divider"
            :data-testid="`${props.dataTestid}-MessageList-DateDividerAI${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-DateLabelAI${index + 1}`"
              >{{ formatDay(message.timestamp) }}</span
            >
          </div>
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

  <div
    class="chat__message-wrapper"
    v-if="state.messages.length && props.chapter !== 'ai'"
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
          :is-read="
            props.user.id === message.sendID
              ? message.isReadByPeer
              : message.isRead
          "
          :message-status="message.status"
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
      !state.aiMessages.length &&
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
import { useMastra, generateChatId } from '../services/useMastra';
import { removeMessageLoading } from '../services/useChatDb';
import { subscribeToMessageChanges } from '../services/useOpenIM';
import {
  getMessagesByConversationId,
  getMessagesWithLoadingStatus,
  sendMessageIM,
  getIsWebsocketConnecting,
  isRecentlyReconnected
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
  chatId: null as string | null,
  hasMoreMessages: true,
  isLoadingMore: false,
  aiMessages: [] as AIMessage[]
});

const isLoadingInitialMessages = ref(false);

const updateMessages = () => {
  if (props.contact?.conversationId) {
    const newMessages = getMessagesWithLoadingStatus(
      props.contact.conversationId
    );

    // Create a new array reference to ensure Vue reactivity
    state.messages = [...newMessages];
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
};

let isScrollLoading = false;
const handleScroll = (): void => {
  const el = chatWrapperRef.value;
  if (!el) return;

  const { scrollTop, scrollHeight, clientHeight } = el;

  const maxScroll = scrollHeight - clientHeight;
  const distanceFromBottom = scrollTop;
  const distanceFromTop = maxScroll + scrollTop;

  scrollState.shouldAutoScroll = distanceFromBottom < 50;
  scrollState.isUserScrolling = distanceFromBottom >= 50;

  if (scrollState.isInitialLoad) {
    scrollState.isInitialLoad = false;
  }

  if (
    distanceFromTop < 100 &&
    !isScrollLoading &&
    props.contact?.conversationId
  ) {
    isScrollLoading = true;

    if (!getIsWebsocketConnecting()) {
      getMessagesByConversationId(
        props.contact.conversationId,
        state.messages[0]?.clientMsgID
      )
        .then(() => {
          updateMessages();
        })
        .finally(() => {
          isScrollLoading = false;
        });
    } else {
      updateMessages();
      isScrollLoading = false;
    }
  }
};

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
      state.messages = [];
      state.hasMoreMessages = true;
      state.isLoadingMore = false;
      isLoadingInitialMessages.value = true;

      try {
        if (!getIsWebsocketConnecting()) {
          await getMessagesByConversationId(newConversationId, '');
        }
      } catch (error) {
        console.error('Failed to load messages for new conversation:', error);
      } finally {
        updateMessages();
        isLoadingInitialMessages.value = false;
      }

      await nextTick();
      requestAnimationFrame(() => {
        if (chatWrapperRef?.value) {
          scrollToBottom(false);
          scrollState.shouldAutoScroll = true;
          scrollState.isInitialLoad = true;
        }
      });
    }
  },
  { immediate: true }
);

const previousConnectingState = ref(getIsWebsocketConnecting());

watch(
  () => getIsWebsocketConnecting(),
  currentConnectingState => {
    previousConnectingState.value = currentConnectingState;

    // Update messages whenever connection state changes
    updateMessages();

    // When connection is restored, fetch fresh messages
    if (previousConnectingState.value && !currentConnectingState) {
      setTimeout(async () => {
        if (props.contact?.conversationId) {
          try {
            await getMessagesByConversationId(props.contact.conversationId, '');
            updateMessages();
          } catch (error) {
            console.error(
              'Failed to reload messages after connection restored:',
              error
            );
          }
        }
      }, 300);
    }
  }
);

const lastReconnectedState = ref(false);

const handleReconnection = async () => {
  if (props.contact?.conversationId) {
    try {
      await getMessagesByConversationId(props.contact.conversationId, '');
      updateMessages();
    } catch (error) {
      console.error('Failed to reload messages after reconnection:', error);
    }
  }
};

watch(
  () => isRecentlyReconnected(),
  isReconnected => {
    if (isReconnected && !lastReconnectedState.value) {
      setTimeout(() => {
        handleReconnection();
      }, 500);
    }
    lastReconnectedState.value = isReconnected;
  }
);

const mastraResult = ref(null as any);

const initializeMastra = () => {
  if (state.chatId && props.baseUrl) {
    const result = useMastra({
      agentId: 'generalAgent',
      chatId: state.chatId,
      baseUrl: props.baseUrl
    });
    mastraResult.value = result;
    state.aiMessages = result.messages.value;
  } else {
    const result = useMastra(false);
    mastraResult.value = result;
    state.aiMessages = result.messages.value;
  }
};

initializeMastra();

watch([() => state.chatId, () => props.baseUrl], () => {
  initializeMastra();
});

watch(
  () => mastraResult.value?.messages?.value,
  newMessages => {
    if (newMessages) {
      state.aiMessages = newMessages;
    }
  },
  { deep: true }
);

let unsubscribeFromMessageChanges: (() => void) | null = null;

onMounted(async () => {
  if (!state.chatId) {
    state.chatId = generateChatId();
  }

  // Set up message subscription first to catch any messages that arrive during initialization
  unsubscribeFromMessageChanges = subscribeToMessageChanges(
    async (newMessageConversationId?: string) => {
      // Add a small delay to ensure the database has been updated with new messages
      await new Promise(resolve => setTimeout(resolve, 50));

      // If the new message is for the current conversation, fetch fresh messages and update the UI
      if (newMessageConversationId === props.contact?.conversationId) {
        // Only fetch fresh messages if not currently loading
        if (!getIsWebsocketConnecting()) {
          await getMessagesByConversationId(newMessageConversationId, '');
        }
        updateMessages();

        // Scroll to bottom to show new messages
        await nextTick();
        requestAnimationFrame(() => {
          if (chatWrapperRef?.value && scrollState.shouldAutoScroll) {
            scrollToBottom(true);
          }
        });
      }
    }
  );

  if (props.contact?.conversationId) {
    state.messages = [];
    state.hasMoreMessages = true;
    state.isLoadingMore = false;
    isLoadingInitialMessages.value = true;

    try {
      if (!getIsWebsocketConnecting()) {
        await getMessagesByConversationId(props.contact.conversationId, '');
      }
    } catch (error) {
      console.error('Failed to load initial messages:', error);
    } finally {
      updateMessages();
      isLoadingInitialMessages.value = false;
    }

    await nextTick();
    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollState.shouldAutoScroll = true;
        scrollState.isInitialLoad = true;
      }
    });
  }
});

onUnmounted(() => {
  if (unsubscribeFromMessageChanges) {
    unsubscribeFromMessageChanges();
    unsubscribeFromMessageChanges = null;
  }

  if (state.chatId) {
    removeMessageLoading(state.chatId, state.aiMessages.length);
  }
});

const addLocalAIMessage = (text: string) => {
  if (!text.trim()) return;

  const userMessage = {
    role: 'user' as 'user' | 'assistant',
    content: text,
    timestamp: Date.now()
  };

  state.aiMessages = [...state.aiMessages, userMessage];

  const assistantMessage = {
    role: 'assistant' as 'user' | 'assistant',
    content: 'Mastra is currently unavailable. Please try again later.',
    timestamp: Date.now()
  };

  state.aiMessages = [...state.aiMessages, assistantMessage];
};

const clearAiMessages = () => {
  if (mastraResult.value) {
    return mastraResult.value.clearMessages();
  }
};

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

watch(
  () => state.messages.length,
  (newLength, oldLength) => {
    if (props.chapter === 'ai') return;

    if (oldLength === 0 && newLength > 0) {
      if (!getIsWebsocketConnecting()) {
        scrollState.shouldAutoScroll = true;
        scrollToBottom(true);
      }
    }
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

    if (newValue !== 'ai' && props.contact?.conversationId) {
      state.messages = [];
      state.hasMoreMessages = true;
      state.isLoadingMore = false;
      isLoadingInitialMessages.value = true;

      try {
        if (!getIsWebsocketConnecting()) {
          await getMessagesByConversationId(props.contact.conversationId, '');
        }
      } catch (error) {
        console.error('Failed to load messages when changing chapter:', error);
      } finally {
        updateMessages();
        isLoadingInitialMessages.value = false;
      }
    } else if (newValue !== 'ai') {
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

const handleSend = async (): Promise<void> => {
  if (!inputText.value.trim()) return;

  if (props.chapter === 'ai') {
    const text = inputText.value;
    inputText.value = '';

    addLocalAIMessage(text);

    if (mastraResult.value && mastraResult.value.sendMessage) {
      try {
        await mastraResult.value.sendMessage(text, () => {
          requestAnimationFrame(() => scrollToBottom(true));
        });
      } catch (error) {
        console.warn('Mastra failed to send message:', error);
      }
    } else {
      console.warn('Mastra is not available, message added locally only');
      requestAnimationFrame(() => scrollToBottom(true));
    }
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

  updateMessages();
  scrollToBottom(true);
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

      updateMessages();
    } catch (error) {
      console.error('[OpenIM] Failed to send file:', error);
    }
  });
};

const isNewDate = (index: number, isMastra: boolean = false) => {
  if (index === 0) return true;

  if (isMastra) {
    const currentMsg = state.aiMessages[index];
    const prevMsg = state.aiMessages[index - 1];
    const currentDay = formatDay(currentMsg.timestamp);
    const prevDay = formatDay(prevMsg.timestamp);
    return currentDay !== prevDay;
  } else {
    const currentMsg = state.messages[index];
    const prevMsg = state.messages[index - 1];
    const currentDay = formatDay(currentMsg.sendTime);
    const prevDay = formatDay(prevMsg.sendTime);
    return currentDay !== prevDay;
  }
};

const getSystemMessageContent = message => {
  const notification = parseGroupNotification(message);
  return notification || message.textElem?.content || message.showName || '';
};

defineExpose({
  handleClear: clearAiMessages
});
</script>
