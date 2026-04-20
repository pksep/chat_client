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
  getCanSendReadReceipts,
  getIsWebsocketConnecting,
  markAsRead
} from '../../../services/useChat';
import {
  fetchMessagesForTopic,
  mergeMessagesForTopic
} from '../../../services/useMessages';
import { previewTopicReadMessages } from '../../../composables/useTopics';
import { clearTopicNotifications } from '../../../services/useNotificationNavigation';
import type { IMessage } from '../../interfaces/interfaces';

export function useMessageScroll(
  chatWrapperRef: Ref<HTMLElement | null>,
  messageListUserItemsRef: Ref<any>,
  route: Ref<{ id: string; type: string }>,
  state: {
    messages: IMessage[];
    hideUnreadMarker?: boolean;
    unreadMarkerMessageId?: string | null;
  },
  props: { user?: any }
) {
  const isShowScrollToBottomButton = ref(false);
  const isLoadingInitialMessages = ref(false);
  const autoReadSuspendedUntil = ref(0);
  const historyFetchSuspendedUntil = ref(0);
  const readReceiptsEnabled = ref(true);
  const queuedReadIds = new Set<string>();

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

  const canTrackVisibleMessages = (): boolean => {
    const container = chatWrapperRef.value;

    if (!container) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();

    return containerRect.width > 0 && containerRect.height > 0;
  };

  const canMarkVisibleMessagesAsRead = (): boolean => {
    if (!canTrackVisibleMessages()) {
      return false;
    }

    if (!getCanSendReadReceipts()) {
      return false;
    }

    if (!readReceiptsEnabled.value) {
      return false;
    }

    if (Date.now() < autoReadSuspendedUntil.value) {
      return false;
    }

    return true;
  };

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
    if (!canTrackVisibleMessages()) return;

    const uniqueMessageIds = Array.from(new Set(messageIds)).filter(
      id => !pendingReadIds.has(id)
    );

    if (!uniqueMessageIds.length) {
      return;
    }

    previewTopicReadMessages(route.value.id, uniqueMessageIds);

    if (!canMarkVisibleMessagesAsRead()) {
      uniqueMessageIds.forEach(id => queuedReadIds.add(id));
      return;
    }

    uniqueMessageIds.forEach(id => {
      pendingReadIds.add(id);
      queuedReadIds.delete(id);
    });

    try {
      await markAsRead({
        messageIds: uniqueMessageIds,
        topicId: route.value.id
      });
    } catch (error) {
      console.warn('Failed to mark messages as read:', error);
      uniqueMessageIds.forEach(id => {
        pendingReadIds.delete(id);
        queuedReadIds.add(id);
      });
    }
  };

  const collectVisibleUnreadMessageIds = () => {
    const container = chatWrapperRef.value;
    if (!canTrackVisibleMessages() || !container) {
      return [];
    }

    const containerRect = container.getBoundingClientRect();
    const messageElements = container.querySelectorAll('[data-message-id]');
    const visibleUnreadMessageIds: string[] = [];

    messageElements.forEach(element => {
      if (!(element instanceof HTMLElement)) return;

      const rect = element.getBoundingClientRect();
      const intersectsVertically =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom;
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
    if (!canTrackVisibleMessages()) {
      return;
    }

    const visibleUnreadMessageIds = collectVisibleUnreadMessageIds();
    if (visibleUnreadMessageIds.length > 0) {
      void clearTopicNotifications(route.value.id);
      submitReadMessages(visibleUnreadMessageIds);
    }
  };

  const flushQueuedReadMessages = async () => {
    if (!route.value?.id || queuedReadIds.size === 0) {
      return;
    }

    if (!canMarkVisibleMessagesAsRead()) {
      return;
    }

    const messageIds = Array.from(queuedReadIds).filter(
      id => !pendingReadIds.has(id)
    );

    if (!messageIds.length) {
      return;
    }

    messageIds.forEach(id => {
      pendingReadIds.add(id);
      queuedReadIds.delete(id);
    });

    try {
      await markAsRead({
        messageIds,
        topicId: route.value.id
      });
    } catch (error) {
      console.warn('Failed to flush queued read messages:', error);
      messageIds.forEach(id => {
        pendingReadIds.delete(id);
        queuedReadIds.add(id);
      });
    }
  };

  const markAllVisibleAsRead = async () => {
    if (!canMarkVisibleMessagesAsRead()) {
      return;
    }

    const unreadMessages = state.messages.filter(
      (m: IMessage) => m.senderUserId !== props.user?.id
    );

    if (unreadMessages.length === 0) return;

    previewTopicReadMessages(
      route.value.id,
      unreadMessages.map((m: IMessage) => m.id)
    );

    try {
      await clearTopicNotifications(route.value.id);
      await markAsRead({
        messageIds: unreadMessages.map((m: IMessage) => m.id),
        topicId: route.value.id
      });
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
          if (entry.isIntersecting && canTrackVisibleMessages()) {
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
        rootMargin: '0px'
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

        void flushQueuedReadMessages();
        flushVisibleUnreadMessages();
      }
    });
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      nextTick(() => {
        void flushQueuedReadMessages();
        flushVisibleUnreadMessages();
      });
    }
  };

  const handleWindowFocus = () => {
    nextTick(() => {
      void flushQueuedReadMessages();
      flushVisibleUnreadMessages();
    });
  };

  const handleScroll = async (): Promise<void> => {
    const el = chatWrapperRef.value;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;

    isShowScrollToBottomButton.value = scrollTop < -200;

    if (isAutoScrollLoading) {
      return;
    }

    if (Date.now() < historyFetchSuspendedUntil.value) {
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
      return;
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

      if (!state.hideUnreadMarker && state.unreadMarkerMessageId) {
        const unreadMessageElement = chatWrapperRef.value.querySelector(
          `[data-message-id="${state.unreadMarkerMessageId}"]`
        );

        if (unreadMessageElement instanceof HTMLElement) {
          unreadMessageElement.scrollIntoView({
            block: 'start',
            behavior: 'auto'
          });
          return;
        }
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
    scrollState.isInitialLoad = true;
    scrollState.isUserScrolling = false;
    scrollState.shouldAutoScroll = true;
  };

  const suspendAutoRead = (durationMs: number) => {
    autoReadSuspendedUntil.value = Date.now() + Math.max(0, durationMs);
  };

  const suspendHistoryFetch = (durationMs: number) => {
    historyFetchSuspendedUntil.value = Date.now() + Math.max(0, durationMs);
  };

  const setReadReceiptsEnabled = (enabled: boolean) => {
    readReceiptsEnabled.value = enabled;

    if (enabled) {
      void flushQueuedReadMessages();
    }
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
    flushVisibleUnreadMessages,
    intersectionObserver,
    resetScrollState,
    scrollMarkReadTimeout,
    suspendAutoRead,
    suspendHistoryFetch,
    setReadReceiptsEnabled
  };
}
