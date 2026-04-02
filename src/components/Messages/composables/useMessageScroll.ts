import {
  reactive,
  watch,
  nextTick,
  ref,
  onMounted,
  onUnmounted,
  type Ref
} from 'vue';
import {
  getIsWebsocketConnecting,
  markAsRead
} from '../../../services/useChat';
import {
  changeLocalReadStatus,
  fetchMessagesForTopic,
  mergeMessagesForTopic
} from '../../../services/useMessages';
import type { IMessage } from '../../interfaces/interfaces';

export function useMessageScroll(
  chatWrapperRef: Ref<HTMLElement | null>,
  messageListUserItemsRef: Ref<any>,
  route: Ref<{ id: string; type: string }>,
  state: { messages: IMessage[] },
  props: { user?: any }
) {
  const isShowScrollToBottomButton = ref(false);
  const isLoadingInitialMessages = ref(false);

  const scrollState = reactive({
    isUserScrolling: false,
    previousScrollTop: 0,
    shouldAutoScroll: true,
    isInitialLoad: true
  });

  let isScrollLoading = false;
  const isAutoScrollLoading = false;
  let hasOldMessage = true;
  let hasNewMessage = true;
  const scrollMarkReadTimeout: number | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  const pendingReadIds = new Set<string>();
  const SCROLL_DISTANCE_FOR_REQUEST = 500;

  const getUnreadMessageIdIfTrackable = (element: Element) => {
    const messageId = element.getAttribute('data-message-id');
    if (!messageId || pendingReadIds.has(messageId)) {
      return null;
    }

    const message = state.messages.find(m => m.id === messageId);
    if (
      !message ||
      message.senderUserId === props.user?.id ||
      message.isReadByMe
    ) {
      return null;
    }

    return messageId;
  };

  const submitReadMessages = async (messageIds: string[]) => {
    if (!messageIds.length || !route.value?.id) return;

    messageIds.forEach(id => pendingReadIds.add(id));

    try {
      await markAsRead({
        messageIds,
        topicId: route.value.id
      });
    } catch (error) {
      console.warn('Failed to mark messages as read:', error);
      messageIds.forEach(id => pendingReadIds.delete(id));
    }
  };

  const collectVisibleUnreadMessageIds = () => {
    const container = chatWrapperRef.value;
    if (!container || document.visibilityState !== 'visible') {
      return [];
    }

    const containerRect = container.getBoundingClientRect();
    const messageElements = container.querySelectorAll('[data-message-id]');
    const visibleUnreadMessageIds: string[] = [];

    messageElements.forEach(element => {
      if (!(element instanceof HTMLElement)) return;

      const rect = element.getBoundingClientRect();
      const intersectsVertically =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom - 50;
      const intersectsHorizontally =
        rect.right > containerRect.left && rect.left < containerRect.right;

      if (!intersectsVertically || !intersectsHorizontally) {
        return;
      }

      const messageId = getUnreadMessageIdIfTrackable(element);
      if (messageId) {
        visibleUnreadMessageIds.push(messageId);
      }
    });

    return visibleUnreadMessageIds;
  };

  const flushVisibleUnreadMessages = () => {
    const visibleUnreadMessageIds = collectVisibleUnreadMessageIds();
    if (visibleUnreadMessageIds.length > 0) {
      submitReadMessages(visibleUnreadMessageIds);
    }
  };

  const markAllVisibleAsRead = async () => {
    const unreadMessages = state.messages.filter(
      (m: IMessage) => m.senderUserId !== props.user?.id
    );

    if (unreadMessages.length === 0) return;

    try {
      await markAsRead({
        messageIds: unreadMessages.map((m: IMessage) => m.id),
        topicId: route.value.id
      });
      changeLocalReadStatus(
        route.value.id,
        unreadMessages.map((m: IMessage) => m.id),
        props.user?.id
      );
    } catch (error) {
      console.warn('Failed to mark messages as read:', error);
    }
  };

  const setupIntersectionObserver = () => {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver(
      entries => {
        const visibleUnreadMessageIds: string[] = [];

        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const messageId = getUnreadMessageIdIfTrackable(entry.target);
            if (messageId) {
              visibleUnreadMessageIds.push(messageId);
            }
          }
        });

        if (visibleUnreadMessageIds.length > 0) {
          submitReadMessages(visibleUnreadMessageIds);
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

        flushVisibleUnreadMessages();
      }
    });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      nextTick(() => {
        flushVisibleUnreadMessages();
      });
    }
  };

  const handleWindowFocus = () => {
    nextTick(() => {
      flushVisibleUnreadMessages();
    });
  };

  const getScrollAnchor = () => {
    const container = chatWrapperRef.value;
    if (!container) return null;

    const containerRect = container.getBoundingClientRect();
    const messageElements = Array.from(
      container.querySelectorAll('[data-message-id]')
    );

    for (const element of messageElements) {
      if (!(element instanceof HTMLElement)) continue;

      const rect = element.getBoundingClientRect();
      const isVisible =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom;

      if (isVisible) {
        return {
          messageId: element.getAttribute('data-message-id'),
          topOffset: rect.top - containerRect.top
        };
      }
    }

    return null;
  };

  const handleScroll = async (): Promise<void> => {
    const el = chatWrapperRef.value;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;

    isShowScrollToBottomButton.value = scrollTop < -200;

    if (isAutoScrollLoading) {
      return;
    }

    const maxScroll = scrollHeight - clientHeight;
    const distanceFromBottom = scrollTop;
    const distanceFromTop = maxScroll + scrollTop;

    scrollState.shouldAutoScroll =
      distanceFromBottom < SCROLL_DISTANCE_FOR_REQUEST;
    scrollState.isUserScrolling =
      distanceFromBottom >= SCROLL_DISTANCE_FOR_REQUEST;

    if (scrollState.isInitialLoad) {
      scrollState.isInitialLoad = false;
    }

    if (scrollState.isUserScrolling && route.value?.id) {
      if (scrollMarkReadTimeout) {
        clearTimeout(scrollMarkReadTimeout);
      }
    }

    if (
      distanceFromTop < SCROLL_DISTANCE_FOR_REQUEST &&
      !isScrollLoading &&
      hasOldMessage
    ) {
      isScrollLoading = true;

      if (!getIsWebsocketConnecting()) {
        const lastMessageId = state.messages[0]?.id;
        const result = await fetchMessagesForTopic(route.value.id, {
          lastMessageId,
          skipSave: true
        });
        hasOldMessage = result.length > 0;

        if (result.length > 0) {
          mergeMessagesForTopic(route.value.id, result, 'prepend');
        }
      }
      isScrollLoading = false;
    } else if (
      distanceFromBottom > -SCROLL_DISTANCE_FOR_REQUEST &&
      !isScrollLoading &&
      hasNewMessage
    ) {
      isScrollLoading = true;

      if (!getIsWebsocketConnecting()) {
        const lastMessage = state.messages[state.messages.length - 1];

        const result = await fetchMessagesForTopic(route.value.id, {
          afterMessageId: lastMessage?.id,
          skipSave: true
        });
        hasNewMessage = result.length > 0;

        if (result.length > 0) {
          mergeMessagesForTopic(route.value.id, result, 'append');
        }
      }
      isScrollLoading = false;
    }
  };

  const scrollToBottom = () => {
    if (!chatWrapperRef.value) return;

    setTimeout(() => {
      if (!chatWrapperRef.value) return;

      const unreadRef = messageListUserItemsRef.value?.unreadMessageStartRef;
      if (unreadRef?.length > 0) {
        const firstUnread = unreadRef[0];
        const container = chatWrapperRef.value;
        if (container && firstUnread) {
          container.scrollTop = firstUnread.offsetTop - container.offsetTop;
        }
        return;
      }

      chatWrapperRef.value.scrollTop =
        chatWrapperRef.value.scrollHeight - chatWrapperRef.value.clientHeight;
    }, 100);
  };

  const handleScrollToButton = async () => {
    await fetchMessagesForTopic(route.value.id, { newMessages: true });
    scrollToBottom();
    markAllVisibleAsRead();
  };

  watch(
    () => state.messages.length,
    (newLength, oldLength) => {
      if (route.value && route.value.type === 'AI') return;

      if (oldLength === 0 && newLength > 0) {
        if (!getIsWebsocketConnecting()) {
          scrollState.shouldAutoScroll = true;
        }
      }
    },
    { immediate: true }
  );

  watch(
    () => chatWrapperRef.value?.scrollTop,
    newScrollTop => {
      if (
        !chatWrapperRef.value ||
        scrollState.isInitialLoad ||
        newScrollTop === undefined
      )
        return;

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

  watch(
    () => state.messages.map((m: IMessage) => m.id),
    (newIds, oldIds) => {
      if (!oldIds || !chatWrapperRef.value) return;

      const oldSet = new Set(oldIds);
      const containsAllOld = oldIds.every(id => newIds.includes(id));
      const hasNew = newIds.some(id => !oldSet.has(id));

      if (containsAllOld && hasNew && chatWrapperRef.value.scrollTop > -100) {
        nextTick(() => {
          scrollToBottom();
        });
      }
    }
  );

  const resetScrollState = () => {
    hasOldMessage = true;
    hasNewMessage = true;
    pendingReadIds.clear();
  };

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
  });

  return {
    isShowScrollToBottomButton,
    isLoadingInitialMessages,
    scrollState,
    handleScroll,
    scrollToBottom,
    handleScrollToButton,
    setupIntersectionObserver,
    intersectionObserver,
    resetScrollState,
    scrollMarkReadTimeout
  };
}
