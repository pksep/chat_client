import {
  computed,
  reactive,
  watch,
  nextTick,
  ref,
  onMounted,
  onUnmounted,
  type Ref
} from 'vue';
import { useScrollAnchor } from './useScrollAnchor';
import {
  getCanSendReadReceipts,
  markAsRead,
  consumeBufferedIncomingMessagesForTopic
} from '../../../services/useChat';
import {
  fetchMessagesForTopic,
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  hydrateMessagesFromCache,
  mergeMessagesForTopic
} from '../../../services/useMessages';
import {
  getSelectedTopic,
  previewTopicReadMessages
} from '../../../composables/useTopics';
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
  const scrolledUnreadMarkerKey = ref<string | null>(null);

  const scrollAnchor = useScrollAnchor({
    containerRef: chatWrapperRef,
    bottomThreshold: 50
  });

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
  let autoReadResumeTimeout: ReturnType<typeof setTimeout> | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let pendingMessagesMutationRevision: number | null = null;
  let preserveViewportForDownPagination = false;
  const pendingReadIds = new Set<string>();
  const SCROLL_DISTANCE_FOR_REQUEST = 500;
  const unreadTrackableMessageIds = computed(
    () =>
      new Set(
        state.messages
          .filter(
            message =>
              !message.isSystem &&
              message.senderUserId !== props.user?.id &&
              message.isReadByMe !== true
          )
          .map(message => message.id)
      )
  );

  const getMessageIds = () =>
    state.messages.map((message: IMessage) => message.id);

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

    if (!unreadTrackableMessageIds.value.has(messageId)) {
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
      (message: IMessage) => message.senderUserId !== props.user?.id
    );

    if (unreadMessages.length === 0) return;

    previewTopicReadMessages(
      route.value.id,
      unreadMessages.map((message: IMessage) => message.id)
    );

    try {
      await clearTopicNotifications(route.value.id);
      await markAsRead({
        messageIds: unreadMessages.map((message: IMessage) => message.id),
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

    scrollAnchor.onScroll();
    schedulePersistScrollMeta();

    const { scrollTop, scrollHeight, clientHeight } = el;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const normalizedScrollTop = Math.min(scrollTop, 0);
    const distanceFromBottom = Math.abs(normalizedScrollTop);
    const distanceFromTop = maxScroll + normalizedScrollTop;

    isShowScrollToBottomButton.value = distanceFromBottom > 200;

    if (isAutoScrollLoading) {
      return;
    }

    if (Date.now() < historyFetchSuspendedUntil.value) {
      return;
    }

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

      const lastMessageId = state.messages[0]?.id;
      const result = await fetchMessagesForTopic(route.value.id, {
        lastMessageId,
        skipSave: true
      });
      hasOldMessage = result.length > 0;

      if (result.length > 0) {
        mergeMessagesForTopic(route.value.id, result, 'prepend', {
          syncLastMessage: false
        });
      }

      isScrollLoading = false;
    } else if (
      distanceFromBottom < SCROLL_DISTANCE_FOR_REQUEST &&
      !isScrollLoading &&
      hasNewMessage
    ) {
      isScrollLoading = true;

      const lastMessage = state.messages[state.messages.length - 1];
      const latestKnownTopicMessageId =
        getSelectedTopic(route.value.id)?.lastMessage?.id || null;
      const shouldFetchNewerRange =
        !!lastMessage?.id &&
        !!latestKnownTopicMessageId &&
        lastMessage.id !== latestKnownTopicMessageId;

      if (shouldFetchNewerRange) {
        preserveViewportForDownPagination = true;

        const result = await fetchMessagesForTopic(route.value.id, {
          afterMessageId: lastMessage.id,
          skipSave: true
        });
        hasNewMessage = result.length > 0;

        if (result.length > 0) {
          mergeMessagesForTopic(route.value.id, result, 'append', {
            syncLastMessage: false
          });
        }
      }

      isScrollLoading = false;
    }
  };

  const scrollToBottom = (opts?: {
    preferUnreadMarker?: boolean;
    smooth?: boolean;
  }) => {
    if (!chatWrapperRef.value) return;

    isShowScrollToBottomButton.value = false;

    if (opts?.preferUnreadMarker !== false) {
      const unreadRef = messageListUserItemsRef.value?.unreadMessageStartRef;
      if (unreadRef?.length > 0) {
        const firstUnread = unreadRef[0];
        const container = chatWrapperRef.value;

        if (container && firstUnread) {
          container.scrollTop = firstUnread.offsetTop - container.offsetTop;
          requestAnimationFrame(() => {
            void flushQueuedReadMessages();
            flushVisibleUnreadMessages();
          });
          schedulePersistScrollMeta();
        }

        return;
      }

      if (!state.hideUnreadMarker && state.unreadMarkerMessageId) {
        const currentMarkerKey = route.value?.id
          ? `${route.value.id}:${state.unreadMarkerMessageId}`
          : state.unreadMarkerMessageId;

        if (scrolledUnreadMarkerKey.value === currentMarkerKey) {
          return;
        }

        const unreadMessageElement = chatWrapperRef.value.querySelector(
          `[data-message-id="${state.unreadMarkerMessageId}"]`
        );

        if (unreadMessageElement instanceof HTMLElement) {
          scrolledUnreadMarkerKey.value = currentMarkerKey;
          unreadMessageElement.scrollIntoView({
            block: 'start',
            behavior: 'auto'
          });
          requestAnimationFrame(() => {
            void flushQueuedReadMessages();
            flushVisibleUnreadMessages();
          });
          schedulePersistScrollMeta();
          return;
        }
      }
    }

    if (opts?.smooth) {
      scrollAnchor.scrollToBottomSmooth();
    } else {
      scrollAnchor.scrollToBottomInstant();
    }
    schedulePersistScrollMeta();

    requestAnimationFrame(() => {
      void flushQueuedReadMessages();
      flushVisibleUnreadMessages();
    });
  };

  const handleScrollToButton = async () => {
    scrollAnchor.setViewportMode('live', { pin: false });
    isShowScrollToBottomButton.value = false;
    hasOldMessage = true;
    hasNewMessage = true;

    if (getMessagesByTopicId(route.value.id).length === 0) {
      await hydrateMessagesFromCache(route.value.id);
    }

    const bufferedIncomingMessages = consumeBufferedIncomingMessagesForTopic(
      route.value.id
    );

    if (bufferedIncomingMessages.length > 0) {
      mergeMessagesForTopic(
        route.value.id,
        bufferedIncomingMessages,
        'append',
        {
          syncLastMessage: false
        }
      );
    }

    const localLatestMessages = getFullMessagesByTopicId(route.value.id).slice(
      -50
    );

    if (localLatestMessages.length > 0) {
      scrollAnchor.prepareJumpMutation();
      mergeMessagesForTopic(route.value.id, localLatestMessages, 'replace', {
        syncLastMessage: false,
        windowMode: 'latest'
      });
    }

    await nextTick();
    await scrollAnchor.scrollToBottomSmooth();
    schedulePersistScrollMeta();
    markAllVisibleAsRead();

    const latestKnownTopicMessageId =
      getSelectedTopic(route.value.id)?.lastMessage?.id || null;
    const localLatestMessageId =
      getFullMessagesByTopicId(route.value.id).at(-1)?.id || null;
    const shouldForceNetworkLatest =
      !!latestKnownTopicMessageId &&
      latestKnownTopicMessageId !== localLatestMessageId;

    const latestMessages = await fetchMessagesForTopic(route.value.id, {
      limit: 50,
      syncLastMessage: false,
      skipSave: true,
      forceRefresh: true,
      forceNetwork: shouldForceNetworkLatest
    });

    if (latestMessages.length > 0) {
      mergeMessagesForTopic(route.value.id, latestMessages, 'append', {
        syncLastMessage: false,
        windowMode: 'latest'
      });
    }

    const bufferedMessagesAfterFetch = consumeBufferedIncomingMessagesForTopic(
      route.value.id
    );

    if (bufferedMessagesAfterFetch.length > 0) {
      mergeMessagesForTopic(
        route.value.id,
        bufferedMessagesAfterFetch,
        'append',
        {
          syncLastMessage: false,
          windowMode: 'latest'
        }
      );
    }

    await nextTick();
    await scrollAnchor.scrollToBottomSmooth();
    isShowScrollToBottomButton.value = false;
    markAllVisibleAsRead();
    schedulePersistScrollMeta();
  };

  const schedulePersistScrollMeta = () => {
    return;
  };

  const restoreShadowScrollState = async (): Promise<boolean> => {
    return false;
  };

  watch(
    () => state.messages.length,
    (newLength, oldLength) => {
      if (route.value && route.value.type === 'AI') return;

      if (oldLength === 0 && newLength > 0) {
        scrollState.shouldAutoScroll = true;
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
      ) {
        return;
      }

      const distanceFromBottom = Math.abs(Math.min(newScrollTop, 0));
      scrollState.shouldAutoScroll = distanceFromBottom < 100;
      scrollState.isUserScrolling = distanceFromBottom >= 100;
    }
  );

  watch(
    getMessageIds,
    (newIds, oldIds) => {
      if (!oldIds || !chatWrapperRef.value) {
        pendingMessagesMutationRevision = null;
        return;
      }

      const oldSet = new Set(oldIds);
      const hasNew = newIds.some(id => !oldSet.has(id));
      const firstOldIndex = oldIds.length > 0 ? newIds.indexOf(oldIds[0]) : -1;
      const lastOldIndex =
        oldIds.length > 0 ? newIds.indexOf(oldIds[oldIds.length - 1]) : -1;
      const isPrepend =
        hasNew &&
        newIds.length > oldIds.length &&
        oldIds.length > 0 &&
        firstOldIndex > 0;
      const isAppend =
        hasNew &&
        newIds.length > oldIds.length &&
        oldIds.length > 0 &&
        lastOldIndex >= 0 &&
        lastOldIndex < newIds.length - 1;

      const reason = isPrepend ? 'prepend' : isAppend ? 'append' : 'replace';
      const mutation = scrollAnchor.beginViewportMutation(reason, {
        forcePreserve: reason === 'append' && preserveViewportForDownPagination
      });

      pendingMessagesMutationRevision = mutation.revision;
    },
    { flush: 'pre' }
  );

  watch(
    getMessageIds,
    () => {
      nextTick(() => {
        setupIntersectionObserver();
        scrollAnchor.setupResizeObserver();

        if (pendingMessagesMutationRevision !== null) {
          scrollAnchor.commitViewportMutation(pendingMessagesMutationRevision);
          pendingMessagesMutationRevision = null;
        }

        preserveViewportForDownPagination = false;
      });
    },
    { flush: 'post' }
  );

  const resetScrollState = () => {
    hasOldMessage = true;
    hasNewMessage = true;
    pendingReadIds.clear();
    scrolledUnreadMarkerKey.value = null;
    pendingMessagesMutationRevision = null;
    preserveViewportForDownPagination = false;
    isShowScrollToBottomButton.value = false;
    scrollState.isInitialLoad = true;
    scrollState.isUserScrolling = false;
    scrollState.shouldAutoScroll = true;
  };

  const suspendAutoRead = (durationMs: number) => {
    const delay = Math.max(0, durationMs);
    autoReadSuspendedUntil.value = Date.now() + delay;

    if (autoReadResumeTimeout) {
      clearTimeout(autoReadResumeTimeout);
    }

    autoReadResumeTimeout = setTimeout(() => {
      autoReadResumeTimeout = null;
      nextTick(() => {
        void flushQueuedReadMessages();
        flushVisibleUnreadMessages();
      });
    }, delay + 20);
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
    if (autoReadResumeTimeout) {
      clearTimeout(autoReadResumeTimeout);
      autoReadResumeTimeout = null;
    }

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
    setReadReceiptsEnabled,
    restoreShadowScrollState,
    scrollAnchor
  };
}
