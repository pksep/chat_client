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
            isNewDate(index, true)
              ? formatDay(new Date(message.timestamp))
              : undefined
          "
        >
          <div
            class="date-divider"
            :data-testid="`${props.dataTestid}-MessageList-DateDividerAI${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-DateLabelAI${index + 1}`"
              >{{ formatDay(new Date(message.timestamp)) }}</span
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
        <div class="top-element" v-if="isNewDate(index) || message.isSystem">
          <div
            v-if="isNewDate(index)"
            class="date-divider"
            :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${index + 1}`"
              >{{ formatDay(message.createdAt) }}</span
            >
          </div>

          <div
            v-if="message.isSystem"
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
          v-if="!message.isSystem"
          :class="
            messageChat(
              props.user?.id === message.senderUserId ? 'user' : 'assistant'
            )
          "
          :message="message.text || ''"
          :media="getMessageMedia(message)"
          :file="getMessageFile(message)"
          :is-me-sender="props.user.id === message.senderUserId"
          :time="formatTime(new Date(message.createdAt))"
          :sender="message.senderUser?.initials || ''"
          :avatar="message.senderUser?.avatarUrl || ''"
          :is-read="
            props.user.id === message.senderUserId
              ? message.status === MessageStatus.Read
              : message.status === MessageStatus.Read
          "
          :message-status="message.status"
          :data-testid="`${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`"
          :data-message-id="message.id"
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
    v-if="!isDefaultRoute"
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
import {
  sendMessageChat,
  getIsWebsocketConnecting,
  markAsRead
} from '../services/useChat';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';
import type { ChatMessage, AIMessage } from '../types/messages';
import { MediaType } from '@pksep/zod-shared-chat';
import { MessageStatus } from '../services/useChatSDK/types';
import { useUrlWatcher } from '../composables/navigation';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import {
  fetchMessagesForTopic,
  getMessagesByTopicId
} from '../services/useMessages';

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
  messages: computed(() => getMessagesByTopicId(route.value.id)),
  chatId: null as string | null,
  isLoadingMore: false,
  limit: 50,
  aiMessages: [] as AIMessage[]
});

const isLoadingInitialMessages = ref(false);

const scrollState = reactive({
  isUserScrolling: false,
  previousScrollTop: 0,
  shouldAutoScroll: true,
  isInitialLoad: true
});

let isScrollLoading = false;
let hasMoreMessage = true;
let scrollMarkReadTimeout: number | null = null;
let intersectionObserver: IntersectionObserver | null = null;

const setupIntersectionObserver = () => {
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }

  intersectionObserver = new IntersectionObserver(
    entries => {
      const visibleUnreadMessageIds: string[] = [];

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageId = entry.target.getAttribute('data-message-id');
          if (messageId) {
            // Check if this message is unread and not from the current user
            const message = state.messages.find(m => m.id === messageId);
            if (
              message &&
              message.senderUserId !== props.user?.id &&
              message.status !== MessageStatus.Read
            ) {
              visibleUnreadMessageIds.push(messageId);
            }
          }
        }
      });

      if (visibleUnreadMessageIds.length > 0 && route.value?.id) {
        // Mark specific messages as read when they become visible
        markAsRead({
          messageIds: visibleUnreadMessageIds,
          topicId: route.value.id
        }).catch(error => {
          console.warn('Failed to mark messages as read:', error);
        });
      }
    },
    {
      root: chatWrapperRef.value,
      threshold: 0.1, // Trigger when 10% of the message is visible
      rootMargin: '0px 0px -50px 0px' // Trigger slightly before fully visible
    }
  );

  // Observe all message elements
  nextTick(() => {
    if (chatWrapperRef.value) {
      const messageElements =
        chatWrapperRef.value.querySelectorAll('[data-message-id]');
      messageElements.forEach(element => {
        if (element instanceof HTMLElement) {
          intersectionObserver?.observe(element);
        }
      });
    }
  });
};

const handleScroll = async (): Promise<void> => {
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

  if (scrollState.isUserScrolling && route.value?.id) {
    if (scrollMarkReadTimeout) {
      clearTimeout(scrollMarkReadTimeout);
    }
    scrollMarkReadTimeout = window.setTimeout(() => {
      const unreadMessages = state.messages.filter(
        message =>
          message.senderUserId !== props.user?.id &&
          message.status !== MessageStatus.Read
      );

      if (unreadMessages.length > 0) {
        markAsRead({
          messageIds: unreadMessages.map(m => m.id),
          topicId: route.value.id
        }).catch(error => {
          console.warn('Failed to mark messages as read:', error);
        });
      }
      scrollMarkReadTimeout = null;
    }, 500);
  }

  if (distanceFromTop < 50 && !isScrollLoading && hasMoreMessage) {
    isScrollLoading = true;

    if (!getIsWebsocketConnecting()) {
      const result = await fetchMessagesForTopic(route.value.id, {
        lastMessageId: state.messages[0]?.id
      });
      hasMoreMessage = result.length > 0;
    }
    isScrollLoading = false;
  }
};

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

  if (props.contact?.id) {
    state.isLoadingMore = false;
    isLoadingInitialMessages.value = true;

    await nextTick();
    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollState.shouldAutoScroll = true;
        scrollState.isInitialLoad = true;
        setupIntersectionObserver();
      }
    });
  }
});

onUnmounted(() => {
  if (unsubscribeFromMessageChanges) {
    unsubscribeFromMessageChanges();
    unsubscribeFromMessageChanges = null;
  }

  if (scrollMarkReadTimeout) {
    clearTimeout(scrollMarkReadTimeout);
    scrollMarkReadTimeout = null;
  }

  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
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

// Re-setup intersection observer when messages change
watch(
  () => state.messages,
  () => {
    nextTick(() => {
      setupIntersectionObserver();
    });
  },
  { deep: true }
);

const scrollToBottom = () => {
  if (chatWrapperRef.value) {
    setTimeout(() => {
      chatWrapperRef.value.scrollTop =
        chatWrapperRef.value.scrollHeight - chatWrapperRef.value.clientHeight;
    }, 100);
  }
};

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

      try {
        await mastraResult.value.sendMessage(text);
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

      // Scroll to bottom after adding fallback messages
      await nextTick();
      scrollToBottom();

      console.warn('Mastra is not available, message added locally only');
    }
    return;
  }

  if (!route.value.id) {
    console.error('[ChatSDK] Cannot send message: no topic provided');
    return;
  }

  const text = inputText.value;
  inputText.value = '';

  try {
    lastMessageSentTime.value = Date.now();
    await sendMessageChat({
      topicId: route.value.id,
      text
    });

    await nextTick();
    scrollToBottom();
  } catch (error) {
    console.error('[ChatSDK] Failed to send message:', error);
  }
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
    const currentDay = formatDay(new Date(currentMsg.timestamp));
    const prevDay = formatDay(new Date(prevMsg.timestamp));
    return currentDay !== prevDay;
  } else {
    const currentMsg = state.messages[index];
    const prevMsg = state.messages[index - 1];
    const currentDay = formatDay(currentMsg.createdAt);
    const prevDay = formatDay(prevMsg.createdAt);
    return currentDay !== prevDay;
  }
};

const getSystemMessageContent = (message: ChatMessage) => {
  return message.systemMessageContent || message.text || '';
};

watch(
  () => route.value,
  () => {
    if (!route.value?.id) return;

    fetchMessagesForTopic(route.value.id);
    hasMoreMessage = true;

    // Mark messages as read when viewing the topic
    const unreadMessages = state.messages.filter(
      message =>
        message.senderUserId !== props.user?.id &&
        message.status !== MessageStatus.Read
    );
    if (unreadMessages.length > 0) {
      markAsRead({
        messageIds: unreadMessages.map(m => m.id),
        topicId: route.value.id
      }).catch(error => {
        console.warn('Failed to mark messages as read:', error);
      });
    }

    // Reset intersection observer for new topic
    nextTick(() => {
      setupIntersectionObserver();
    });
  },
  { deep: true, immediate: true }
);

defineExpose({
  handleClear: clearAiMessages
});
</script>
