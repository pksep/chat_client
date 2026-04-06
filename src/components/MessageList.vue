<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="isAiRoute"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    :data-testid="`${props.dataTestid}-MessageList-AIMessagesWrapper`"
  >
    <MessageListAIItems
      :messages="state.aiMessages"
      :data-testid="props.dataTestid"
    />
  </div>

  <div
    class="chat__message-wrapper"
    v-if="state.messages.length && !isAiRoute"
    ref="chatWrapperRef"
    @vue:mounted="scrollToBottom"
    @scroll="handleScroll"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <MessageListUserItems
      ref="messageListUserItemsRef"
      :messages="state.messages"
      :user="props.user"
      :auth-user-id="authUser?.id"
      :hide-unread-marker="state.hideUnreadMarker"
      :data-testid="props.dataTestid"
      @set-edit-message="handleSetEditMessage"
      @set-reply-message="handleSetReplyMessage"
      @set-forward-message="handleSetForwardMessage"
      @scroll-to-message="handleScrollToMessage"
    />

    <div
      class="chat__message-bubble__arrow-down"
      v-if="isShowScrollToBottomButton"
      @click="handleScrollToButton"
    >
      <Icon :name="IconNameEnum.arrowDown" />
    </div>
  </div>

  <Loading
    v-if="isLoadingInitialMessages"
    message="Загрузка сообщений..."
    :dataTestid="`${props.dataTestid}-MessageList-Loading`"
  />

  <MessageListInput
    v-if="!isDefaultRoute"
    v-model="inputText"
    ref="messageListInputRef"
    :edit-message="state.editMessage"
    :reply-message="state.replyMessage"
    :forward-message="state.forwardMessage"
    :data-testid="props.dataTestid"
    @send="handleSend"
    @attach-file="handleAttachFile"
    @clear-edit="handleSetEditMessage(null)"
    @clear-reply="handleSetReplyMessage(null)"
    @clear-forward="handleSetForwardMessage(null)"
    @scroll-to-message="handleScrollToMessage"
  />

  <PushNotification
    v-if="!!state.errorMessage"
    class="mobile-auth-container__error"
    title="Ошибка"
    :push-key="Math.random()"
    :description="state.errorMessage"
    :type="MessageTypeEnum.error"
    @close="() => (state.errorMessage = '')"
  />
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
import MessageListAIItems from './Messages/MessageListAIItems.vue';
import MessageListUserItems from './Messages/MessageListUserItems.vue';
import MessageListInput from './Messages/MessageListInput.vue';
import Loading from './Loading.vue';
import {
  MessageTypeEnum,
  PushNotification,
  Icon,
  IconNameEnum
} from '@pksep/yui';
import type { IMessageListProps } from './interfaces/message-list';
import type { AIMessage } from '../types/messages';
import { useUrlWatcher } from '../composables/navigation';
import {
  navigateToDefault,
  RouteTypes
} from '../composables/navigation/useUrlRouting';
import { resetTopicUnreadState } from '../composables/useTopics';
import {
  fetchAroundMessage,
  fetchMessagesForTopic,
  fetchPinnedMessagesForTopic,
  getMessagesByTopicId,
  hydrateMessagesFromCache
} from '../services/useMessages';
import { getAuthUser } from '../composables/useAuth';
import { IMessage } from './interfaces/interfaces';
import { MessageStatus } from '../services/useChatSDK/types';

import { useMessageSwipe } from './Messages/composables/useMessageSwipe';
import { useMessageScroll } from './Messages/composables/useMessageScroll';
import { useMessageSender } from './Messages/composables/useMessageSender';
import { useMessageMastra } from './Messages/composables/useMessageMastra';
import { useMessageActions } from './Messages/composables/useMessageActions';
import { Capacitor } from '@capacitor/core';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  dataTestid: 'MessageList'
});

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const messageListUserItemsRef = useTemplateRef<any>('messageListUserItemsRef');
const messageListInputRef = useTemplateRef<any>('messageListInputRef');

const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);

const { onTouchStart, onTouchEnd } = useMessageSwipe(route);

const getLocalStorageInputText = computed(() => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  return inputsJson[route.value.id] || '';
});

const inputText = ref(getLocalStorageInputText.value);

const isAiRoute = computed(() => route.value?.type === RouteTypes.AI);
const isDefaultRoute = computed(() => route.value?.type === RouteTypes.DEFAULT);
const authUser = computed(() => getAuthUser());

const state = reactive({
  messages: computed(() => getMessagesByTopicId(route.value.id)),
  chatId: null as string | null,
  isLoadingMore: false,
  aiMessages: [] as AIMessage[],
  editMessage: null as IMessage | null,
  replyMessage: null as IMessage | null,
  forwardMessage: null as IMessage | null,
  errorMessage: '',
  hideUnreadMarker: false,
  unreadMarkerMessageId: null as string | null
});

const {
  isShowScrollToBottomButton,
  isLoadingInitialMessages,
  scrollState,
  handleScroll: handleMessageScroll,
  scrollToBottom,
  handleScrollToButton,
  setupIntersectionObserver,
  intersectionObserver,
  scrollMarkReadTimeout,
  resetScrollState
} = useMessageScroll(
  chatWrapperRef,
  messageListUserItemsRef,
  route,
  state,
  props
);

const {
  mastraResult,
  initializeMastra,
  handleMastraMounted,
  handleMastraUnmounted,
  clearAiMessages
} = useMessageMastra(route, state, props);

initializeMastra();

watch([() => state.chatId, () => props.baseUrl], () => {
  initializeMastra();
});

const {
  clearSellectedMessage,
  handleSetEditMessage,
  handleSetReplyMessage,
  handleSetForwardMessage
} = useMessageActions(state, inputText, messageListInputRef);

const handleScrollToMessage = async (message: IMessage) => {
  if (message.topicId !== route.value.id) return;

  nextTick(async () => {
    const messageId = message.id;

    const messageElement = chatWrapperRef.value?.querySelector(
      `[data-message-id="${messageId}"]`
    );
    if (messageElement instanceof HTMLElement) {
      messageElement.scrollIntoView({ block: 'center', behavior: 'auto' });
      messageElement.classList.add('highlighted');
      setTimeout(() => {
        messageElement.classList.remove('highlighted');
      }, 1000);
    } else {
      await fetchAroundMessage(messageId).then(messages => {
        if (messages.some(m => m.id === messageId)) {
          setTimeout(() => {
            handleScrollToMessage(message);
          }, 300);
        }
      });
    }
  });
};

const shouldResetUnreadForCurrentTopic = (): boolean => {
  const lastMessage = state.messages.at(-1);
  const currentUserId = authUser.value?.id;

  if (!lastMessage || !currentUserId) {
    return true;
  }

  if (lastMessage.senderUserId === currentUserId) {
    return true;
  }

  return (
    !!lastMessage.isReadByMe ||
    !!lastMessage.isRead ||
    lastMessage.status === MessageStatus.Read
  );
};

const getFirstUnreadMessageId = (): string | null => {
  const currentUserId = authUser.value?.id;

  if (!currentUserId) {
    return null;
  }

  const firstUnreadMessage = state.messages.find(
    message =>
      !message.isSystem &&
      message.senderUserId !== currentUserId &&
      !message.isReadByMe
  );

  return firstUnreadMessage?.id || null;
};

const isViewingCurrentTopicBottom = (): boolean => {
  const wrapper = chatWrapperRef.value;

  if (!route.value?.id || !wrapper || route.value?.type === RouteTypes.AI) {
    return false;
  }

  const distanceFromBottom =
    wrapper.scrollHeight - wrapper.clientHeight - wrapper.scrollTop;

  return distanceFromBottom < 100;
};

const resetUnreadIfViewingBottom = (): void => {
  if (!route.value?.id || !isViewingCurrentTopicBottom()) {
    return;
  }

  resetTopicUnreadState(route.value.id);
};

const handleScroll = async (): Promise<void> => {
  await handleMessageScroll();
  resetUnreadIfViewingBottom();
};

const { handleSend, handleAttachFile } = useMessageSender(
  route,
  inputText,
  state,
  authUser,
  mastraResult,
  scrollToBottom,
  clearSellectedMessage
);

onMounted(async () => {
  handleMastraMounted();

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
  if (scrollMarkReadTimeout) {
    clearTimeout(scrollMarkReadTimeout);
  }
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }
  handleMastraUnmounted();
});

watch(
  () => route.value,
  async () => {
    if (!route.value?.id) return;

    await hydrateMessagesFromCache(route.value.id);
    await fetchPinnedMessagesForTopic(route.value.id);
    await fetchMessagesForTopic(route.value.id);
    state.unreadMarkerMessageId = getFirstUnreadMessageId();

    if (shouldResetUnreadForCurrentTopic()) {
      resetTopicUnreadState(route.value.id);
    }

    resetScrollState();

    nextTick(() => {
      state.replyMessage = null;
      state.editMessage = null;
      state.hideUnreadMarker = false;
      inputText.value = getLocalStorageInputText.value;
      setupIntersectionObserver();
      scrollToBottom();
    });
  },
  { deep: true, immediate: true }
);

const updateLocalStorageInputText = () => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  if (inputsJson) {
    inputsJson[route.value.id] = inputText.value;
  }

  localStorage.setItem('inputs', JSON.stringify(inputsJson));
};

const isEditableElement = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) return false;

  return Boolean(
    element.closest('input, textarea, select') ||
      element.isContentEditable ||
      element.closest('[contenteditable="true"]')
  );
};

const isEditableEventTarget = (e: Event) => {
  return e.composedPath().some(target => isEditableElement(target));
};

const focusMessageInput = () => {
  messageListInputRef.value?.focus();
};

const insertTextToMessageInput = (text: string) => {
  messageListInputRef.value?.insertText?.(text);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const tryBuildAnchor = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  try {
    const url = new URL(trimmedValue);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    const safeUrl = escapeHtml(url.toString());
    const safeText = escapeHtml(trimmedValue);

    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a> `;
  } catch {
    return null;
  }
};

const pasteTextToMessageInput = async () => {
  const clipboardText = await navigator.clipboard.readText();

  if (!clipboardText) return;

  const anchorHtml = tryBuildAnchor(clipboardText);

  insertTextToMessageInput(anchorHtml);
};

const handleWindowKeydown = async (e: KeyboardEvent) => {
  const hasModifierKey = e.ctrlKey || e.metaKey || e.altKey;
  const shortcutCode = e.code.toLowerCase();
  const isModifierShortcut = e.ctrlKey || e.metaKey;
  const isPasteShortcut =
    isModifierShortcut &&
    (shortcutCode === 'keyv' || e.key.toLowerCase() === 'v');
  const isPrintableKey = e.key.length === 1 && !hasModifierKey;
  const shouldFocusMessageInput =
    !Capacitor.isNativePlatform() &&
    (!hasModifierKey || isPasteShortcut) &&
    !isEditableEventTarget(e);

  if (shouldFocusMessageInput) {
    if (isPrintableKey || isPasteShortcut) {
      e.preventDefault();
    }

    focusMessageInput();

    if (isPrintableKey) {
      insertTextToMessageInput(e.key);
    }

    if (isPasteShortcut) {
      try {
        await pasteTextToMessageInput();
      } catch (error) {
        console.error('Failed to paste into message input:', error);
      }
    }
  }

  if (e.key === 'Escape') {
    navigateToDefault();
  }
};

onMounted(() => {
  if (!isMobile.value) {
    focusMessageInput();
  }

  window.addEventListener('keydown', handleWindowKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleWindowKeydown, true);
});

watch(
  () => inputText.value,
  () => {
    updateLocalStorageInputText();
  }
);

watch(
  () => state.messages.map(message => message.id),
  () => {
    nextTick(() => {
      if (!state.hideUnreadMarker && !state.unreadMarkerMessageId) {
        state.unreadMarkerMessageId = getFirstUnreadMessageId();
      }

      resetUnreadIfViewingBottom();
    });
  }
);

defineExpose({
  handleClear: clearAiMessages,
  scrollToMessage: handleScrollToMessage
});
</script>
