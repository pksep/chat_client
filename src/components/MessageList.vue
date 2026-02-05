<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="isAiRoute"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
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
            >
              {{ formatDay(new Date(message.timestamp)) }}
            </span>
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
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <div
      class="chat__message-bubble"
      :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
    >
      <template v-for="(message, index) in state.messages" :key="message.id">
        <div
          class="top-element"
          v-if="isNewDate(index) || message.isSystem"
          :data-message-id="message.id"
        >
          <div
            v-if="isNewDate(index)"
            class="date-divider"
            :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${index + 1}`"
          >
            <span
              :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${index + 1}`"
            >
              {{ formatDay(message.createdAt) }}
            </span>
          </div>

          <div
            v-if="message.isSystem"
            class="system-message"
            :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${index + 1}`"
          >
            <span
              class="system-message-text"
              :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${index + 1}`"
            >
              {{ message.text }}
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
          :media="message.media"
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
          :topic-id="message.topicId"
          :data-testid="`${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`"
          :data-message-id="message.id"
          :message-id="message.id"
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
import { useMastra } from '../services/useMastra';
import { removeMessageLoading } from '../services/useChatDb';
import {
  sendMessageChat,
  getIsWebsocketConnecting,
  markAsRead,
  uploadFile
} from '../services/useChat';
import type { IMessageListProps } from './interfaces/message-list';
import { formatDay, formatTime } from '../composables/useTime';
import type { AIMessage } from '../types/messages';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import { MessageStatus } from '../services/useChatSDK/types';
import { useUrlWatcher } from '../composables/navigation';
import {
  navigateToAssistant,
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../composables/navigation/useUrlRouting';
import {
  addMessageToLocal,
  changeFileLoadingStatus,
  deleteMessageFromLocal,
  fetchMessagesForTopic,
  getMessagesByTopicId
} from '../services/useMessages';
import { getAuthUser } from '../composables/useAuth';
import { IMedia, IMessage } from './interfaces/interfaces';
import { fileToDataURL } from '../utils/fileToDataURL';
import { generateUUID } from '../utils/generateUUID';

const touchStartX = ref(0);
const touchStartY = ref(0);

const SWIPE_MIN = 100;
const VERTICAL_LIMIT = 30;

const onTouchStart = (e: TouchEvent) => {
  const t = e.changedTouches[0];
  touchStartX.value = t.clientX;
  touchStartY.value = t.clientY;
};

const onTouchEnd = (e: TouchEvent) => {
  const t = e.changedTouches[0];

  const deltaX = Math.abs(t.clientX - touchStartX.value);
  const deltaY = Math.abs(t.clientY - touchStartY.value);

  if (deltaX < SWIPE_MIN && deltaY < SWIPE_MIN) return;
  if (deltaY > deltaX + VERTICAL_LIMIT) return;

  if (route.value.id === RouteTypes.AI) {
    navigateToAssistant();
  } else if (route.value.type === RouteTypes.DIALOGS) {
    navigateToDialogsList();
  } else if (route.value.type === RouteTypes.GROUP) {
    navigateToGroupsList();
  }
};

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  dataTestid: 'MessageList'
});

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const inputText = ref('');
const route = useUrlWatcher();

const isAiRoute = computed(() => route.value?.type === RouteTypes.AI);
const isDefaultRoute = computed(() => route.value?.type === RouteTypes.DEFAULT);
const authUser = computed(() => getAuthUser());

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
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    }
  );

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

onMounted(async () => {
  if (route.value && route.value.type === RouteTypes.AI && !state.chatId) {
    state.chatId = generateUUID();
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

const getMediaType = (file: File, isMedia: boolean): MediaTypeType => {
  if (!isMedia) return MediaType.File;
  if (file.type.startsWith('image/')) return MediaType.Image;
  if (file.type.startsWith('video/')) return MediaType.Video;
  return MediaType.File;
};

const MAX_HTML_LENGTH = 2000;

const splitHtmlByLength = (
  html: string,
  maxLength = MAX_HTML_LENGTH
): string[] => {
  const blocks = html.split(/(?=<p|<div|<br|<ul|<ol|<li)/i);
  const parts: string[] = [];

  let current = '';

  for (const block of blocks) {
    if ((current + block).length > maxLength) {
      if (current) parts.push(current);
      current = block;
    } else {
      current += block;
    }
  }

  if (current) parts.push(current);

  return parts;
};

const handleSend = async (): Promise<void> => {
  const rawText = inputText.value;

  if (!rawText.trim() || rawText.trim() === '<p></p>') return;

  inputText.value = '';

  const parts = splitHtmlByLength(rawText);

  /* ================= AI ROUTE ================= */
  if (route.value?.type === RouteTypes.AI) {
    for (const part of parts) {
      const userMessage = {
        role: 'user' as 'user' | 'assistant',
        content: part,
        timestamp: Date.now()
      };

      state.aiMessages = [...state.aiMessages, userMessage];
      await nextTick();

      if (mastraResult.value?.sendMessage) {
        try {
          await mastraResult.value.sendMessage(part);
        } catch (error) {
          console.warn('Mastra failed to send message:', error);
          break;
        }
      } else {
        const assistantMessage = {
          role: 'assistant' as 'user' | 'assistant',
          content: 'Mastra is currently unavailable. Please try again later.',
          timestamp: Date.now()
        };

        state.aiMessages = [...state.aiMessages, assistantMessage];
        await nextTick();
        scrollToBottom();

        console.warn('Mastra is not available, message added locally only');
        break;
      }
    }

    return;
  }

  /* ================= NORMAL CHAT ================= */
  if (!route.value?.id) {
    console.error('[ChatSDK] Cannot send message: no topic provided');
    return;
  }

  try {
    for (const part of parts) {
      await sendMessageChat({
        topicId: route.value.id,
        text: part
      });

      await nextTick();
      scrollToBottom();
    }
  } catch (error) {
    console.error('[ChatSDK] Failed to send message:', error);
  }
};

const handleAttachFile = async (files: FileList, isMedia = false) => {
  if (!files.length) return;

  const CHUNK_SIZE = 10;
  const filesArray = Array.from(files);

  for (let i = 0; i < filesArray.length; i += CHUNK_SIZE) {
    const chunk = filesArray.slice(i, i + CHUNK_SIZE);

    const chunkFileList = {
      length: chunk.length,
      item: (index: number) => chunk[index],
      ...chunk
    } as FileList;

    handleAttachFileChunk(chunkFileList, isMedia);
  }
};

const handleAttachFileChunk = async (files: FileList, isMedia = false) => {
  if (!files.length) return;
  const clientId = generateUUID();

  const localMedia: IMedia[] = await Promise.all(
    Array.from(files).map(async (file, i) => ({
      localPath: await fileToDataURL(file),
      path: '',
      originName: file.name,
      size: file.size,
      id: i + '',
      createdAt: null,
      deletedAt: null,
      updatedAt: null,
      messageId: clientId,
      type: getMediaType(file, isMedia),
      isLoading: true
    }))
  );

  const newMessage: IMessage = {
    id: clientId,
    status: 'WAIT',
    createdAt: new Date(),
    deletedAt: null,
    updatedAt: null,
    isEdit: false,
    isPin: false,
    isSystem: false,
    replyMessageId: null,
    senderUserId: authUser.value.id,
    text: null,
    topicId: route.value.id,
    media: localMedia
  };

  addMessageToLocal(route.value.id, newMessage);

  const medias = [];

  for (const [i, uploadedFile] of Array.from(files).entries()) {
    try {
      const { file, path, thumbnailPath } = await uploadFile(uploadedFile);

      changeFileLoadingStatus(route.value.id, clientId, i.toString());

      medias.push({
        path,
        thumbnailPath,
        originName: file.name,
        size: file.size,
        type: getMediaType(file, isMedia)
      });
    } catch (error) {
      alert(error.message);
      deleteMessageFromLocal(route.value.id, clientId);
      return;
    }
  }

  try {
    await sendMessageChat({
      topicId: route.value.id,
      text: '',
      medias,
      ex: JSON.stringify({ clientId })
    });

    await nextTick();
    scrollToBottom();
  } catch (error) {
    console.error('[ChatSDK] Failed to send message:', error);
  }
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

watch(
  () => route.value,
  () => {
    if (!route.value?.id) return;

    fetchMessagesForTopic(route.value.id);
    hasMoreMessage = true;

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
