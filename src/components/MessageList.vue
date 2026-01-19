<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="isAiRoute"
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
    v-if="state.messages.length && !isAiRoute"
    ref="chatWrapperRef"
    @scroll="handleScroll"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <div
      class="chat__message-bubble"
      :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
    >
      <template v-for="(message, index) in state.messages" :key="message.id">
        <div
          class="top-element"
          v-if="isNewDate(index) || message.isSystemMessage"
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
            v-if="message.isSystemMessage"
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
          v-if="!message.isSystemMessage"
          :class="
            messageChat(
              props.user.id === message.senderUserId ? 'user' : 'assistant'
            )
          "
          :message="message.text || ''"
          :media="getMessageMedia(message)"
          :file="getMessageFile(message)"
          :is-me-sender="props.user.id === message.senderUserId"
          :time="formatTime(new Date(message.sendTime))"
          :sender="message.senderNickname || ''"
          :avatar="message.faceURL"
          :is-read="
            props.user.id === message.senderUserId
              ? message.status === MessageStatus.Read
              : message.status === MessageStatus.Read
          "
          :message-status="message.status"
          :data-testid="`${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`"
        />
      </template>
    </div>
  </div>
  <EmptyChat
    :chapter="route.type"
    :data-testid="`${props.dataTestid}-MessageList-EmptyChat`"
    v-if="
      !state.messages.length &&
      !state.aiMessages.length &&
      !getIsWebsocketConnecting() &&
      !isLoadingInitialMessages
    "
  />
  <Loading
    v-if="isLoadingInitialMessages"
    message="Загрузка сообщений..."
    :dataTestid="`${props.dataTestid}-MessageList-Loading`"
  />
  <div
    class="chat__input"
    v-if="!isDefaultRoute && route.id === null"
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
import Loading from './Loading.vue';
import { ContentEditor } from '@pksep/yui';
import { useMastra, generateChatId } from '../services/useMastra';
import { removeMessageLoading } from '../services/useChatDb';
import { subscribeToMessageChanges } from '../services/useChat';
import {
  fetchMessagesForTopic,
  getMessagesWithLoadingStatus,
  sendMessageChat,
  getIsWebsocketConnecting,
  getIsRecentlyReconnected
} from '../services/useChat';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';
import type { ChatMessage, AIMessage } from '../types/messages';
import { MediaType } from '@pksep/zod-shared-chat';
import { MessageStatus } from '../services/useChatSDK/types';
import { useUrlWatcher } from '../composables/navigation';
import { RouteTypes } from '../composables/navigation/useUrlRouting';

interface ChatMessageWithLoading extends ChatMessage {
  loading?: boolean;
}

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  dataTestid: () => 'MessageList'
});

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const inputText = ref('');
const route = useUrlWatcher();

const isAiRoute = computed(() => route.value?.type === RouteTypes.AI);
const isDefaultRoute = computed(() => route.value?.type === RouteTypes.DEFAULT);

const state = reactive({
  messages: [] as ChatMessageWithLoading[],
  chatId: null as string | null,
  hasMoreMessages: true,
  isLoadingMore: false,
  page: 1,
  limit: 50,
  aiMessages: [] as AIMessage[]
});

const isLoadingInitialMessages = ref(false);

const updateMessages = () => {
  if (props.contact?.id) {
    const newMessages = getMessagesWithLoadingStatus(props.contact.id);
    state.messages = JSON.parse(JSON.stringify([...newMessages]));
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
    props.contact?.id &&
    state.hasMoreMessages
  ) {
    isScrollLoading = true;

    if (!getIsWebsocketConnecting()) {
      state.page += 1;
      fetchMessagesForTopic(props.contact.id, {
        page: state.page,
        limit: state.limit,
        append: true
      })
        .then(messages => {
          if (messages.length < state.limit) {
            state.hasMoreMessages = false;
          }
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

watch(
  () => props.contact?.id,
  async (newConversationId, oldConversationId) => {
    if (newConversationId && newConversationId !== oldConversationId) {
      state.messages = [];
      state.hasMoreMessages = true;
      state.isLoadingMore = false;
      state.page = 1;
      isLoadingInitialMessages.value = true;

      try {
        if (!getIsWebsocketConnecting()) {
          const messages = await fetchMessagesForTopic(newConversationId, {
            page: state.page,
            limit: state.limit
          });
          if (messages.length < state.limit) {
            state.hasMoreMessages = false;
          }
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

    updateMessages();

    if (previousConnectingState.value && !currentConnectingState) {
      setTimeout(async () => {
        if (props.contact?.id) {
          try {
            await fetchMessagesForTopic(props.contact.id, {
              page: 1,
              limit: state.limit
            });
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
  if (props.contact?.id) {
    try {
      await fetchMessagesForTopic(props.contact.id, {
        page: 1,
        limit: state.limit
      });
      updateMessages();
    } catch (error) {
      console.error('Failed to reload messages after reconnection:', error);
    }
  }
};

watch(
  () => getIsRecentlyReconnected(),
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

    watch(
      () => result.messages.value,
      newMessages => {
        state.aiMessages = [...newMessages];
      },
      { deep: true }
    );
  } else {
    const result = useMastra(false);
    mastraResult.value = result;

    watch(
      () => result.messages.value,
      newMessages => {
        state.aiMessages = [...newMessages];
      },
      { deep: true }
    );
  }
};

initializeMastra();

watch([() => state.chatId, () => props.baseUrl], () => {
  initializeMastra();
});

let unsubscribeFromMessageChanges: (() => void) | null = null;

const lastMessageSentTime = ref(0);

onMounted(async () => {
  if (route.value && route.value.type === RouteTypes.AI && !state.chatId) {
    state.chatId = generateChatId();
  }

  unsubscribeFromMessageChanges = subscribeToMessageChanges(
    async (newMessageConversationId?: string) => {
      await new Promise(resolve => setTimeout(resolve, 50));

      if (newMessageConversationId === props.contact?.id) {
        const timeSinceLastSend = Date.now() - lastMessageSentTime.value;
        if (!getIsWebsocketConnecting() && timeSinceLastSend > 2000) {
          await fetchMessagesForTopic(newMessageConversationId, {
            page: 1,
            limit: state.limit
          });
        }
        updateMessages();
      }
    }
  );

  if (props.contact?.id) {
    state.messages = [];
    state.hasMoreMessages = true;
    state.isLoadingMore = false;
    state.page = 1;
    isLoadingInitialMessages.value = true;

    try {
      if (!getIsWebsocketConnecting()) {
        const messages = await fetchMessagesForTopic(props.contact.id, {
          page: state.page,
          limit: state.limit
        });
        if (messages.length < state.limit) {
          state.hasMoreMessages = false;
        }
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

const clearAiMessages = () => {
  if (mastraResult.value) {
    return mastraResult.value.clearMessages();
  }
};

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

const getMessageMedia = (message: ChatMessage) => {
  return (
    message.media?.find(
      item => item.type === MediaType.Image || item.type === MediaType.Video
    ) || null
  );
};

const getMessageFile = (message: ChatMessage) => {
  return message.media?.find(item => item.type === MediaType.File) || null;
};

watch(
  () => state.messages.length,
  (newLength, oldLength) => {
    if (route.value && route.value.type === RouteTypes.AI) return;

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
  () => route.value?.type,
  async (newValue, oldValue) => {
    if (newValue === oldValue) return;

    if (chatWrapperRef?.value) {
      scrollState.previousScrollTop = chatWrapperRef.value.scrollTop;
    }

    if (newValue !== RouteTypes.AI && props.contact?.id) {
      state.messages = [];
      state.hasMoreMessages = true;
      state.isLoadingMore = false;
      state.page = 1;
      isLoadingInitialMessages.value = true;

      try {
        if (!getIsWebsocketConnecting()) {
          const messages = await fetchMessagesForTopic(props.contact.id, {
            page: state.page,
            limit: state.limit
          });
          if (messages.length < state.limit) {
            state.hasMoreMessages = false;
          }
        }
      } catch (error) {
        console.error('Failed to load messages when changing chapter:', error);
      } finally {
        updateMessages();
        isLoadingInitialMessages.value = false;
      }
    } else if (newValue !== RouteTypes.AI) {
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

  if (route.value && route.value.type === RouteTypes.AI) {
    const text = inputText.value;
    inputText.value = '';

    if (mastraResult.value && mastraResult.value.sendMessage) {
      const userMessage = {
        role: 'user' as 'user' | 'assistant',
        content: text,
        timestamp: Date.now()
      };
      state.aiMessages = [...state.aiMessages, userMessage];

      await nextTick();
      requestAnimationFrame(() => scrollToBottom(true));

      try {
        await mastraResult.value.sendMessage(text, () => {
          requestAnimationFrame(() => scrollToBottom(true));
        });
      } catch (error) {
        console.warn('Mastra failed to send message:', error);
      }
    } else {
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

      console.warn('Mastra is not available, message added locally only');
      requestAnimationFrame(() => scrollToBottom(true));
    }
    return;
  }

  if (!props.contact?.id) {
    console.error('[ChatSDK] Cannot send message: no topic provided');
    return;
  }

  const text = inputText.value;
  inputText.value = '';

  try {
    lastMessageSentTime.value = Date.now();
    await sendMessageChat({
      topicId: props.contact.id,
      text
    });
  } catch (error) {
    console.error('[ChatSDK] Failed to send message:', error);
  }

  updateMessages();
  scrollToBottom(true);
};

const handleAttachFile = async (files: FileList, onlyMedia: boolean) => {
  if (!files.length) return;

  if (!props.contact?.id) {
    console.error('[ChatSDK] Cannot send message: no topic provided');
    return;
  }

  Array.from(files).forEach(async file => {
    try {
      lastMessageSentTime.value = Date.now();
      await sendMessageChat({
        topicId: props.contact.id,
        file,
        onlyMedia
      });
      updateMessages();
    } catch (error) {
      console.error('[ChatSDK] Failed to send file:', error);
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

const getSystemMessageContent = (message: ChatMessage) => {
  return message.systemMessageContent || message.text || '';
};

defineExpose({
  handleClear: clearAiMessages
});
</script>
