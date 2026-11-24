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
import { useScrollAnchor, type ScrollAnchor } from './useScrollAnchor';
import {
  getCanSendReadReceipts,
  getChatSDK,
  getHasBrowserNetwork,
  getHasWebsocketConnection,
  markAsRead,
  consumeBufferedIncomingMessagesForTopic,
  markTopicReactionSeenChat
} from '../../../services/useChat';
import { getIsAppActivelyVisible } from '../../../services/useAppVisibility';
import {
  changeLocalReadStatus,
  fetchMessagesForTopic,
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  hydrateMessagesFromCache,
  mergeMessagesForTopic
} from '../../../services/useMessages';
import {
  clearTopicUnreadReaction,
  getSelectedTopic,
  getTopicUnreadReactionMessageId,
  previewTopicReadMessages
} from '../../../composables/useTopics';
import { clearTopicNotifications } from '../../../services/useNotificationNavigation';
import {
  clearTopicNearBottomState,
  clearTopicMessageVisibilityChecker,
  setTopicMessageVisibilityChecker,
  setTopicNearBottomState
} from '../../../services/useTopicViewportState';
import type { IMessage } from '../../interfaces/interfaces';
import { isUnreadTrackableMessageForUser } from '../../../utils/messageTracking';
import { shouldPinMessageAppendToBottom } from '../../../utils/messageScroll';
import { getMessageRangeDiagnostic } from '../../../utils/message-range-diagnostic';
import { useMessageViewportTelemetry } from '../../../services/use-message-viewport-telemetry';

export function useMessageScroll(
  chatWrapperRef: Ref<HTMLElement | null>,
  messageListUserItemsRef: Ref<any>,
  route: Ref<{ id: string; type: string }>,
  state: {
    messages: IMessage[];
    hideUnreadMarker?: boolean;
    unreadMarkerMessageId?: string | null;
  },
  props: { user?: any; suspended?: boolean }
) {
  const isShowScrollToBottomButton = ref(false);
  const viewportRevision = ref(0);
  const isLoadingInitialMessages = ref(false);
  const isLoadingOlderMessages = ref(false);
  const isLoadingNewerMessages = ref(false);
  const autoReadSuspendedUntil = ref(0);
  const historyFetchSuspendedUntil = ref(0);
  const readReceiptsEnabled = ref(true);
  const queuedReadIds = new Set<string>();
  const scrolledUnreadMarkerKey = ref<string | null>(null);

  const scrollAnchor = useScrollAnchor({
    suspended: () => !!props.suspended,
    containerRef: chatWrapperRef,
    bottomThreshold: 120,
    bottomLockThreshold: 4,
    messageSelector: '[data-message-id]',
    getViewportAnchor: preferredMessageId => {
      const snapshot =
        messageListUserItemsRef.value?.getVisibleMessageSnapshot?.();

      if (!snapshot) {
        return null;
      }

      if (
        preferredMessageId &&
        snapshot.visibleMessageIds.includes(preferredMessageId)
      ) {
        const container = chatWrapperRef.value;
        const escapedMessageId = window.CSS?.escape
          ? window.CSS.escape(preferredMessageId)
          : preferredMessageId.replace(/["\\]/g, '\\$&');
        const element = container?.querySelector(
          `[data-message-id="${escapedMessageId}"]`
        );

        if (container && element instanceof HTMLElement) {
          return {
            messageId: preferredMessageId,
            relativeTop:
              element.getBoundingClientRect().top -
              container.getBoundingClientRect().top
          };
        }
      }

      return {
        messageId: snapshot.anchorMessageId,
        relativeTop: snapshot.anchorRelativeTop
      };
    }
  });
  let trackedViewportTopicId = '';

  const isMessageVisibleInViewport = (messageId: string): boolean => {
    if (props.suspended) return false;
    const container = chatWrapperRef.value;

    if (!container) {
      return false;
    }

    const escapedMessageId = window.CSS?.escape
      ? window.CSS.escape(messageId)
      : messageId.replace(/["\\]/g, '\\$&');
    const messageElement = container.querySelector(
      `[data-message-id="${escapedMessageId}"]`
    );

    if (!(messageElement instanceof HTMLElement)) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const messageRect = messageElement.getBoundingClientRect();

    return (
      messageRect.bottom > containerRect.top &&
      messageRect.top < containerRect.bottom &&
      messageRect.right > containerRect.left &&
      messageRect.left < containerRect.right
    );
  };

  const clearVisibleUnreadReaction = (): void => {
    const topicId = route.value.id;
    const unreadReactionMessageId = getTopicUnreadReactionMessageId(topicId);

    if (
      unreadReactionMessageId &&
      getIsAppActivelyVisible() &&
      isMessageVisibleInViewport(unreadReactionMessageId)
    ) {
      clearTopicUnreadReaction(topicId);
      void markTopicReactionSeenChat({ topicId });
    }
  };

  watch(
    [() => route.value.id, () => scrollAnchor.isNearBottom.value],
    ([topicId, isNearBottom]) => {
      if (trackedViewportTopicId && trackedViewportTopicId !== topicId) {
        clearTopicNearBottomState(trackedViewportTopicId);
        clearTopicMessageVisibilityChecker(trackedViewportTopicId);
      }

      trackedViewportTopicId = topicId;

      if (!topicId) {
        return;
      }

      setTopicNearBottomState(topicId, isNearBottom);
      setTopicMessageVisibilityChecker(topicId, isMessageVisibleInViewport);
    },
    { immediate: true }
  );
  const USER_ACTIVITY_READ_FLUSH_INTERVAL_MS = 350;

  const scrollState = reactive({
    isUserScrolling: false,
    previousScrollTop: 0,
    shouldAutoScroll: true,
    isInitialLoad: true
  });

  let isScrollLoading = false;
  let isHistoryScrollLoading = false;
  let isNewerScrollLoading = false;
  const isAutoScrollLoading = false;
  let hasOldMessage = true;
  let hasNewMessage = true;
  const scrollMarkReadTimeout: number | null = null;
  let autoReadResumeTimeout: ReturnType<typeof setTimeout> | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let historyPaginationObserver: IntersectionObserver | null = null;
  let intersectionObserverRoot: HTMLElement | null = null;
  let historyPaginationObserverRoot: HTMLElement | null = null;
  const observedReadMessageElements = new Set<HTMLElement>();
  const observedHistoryPaginationElements = new Set<HTMLElement>();
  let observedMessageTargetsRafId = 0;
  let observedHistoryPaginationTargetsRafId = 0;
  let historyPrependCheckRafId = 0;
  let viewportRevisionRafId = 0;
  let unreadReactionCheckRafId = 0;
  let olderMessagesLoadingHideTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  let newerMessagesLoadingHideTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  let readTargetsSyncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let historyTargetsSyncTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let historyPrependCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let viewportRevisionSyncTimeoutId: ReturnType<typeof setTimeout> | null =
    null;
  let unreadReactionCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingMessagesMutationRevision: number | null = null;
  let pendingViewportAnchorMessageId: string | null = null;
  let preserveViewportForDownPagination = false;
  let prefetchedHistoryPrepend: {
    topicId: string;
    cursorId: string;
    messages: IMessage[];
  } | null = null;
  let prefetchedNewerAppend: {
    topicId: string;
    cursorId: string;
    messages: IMessage[];
  } | null = null;
  let historyLoadCheckPending = false;
  let isMobileTouchActive = false;
  let isMobileScrollGestureActive = false;
  let mobileTouchLastY: number | null = null;
  let mobileScrollIntent: 'older' | 'newer' | 'none' = 'none';
  let mobileScrollIntentAt = 0;
  let mobileScrollSettleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastUserActivityReadFlushAt = 0;
  let lastHistoryScrollIntentAt = 0;
  let olderMessagesLoadingShownAt = 0;
  let newerMessagesLoadingShownAt = 0;
  const pendingReadIds = new Set<string>();
  const SCROLL_DISTANCE_FOR_REQUEST = 500;
  const HISTORY_PREPEND_TRIGGER_INDEX = 72;
  const HISTORY_PREPEND_TRIGGER_WINDOW_FRACTION = 0.5;
  const HISTORY_PREFETCH_TRIGGER_INDEX = 160;
  const HISTORY_PREFETCH_TRIGGER_WINDOW_FRACTION = 0.7;
  const HISTORY_PREPEND_TRIGGER_BUFFER = 2;
  const HISTORY_PREPEND_COOLDOWN_MS = 100;
  const HISTORY_PREPEND_INTENT_TTL_MS = 2500;
  const HISTORY_DESKTOP_PREPEND_PAGE_LIMIT = 80;
  const HISTORY_MOBILE_PREPEND_PAGE_LIMIT = 8;
  const HISTORY_DESKTOP_VISIBLE_WINDOW_LIMIT = 700;
  const HISTORY_MOBILE_VISIBLE_WINDOW_LIMIT = 72;
  const HISTORY_PERSIST_IDLE_DELAY_MS = 10000;
  const HISTORY_PREPEND_CHECK_INTERVAL_MS = 60;
  const PAGINATION_LOADING_MIN_VISIBLE_MS = 650;
  const PAGINATION_LOADING_TOP_EDGE_THRESHOLD = 160;
  const PAGINATION_LOADING_BOTTOM_EDGE_THRESHOLD = 24;
  const HISTORY_TARGET_SYNC_INTERVAL_MS = 250;
  const READ_TARGET_SYNC_INTERVAL_MS = 350;
  const VIEWPORT_REVISION_UPDATE_INTERVAL_MS = 120;
  const UNREAD_REACTION_CHECK_INTERVAL_MS = 300;
  const MOBILE_SCROLL_IDLE_DELAY_MS = 320;
  const MOBILE_SCROLL_INTENT_TTL_MS = 1800;
  const MOBILE_TOUCH_DIRECTION_THRESHOLD_PX = 2;
  const READ_OBSERVER_TARGET_LIMIT = 120;
  const READ_OBSERVER_VIEWPORT_MARGIN_MULTIPLIER = 2;
  const isMobileMessageViewport = (): boolean =>
    window.matchMedia('(max-width: 768px)').matches;
  const getHistoryPrependPageLimit = (): number =>
    isMobileMessageViewport()
      ? HISTORY_MOBILE_PREPEND_PAGE_LIMIT
      : HISTORY_DESKTOP_PREPEND_PAGE_LIMIT;
  const getHistoryVisibleWindowLimit = (): number =>
    isMobileMessageViewport()
      ? HISTORY_MOBILE_VISIBLE_WINDOW_LIMIT
      : HISTORY_DESKTOP_VISIBLE_WINDOW_LIMIT;
  let lastHistoryPrependAt = 0;
  const unreadTrackableMessageIds = computed(
    () =>
      new Set(
        state.messages
          .filter(
            message =>
              isUnreadTrackableMessageForUser(message, props.user?.id) &&
              message.senderUserId !== props.user?.id &&
              message.isReadByMe !== true
          )
          .map(message => message.id)
      )
  );

  const clearOlderMessagesLoadingHideTimeout = (): void => {
    if (olderMessagesLoadingHideTimeoutId) {
      clearTimeout(olderMessagesLoadingHideTimeoutId);
      olderMessagesLoadingHideTimeoutId = null;
    }
  };

  const clearNewerMessagesLoadingHideTimeout = (): void => {
    if (newerMessagesLoadingHideTimeoutId) {
      clearTimeout(newerMessagesLoadingHideTimeoutId);
      newerMessagesLoadingHideTimeoutId = null;
    }
  };

  const showOlderMessagesLoading = (): void => {
    clearOlderMessagesLoadingHideTimeout();
    if (!isLoadingOlderMessages.value) {
      olderMessagesLoadingShownAt = Date.now();
    }
    isLoadingOlderMessages.value = true;
  };

  const showNewerMessagesLoading = (): void => {
    clearNewerMessagesLoadingHideTimeout();
    if (!isLoadingNewerMessages.value) {
      newerMessagesLoadingShownAt = Date.now();
    }
    isLoadingNewerMessages.value = true;
  };

  const hideOlderMessagesLoading = (immediate = false): void => {
    clearOlderMessagesLoadingHideTimeout();

    if (!isLoadingOlderMessages.value) {
      return;
    }

    const delay = immediate
      ? 0
      : Math.max(
          0,
          PAGINATION_LOADING_MIN_VISIBLE_MS -
            (Date.now() - olderMessagesLoadingShownAt)
        );

    if (delay === 0) {
      isLoadingOlderMessages.value = false;
      return;
    }

    olderMessagesLoadingHideTimeoutId = setTimeout(() => {
      olderMessagesLoadingHideTimeoutId = null;
      isLoadingOlderMessages.value = false;
    }, delay);
  };

  const hideNewerMessagesLoading = (immediate = false): void => {
    clearNewerMessagesLoadingHideTimeout();

    if (!isLoadingNewerMessages.value) {
      return;
    }

    const delay = immediate
      ? 0
      : Math.max(
          0,
          PAGINATION_LOADING_MIN_VISIBLE_MS -
            (Date.now() - newerMessagesLoadingShownAt)
        );

    if (delay === 0) {
      isLoadingNewerMessages.value = false;
      return;
    }

    newerMessagesLoadingHideTimeoutId = setTimeout(() => {
      newerMessagesLoadingHideTimeoutId = null;
      isLoadingNewerMessages.value = false;
    }, delay);
  };

  const getPaginationScrollMetrics = () => {
    const container = chatWrapperRef.value;

    if (!container) {
      return null;
    }

    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    const scrollTop = Math.min(maxScroll, Math.max(0, container.scrollTop));

    return {
      distanceFromBottom: maxScroll - scrollTop,
      distanceFromTop: scrollTop
    };
  };

  const isAtLoadedTopEdge = (): boolean => {
    const metrics = getPaginationScrollMetrics();

    return (
      !!metrics &&
      metrics.distanceFromTop <= PAGINATION_LOADING_TOP_EDGE_THRESHOLD
    );
  };

  const isAtLoadedBottomEdge = (): boolean => {
    const metrics = getPaginationScrollMetrics();

    return (
      !!metrics &&
      metrics.distanceFromBottom <= PAGINATION_LOADING_BOTTOM_EDGE_THRESHOLD
    );
  };

  const syncOlderMessagesLoadingState = (): void => {
    if (isHistoryScrollLoading && isAtLoadedTopEdge()) {
      showOlderMessagesLoading();
      return;
    }

    hideOlderMessagesLoading(true);
  };

  const syncNewerMessagesLoadingState = (): void => {
    if (isNewerScrollLoading && isAtLoadedBottomEdge()) {
      showNewerMessagesLoading();
      return;
    }

    hideNewerMessagesLoading(true);
  };

  const hideOlderMessagesLoadingAfterDomUpdate = (): void => {
    void nextTick(() => {
      requestAnimationFrame(() => {
        if (!isHistoryScrollLoading && !isAtLoadedTopEdge()) {
          hideOlderMessagesLoading(true);
        }
      });
    });
  };

  const hideNewerMessagesLoadingAfterDomUpdate = (): void => {
    void nextTick(() => {
      requestAnimationFrame(() => {
        if (!isNewerScrollLoading && !isAtLoadedBottomEdge()) {
          hideNewerMessagesLoading(true);
        }
      });
    });
  };

  const completeOlderMessagesLoading = (): void => {
    isHistoryScrollLoading = false;
    hideOlderMessagesLoading(!isAtLoadedTopEdge());
    hideOlderMessagesLoadingAfterDomUpdate();
  };

  const completeNewerMessagesLoading = (): void => {
    isNewerScrollLoading = false;
    hideNewerMessagesLoading(!isAtLoadedBottomEdge());
    hideNewerMessagesLoadingAfterDomUpdate();
  };

  // Array replacement is the mutation boundary. IDs are sufficient to
  // classify prepend/append operations; ResizeObserver handles height changes.
  const messageIds = computed(() =>
    state.messages.map((message: IMessage) => message.id)
  );

  const canTrackVisibleMessages = (): boolean => {
    if (props.suspended) return false;
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

  const canPreviewVisibleMessagesAsRead = (): boolean =>
    canTrackVisibleMessages() && getIsAppActivelyVisible();

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

  const getObservableReadMessageElements = (
    container: HTMLElement
  ): HTMLElement[] => {
    const getElementsInRange = (
      startIndex: number,
      endIndex: number
    ): HTMLElement[] =>
      messageListUserItemsRef.value?.getRenderedMessageElementsInIndexRange?.(
        startIndex,
        endIndex
      ) || [];

    if (state.messages.length <= READ_OBSERVER_TARGET_LIMIT) {
      const indexedElements = getElementsInRange(0, state.messages.length - 1);

      return indexedElements.length > 0
        ? indexedElements
        : Array.from(
            container.querySelectorAll<HTMLElement>('[data-message-id]')
          );
    }

    const snapshot = getVisibleMessageSnapshot();
    const viewportMessageCount = snapshot
      ? Math.max(1, snapshot.lastVisibleIndex - snapshot.firstVisibleIndex + 1)
      : 1;
    const viewportBuffer = Math.max(
      Math.floor(READ_OBSERVER_TARGET_LIMIT / 2),
      viewportMessageCount * READ_OBSERVER_VIEWPORT_MARGIN_MULTIPLIER
    );
    const anchorIndex =
      snapshot?.firstVisibleIndex ?? state.messages.length - 1;
    const startIndex = Math.max(
      0,
      Math.min(
        anchorIndex - viewportBuffer,
        state.messages.length - READ_OBSERVER_TARGET_LIMIT
      )
    );
    return getElementsInRange(
      startIndex,
      startIndex + READ_OBSERVER_TARGET_LIMIT - 1
    );
  };

  const syncObservedReadMessageTargets = (): void => {
    const container = chatWrapperRef.value;

    if (!intersectionObserver || !container) {
      return;
    }

    const nextObservedElements = new Set(
      getObservableReadMessageElements(container)
    );

    observedReadMessageElements.forEach(element => {
      if (!nextObservedElements.has(element)) {
        intersectionObserver?.unobserve(element);
        observedReadMessageElements.delete(element);
      }
    });

    nextObservedElements.forEach(element => {
      if (!observedReadMessageElements.has(element)) {
        intersectionObserver?.observe(element);
        observedReadMessageElements.add(element);
      }
    });
  };

  const scheduleObservedReadMessageTargetsSync = (): void => {
    if (observedMessageTargetsRafId || readTargetsSyncTimeoutId) {
      return;
    }

    readTargetsSyncTimeoutId = setTimeout(() => {
      readTargetsSyncTimeoutId = null;

      observedMessageTargetsRafId = requestAnimationFrame(() => {
        observedMessageTargetsRafId = 0;
        syncObservedReadMessageTargets();
      });
    }, READ_TARGET_SYNC_INTERVAL_MS);
  };

  const scheduleViewportRevisionUpdate = (): void => {
    if (!getTopicUnreadReactionMessageId(route.value.id)) {
      return;
    }

    if (viewportRevisionRafId || viewportRevisionSyncTimeoutId) {
      return;
    }

    viewportRevisionSyncTimeoutId = setTimeout(() => {
      viewportRevisionSyncTimeoutId = null;

      viewportRevisionRafId = requestAnimationFrame(() => {
        viewportRevisionRafId = 0;
        viewportRevision.value += 1;
      });
    }, VIEWPORT_REVISION_UPDATE_INTERVAL_MS);
  };

  const scheduleVisibleUnreadReactionCheck = (): void => {
    const topicId = route.value.id;

    if (
      !topicId ||
      !getTopicUnreadReactionMessageId(topicId) ||
      unreadReactionCheckRafId ||
      unreadReactionCheckTimeoutId
    ) {
      return;
    }

    unreadReactionCheckTimeoutId = setTimeout(() => {
      unreadReactionCheckTimeoutId = null;

      unreadReactionCheckRafId = requestAnimationFrame(() => {
        unreadReactionCheckRafId = 0;
        clearVisibleUnreadReaction();
      });
    }, UNREAD_REACTION_CHECK_INTERVAL_MS);
  };

  watch(
    [
      () => route.value.id,
      () => getTopicUnreadReactionMessageId(route.value.id)
    ],
    ([topicId, messageId]) => {
      if (!topicId || !messageId) {
        return;
      }

      void nextTick(() => {
        if (
          route.value.id !== topicId ||
          getTopicUnreadReactionMessageId(topicId) !== messageId ||
          unreadReactionCheckRafId
        ) {
          return;
        }

        unreadReactionCheckRafId = requestAnimationFrame(() => {
          unreadReactionCheckRafId = 0;
          clearVisibleUnreadReaction();
        });
      });
    },
    { flush: 'post' }
  );

  const getHistoryTriggerIndex = (
    maxIndex: number,
    windowFraction: number
  ): number => {
    if (state.messages.length === 0) {
      return -1;
    }

    return Math.min(
      maxIndex,
      Math.max(0, Math.ceil((state.messages.length - 1) * windowFraction))
    );
  };

  const getHistoryPrependTriggerIndex = (): number =>
    getHistoryTriggerIndex(
      HISTORY_PREPEND_TRIGGER_INDEX,
      HISTORY_PREPEND_TRIGGER_WINDOW_FRACTION
    );

  const getHistoryPrefetchTriggerIndex = (): number =>
    getHistoryTriggerIndex(
      HISTORY_PREFETCH_TRIGGER_INDEX,
      HISTORY_PREFETCH_TRIGGER_WINDOW_FRACTION
    );

  const getVisibleMessageSnapshot = (): {
    anchorMessageId: string;
    anchorRelativeTop: number;
    firstVisibleIndex: number;
    lastVisibleIndex: number;
    visibleMessageIds: string[];
  } | null =>
    messageListUserItemsRef.value?.getVisibleMessageSnapshot?.() || null;

  const viewportTelemetry = useMessageViewportTelemetry({
    getTopicId: () => (route.value.type === 'AI' ? '' : route.value.id),
    getMessages: () => state.messages,
    getLatestMessageId: () => getSelectedTopic(route.value.id)?.lastMessage?.id,
    getVisibleMessageIds: () => {
      if (!getIsAppActivelyVisible() || !canTrackVisibleMessages()) return [];
      return (
        getVisibleMessageSnapshot()?.visibleMessageIds ||
        Array.from(
          chatWrapperRef.value?.querySelectorAll('[data-message-id]') || []
        )
          .map(element => element.getAttribute('data-message-id') || '')
          .filter(id => id && isMessageVisibleInViewport(id))
      );
    },
    getSnapshot: () => {
      const container = chatWrapperRef.value;
      const topic = getSelectedTopic(route.value.id);
      const latestId = topic?.lastMessage?.id;
      return {
        loaded: getMessageRangeDiagnostic(state.messages, latestId),
        resident: getMessageRangeDiagnostic(
          getFullMessagesByTopicId(route.value.id),
          latestId
        ),
        unreadMarkerMessageId: state.unreadMarkerMessageId || null,
        unreadMessageCount: topic?.unreadMessageCount,
        loadedUnreadCount: unreadTrackableMessageIds.value.size,
        appVisible: getIsAppActivelyVisible(),
        containerVisible: canTrackVisibleMessages(),
        browserOnline: getHasBrowserNetwork(),
        socketConnected: !!getChatSDK()?.isConnected(),
        transportReady: getHasWebsocketConnection(),
        canSendReadReceipts: getCanSendReadReceipts(),
        readBlockedReasons: [
          !getIsAppActivelyVisible() && 'app_hidden',
          !canTrackVisibleMessages() && 'container_hidden',
          !getHasWebsocketConnection() && 'transport_unavailable',
          !readReceiptsEnabled.value && 'read_receipts_disabled',
          Date.now() < autoReadSuspendedUntil.value && 'auto_read_suspended'
        ].filter(Boolean),
        readReceiptsEnabled: readReceiptsEnabled.value,
        autoReadSuspended: Date.now() < autoReadSuspendedUntil.value,
        historyFetchSuspended: Date.now() < historyFetchSuspendedUntil.value,
        initialHistoryLoading: isLoadingInitialMessages.value,
        newerHistoryLoading: isNewerScrollLoading,
        hasNewerPage: hasNewMessage,
        pendingReadCount: pendingReadIds.size,
        queuedReadCount: queuedReadIds.size,
        nearLoadedBottom: scrollAnchor.isNearBottom.value,
        distanceFromLoadedBottom: container
          ? Math.round(
              Math.max(
                0,
                container.scrollHeight -
                  container.clientHeight -
                  container.scrollTop
              )
            )
          : null
      };
    }
  });

  const isVisibleSnapshotNearLoadedStart = (
    snapshot: ReturnType<typeof getVisibleMessageSnapshot>
  ): boolean =>
    isVisibleSnapshotNearHistoryTrigger(
      snapshot,
      getHistoryPrependTriggerIndex()
    );

  const isVisibleSnapshotNearHistoryPrefetch = (
    snapshot: ReturnType<typeof getVisibleMessageSnapshot>
  ): boolean =>
    isVisibleSnapshotNearHistoryTrigger(
      snapshot,
      getHistoryPrefetchTriggerIndex()
    );

  const isVisibleSnapshotNearHistoryTrigger = (
    snapshot: ReturnType<typeof getVisibleMessageSnapshot>,
    triggerIndex: number
  ): boolean => {
    if (!snapshot) {
      return false;
    }

    if (triggerIndex < 0) {
      return false;
    }

    return (
      snapshot.firstVisibleIndex <=
      triggerIndex + HISTORY_PREPEND_TRIGGER_BUFFER
    );
  };

  const getCurrentViewportAnchor = (
    preferredMessageId?: string
  ): ScrollAnchor | null => {
    const capturedAnchor =
      scrollAnchor.captureViewportAnchor(preferredMessageId);

    if (capturedAnchor) {
      return capturedAnchor;
    }

    const snapshot = getVisibleMessageSnapshot();

    if (!snapshot) {
      return null;
    }

    return {
      messageId: snapshot.anchorMessageId,
      relativeTop: snapshot.anchorRelativeTop
    };
  };

  const loadOlderMessagesFromVisibleAnchor = async (): Promise<void> => {
    const now = Date.now();

    if (isScrollLoading) {
      syncOlderMessagesLoadingState();

      return;
    }

    if (
      props.suspended ||
      !hasOldMessage ||
      !route.value?.id ||
      Date.now() < historyFetchSuspendedUntil.value
    ) {
      return;
    }

    if (now - lastHistoryPrependAt < HISTORY_PREPEND_COOLDOWN_MS) {
      historyLoadCheckPending = true;
      scheduleHistoryPrependCheck(
        HISTORY_PREPEND_COOLDOWN_MS - (now - lastHistoryPrependAt),
        true
      );
      return;
    }

    if (
      lastHistoryScrollIntentAt === 0 ||
      now - lastHistoryScrollIntentAt > HISTORY_PREPEND_INTENT_TTL_MS
    ) {
      return;
    }

    const snapshot = getVisibleMessageSnapshot();
    const isNearPrepend = isVisibleSnapshotNearLoadedStart(snapshot);

    if (!isNearPrepend && !isVisibleSnapshotNearHistoryPrefetch(snapshot)) {
      return;
    }

    const topicId = route.value.id;
    const lastMessageId = state.messages[0]?.id;

    if (!lastMessageId) {
      return;
    }

    historyLoadCheckPending = false;
    isScrollLoading = true;
    isHistoryScrollLoading = true;
    syncOlderMessagesLoadingState();

    try {
      const visibleMessageIds = new Set(
        state.messages.map(message => message.id)
      );
      const getUsefulOlderMessages = (messages: IMessage[]): IMessage[] =>
        messages.filter(message => !visibleMessageIds.has(message.id));
      const fullMessages = getFullMessagesByTopicId(topicId);
      const historyPrependPageLimit = getHistoryPrependPageLimit();
      const fullCursorIndex = fullMessages.findIndex(
        message => message.id === lastMessageId
      );
      const hasHiddenOlderLocalMessages =
        fullCursorIndex > 0 &&
        fullMessages
          .slice(
            Math.max(0, fullCursorIndex - historyPrependPageLimit),
            fullCursorIndex
          )
          .some(message => !visibleMessageIds.has(message.id));
      const fetchOlderMessages = (forceNetwork = false) =>
        fetchMessagesForTopic(topicId, {
          lastMessageId,
          limit: historyPrependPageLimit,
          skipSave: true,
          skipShadowSnapshot: true,
          forceNetwork
        });

      const prefetchedMessages =
        prefetchedHistoryPrepend?.topicId === topicId &&
        prefetchedHistoryPrepend.cursorId === lastMessageId
          ? prefetchedHistoryPrepend.messages
          : null;
      let result = prefetchedMessages;

      if (!result) {
        const shouldForceNetworkInitially =
          !isMobileMessageViewport() || !hasHiddenOlderLocalMessages;
        result = await fetchOlderMessages(shouldForceNetworkInitially);

        if (
          !shouldForceNetworkInitially &&
          result.length > 0 &&
          getUsefulOlderMessages(result).length === 0 &&
          navigator.onLine
        ) {
          result = await fetchOlderMessages(true);
        }
      }

      const olderMessages = getUsefulOlderMessages(result);

      if (
        route.value.id !== topicId ||
        state.messages[0]?.id !== lastMessageId
      ) {
        return;
      }

      if (result.length === 0 || olderMessages.length === 0) {
        prefetchedHistoryPrepend = null;
        hasOldMessage = false;
        lastHistoryPrependAt = Date.now();
        return;
      }

      hasOldMessage = true;

      if (
        route.value.id !== topicId ||
        state.messages[0]?.id !== lastMessageId
      ) {
        return;
      }

      const latestSnapshot = getVisibleMessageSnapshot();
      if (!isVisibleSnapshotNearLoadedStart(latestSnapshot)) {
        if (!prefetchedMessages) {
          prefetchedHistoryPrepend = {
            topicId,
            cursorId: lastMessageId,
            messages: olderMessages
          };
        }

        return;
      }

      if (isMobileMessageViewport() && isMobileScrollGestureActive) {
        prefetchedHistoryPrepend = {
          topicId,
          cursorId: lastMessageId,
          messages: olderMessages
        };
        return;
      }

      if (prefetchedMessages) {
        prefetchedHistoryPrepend = null;
      }

      const requestedAnchor = getCurrentViewportAnchor(
        getVisibleMessageSnapshot()?.anchorMessageId
      );
      const currentAnchor =
        getCurrentViewportAnchor(requestedAnchor?.messageId) || requestedAnchor;
      pendingViewportAnchorMessageId = currentAnchor?.messageId || null;

      mergeMessagesForTopic(topicId, olderMessages, 'prepend', {
        syncLastMessage: false,
        windowMode: 'preserve-start',
        anchorMessageId: pendingViewportAnchorMessageId || undefined,
        visibleLimit: getHistoryVisibleWindowLimit(),
        persistDelayMs: HISTORY_PERSIST_IDLE_DELAY_MS
      });
      lastHistoryPrependAt = Date.now();
    } finally {
      isScrollLoading = false;
      completeOlderMessagesLoading();

      if (historyLoadCheckPending) {
        historyLoadCheckPending = false;
        scheduleHistoryPrependCheck(HISTORY_PREPEND_COOLDOWN_MS, true);
      }
    }
  };

  const getHistoryPaginationTargetElements = (): HTMLElement[] => {
    const triggerIndex = getHistoryPrependTriggerIndex();

    if (triggerIndex < 0) {
      return [];
    }

    const startIndex = Math.max(
      0,
      triggerIndex - HISTORY_PREPEND_TRIGGER_BUFFER
    );
    const endIndex = triggerIndex + HISTORY_PREPEND_TRIGGER_BUFFER;

    return (
      messageListUserItemsRef.value?.getRenderedMessageElementsInIndexRange?.(
        startIndex,
        endIndex
      ) || []
    );
  };

  const syncObservedHistoryPaginationTargets = (): void => {
    if (!historyPaginationObserver) {
      return;
    }

    const nextObservedElements = new Set(getHistoryPaginationTargetElements());

    observedHistoryPaginationElements.forEach(element => {
      if (!nextObservedElements.has(element)) {
        historyPaginationObserver?.unobserve(element);
        observedHistoryPaginationElements.delete(element);
      }
    });

    nextObservedElements.forEach(element => {
      if (!observedHistoryPaginationElements.has(element)) {
        historyPaginationObserver?.observe(element);
        observedHistoryPaginationElements.add(element);
      }
    });
  };

  const scheduleObservedHistoryPaginationTargetsSync = (): void => {
    if (observedHistoryPaginationTargetsRafId || historyTargetsSyncTimeoutId) {
      return;
    }

    historyTargetsSyncTimeoutId = setTimeout(() => {
      historyTargetsSyncTimeoutId = null;

      observedHistoryPaginationTargetsRafId = requestAnimationFrame(() => {
        observedHistoryPaginationTargetsRafId = 0;
        syncObservedHistoryPaginationTargets();
      });
    }, HISTORY_TARGET_SYNC_INTERVAL_MS);
  };

  const cancelScheduledHistoryPrependCheck = (): void => {
    if (historyPrependCheckTimeoutId) {
      clearTimeout(historyPrependCheckTimeoutId);
      historyPrependCheckTimeoutId = null;
    }

    if (historyPrependCheckRafId) {
      cancelAnimationFrame(historyPrependCheckRafId);
      historyPrependCheckRafId = 0;
    }
  };

  const scheduleHistoryPrependCheck = (
    minDelay = 0,
    forceReschedule = false
  ): void => {
    if (forceReschedule) {
      cancelScheduledHistoryPrependCheck();
    }

    if (historyPrependCheckRafId || historyPrependCheckTimeoutId) {
      return;
    }

    const delay = Math.max(
      minDelay,
      isVisibleSnapshotNearLoadedStart(getVisibleMessageSnapshot())
        ? 0
        : HISTORY_PREPEND_CHECK_INTERVAL_MS
    );

    historyPrependCheckTimeoutId = setTimeout(() => {
      historyPrependCheckTimeoutId = null;

      historyPrependCheckRafId = requestAnimationFrame(() => {
        historyPrependCheckRafId = 0;
        void loadOlderMessagesFromVisibleAnchor();
      });
    }, delay);
  };

  const setupHistoryPaginationObserver = (): void => {
    const root = chatWrapperRef.value;

    if (!root) {
      historyPaginationObserver?.disconnect();
      historyPaginationObserver = null;
      historyPaginationObserverRoot = null;
      observedHistoryPaginationElements.clear();
      return;
    }

    if (historyPaginationObserver && historyPaginationObserverRoot === root) {
      syncObservedHistoryPaginationTargets();
      scheduleHistoryPrependCheck();
      return;
    }

    historyPaginationObserver?.disconnect();
    observedHistoryPaginationElements.clear();
    historyPaginationObserverRoot = root;

    historyPaginationObserver = new IntersectionObserver(
      entries => {
        const hasVisibleHistoryTarget = entries.some(
          entry => entry.isIntersecting
        );

        if (hasVisibleHistoryTarget) {
          void loadOlderMessagesFromVisibleAnchor();
        }
      },
      {
        root,
        threshold: 0.01,
        rootMargin: '0px'
      }
    );

    nextTick(() => {
      syncObservedHistoryPaginationTargets();
      scheduleHistoryPrependCheck();
    });
  };

  const hasReachedLatestMessage = (): boolean => {
    const latestMessageId = getSelectedTopic(route.value.id)?.lastMessage?.id;
    return (
      !!latestMessageId &&
      state.messages.at(-1)?.id === latestMessageId &&
      scrollAnchor.isNearBottom.value
    );
  };

  const submitReadMessages = async (messageIds: string[], source: string) => {
    if (!messageIds.length || !route.value?.id) return;
    if (!canTrackVisibleMessages()) return;
    const readViewId = viewportTelemetry.getViewId();

    const uniqueMessageIds = Array.from(new Set(messageIds)).filter(
      id => !pendingReadIds.has(id)
    );

    if (!uniqueMessageIds.length) {
      return;
    }

    if (canPreviewVisibleMessagesAsRead()) {
      previewTopicReadMessages(route.value.id, uniqueMessageIds);
    }

    if (!canMarkVisibleMessagesAsRead()) {
      uniqueMessageIds.forEach(id => queuedReadIds.add(id));
      viewportTelemetry.readDecision(source, uniqueMessageIds, 'queued');
      return;
    }

    uniqueMessageIds.forEach(id => {
      pendingReadIds.add(id);
      queuedReadIds.delete(id);
    });

    try {
      viewportTelemetry.readDecision(source, uniqueMessageIds, 'submitted');
      await markAsRead({
        messageIds: uniqueMessageIds,
        topicId: route.value.id,
        reachedEnd: hasReachedLatestMessage()
      });
      if (props.user?.id) {
        changeLocalReadStatus(route.value.id, uniqueMessageIds, props.user.id);
      }
      uniqueMessageIds.forEach(id => {
        pendingReadIds.delete(id);
      });
    } catch (error) {
      viewportTelemetry.readDecision(
        source,
        uniqueMessageIds,
        'failed',
        readViewId
      );
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

    const snapshot = getVisibleMessageSnapshot();
    if (snapshot) {
      return snapshot.visibleMessageIds.filter(
        messageId =>
          !pendingReadIds.has(messageId) &&
          unreadTrackableMessageIds.value.has(messageId)
      );
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
      submitReadMessages(visibleUnreadMessageIds, 'visible_flush');
    }
  };

  const flushQueuedReadMessages = async () => {
    const readViewId = viewportTelemetry.getViewId();
    if (!route.value?.id || queuedReadIds.size === 0) {
      return;
    }

    if (!canMarkVisibleMessagesAsRead()) {
      viewportTelemetry.readDecision(
        'queued_flush',
        [...queuedReadIds],
        'blocked'
      );
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
      viewportTelemetry.readDecision('queued_flush', messageIds, 'submitted');
      await markAsRead({
        messageIds,
        topicId: route.value.id,
        reachedEnd: hasReachedLatestMessage()
      });
      if (props.user?.id) {
        changeLocalReadStatus(route.value.id, messageIds, props.user.id);
      }
      messageIds.forEach(id => {
        pendingReadIds.delete(id);
      });
    } catch (error) {
      viewportTelemetry.readDecision(
        'queued_flush',
        messageIds,
        'failed',
        readViewId
      );
      console.warn('Failed to flush queued read messages:', error);
      messageIds.forEach(id => {
        pendingReadIds.delete(id);
        queuedReadIds.add(id);
      });
    }
  };

  const markAllVisibleAsRead = async () => {
    const readViewId = viewportTelemetry.getViewId();
    if (!canMarkVisibleMessagesAsRead()) {
      viewportTelemetry.readDecision('loaded_window', [], 'blocked');
      return;
    }

    const unreadMessages = state.messages.filter(
      (message: IMessage) =>
        message.senderUserId !== props.user?.id &&
        isUnreadTrackableMessageForUser(message, props.user?.id) &&
        message.isReadByMe !== true
    );

    if (unreadMessages.length === 0) return;

    previewTopicReadMessages(
      route.value.id,
      unreadMessages.map((message: IMessage) => message.id)
    );

    try {
      await clearTopicNotifications(route.value.id);
      if (!canMarkVisibleMessagesAsRead()) return;
      viewportTelemetry.readDecision(
        'loaded_window',
        unreadMessages.map(message => message.id),
        'submitted',
        readViewId
      );
      await markAsRead({
        messageIds: unreadMessages.map((message: IMessage) => message.id),
        topicId: route.value.id,
        reachedEnd: hasReachedLatestMessage()
      });
      if (props.user?.id) {
        changeLocalReadStatus(
          route.value.id,
          unreadMessages.map((message: IMessage) => message.id),
          props.user.id
        );
      }
    } catch (error) {
      viewportTelemetry.readDecision(
        'loaded_window',
        unreadMessages.map(message => message.id),
        'failed',
        readViewId
      );
      console.warn('Failed to mark messages as read:', error);
    }
  };

  const setupIntersectionObserver = () => {
    const root = chatWrapperRef.value;

    setupHistoryPaginationObserver();

    if (!root) {
      intersectionObserver?.disconnect();
      intersectionObserver = null;
      intersectionObserverRoot = null;
      observedReadMessageElements.clear();
      return;
    }

    if (intersectionObserver && intersectionObserverRoot === root) {
      scheduleObservedReadMessageTargetsSync();
      void flushQueuedReadMessages();
      return;
    }

    intersectionObserver?.disconnect();
    observedReadMessageElements.clear();
    intersectionObserverRoot = root;

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
          submitReadMessages(visibleUnreadMessageIds, 'intersection');
        }

        viewportTelemetry.schedule();
        clearVisibleUnreadReaction();
      },
      {
        root,
        threshold: 0.1,
        rootMargin: '0px'
      }
    );

    nextTick(() => {
      if (chatWrapperRef.value) {
        syncObservedReadMessageTargets();

        void flushQueuedReadMessages();
        flushVisibleUnreadMessages();
        clearVisibleUnreadReaction();
      }
    });
  };

  const handleVisibilityChange = () => {
    viewportTelemetry.snapshot(
      document.visibilityState === 'visible' ? 'foreground' : 'background'
    );
    if (document.visibilityState === 'visible') {
      nextTick(() => {
        void flushQueuedReadMessages();
        flushVisibleUnreadMessages();
      });
    }
  };

  const handleWindowFocus = () => {
    viewportTelemetry.schedule();
    nextTick(() => {
      void flushQueuedReadMessages();
      flushVisibleUnreadMessages();
    });
  };

  const flushReadStateFromUserActivity = () => {
    if (!route.value?.id || !canMarkVisibleMessagesAsRead()) {
      return;
    }

    const now = Date.now();

    if (
      now - lastUserActivityReadFlushAt <
      USER_ACTIVITY_READ_FLUSH_INTERVAL_MS
    ) {
      return;
    }

    lastUserActivityReadFlushAt = now;

    requestAnimationFrame(() => {
      void flushQueuedReadMessages();
      flushVisibleUnreadMessages();
    });
  };

  const handleUserActivity = () => {
    flushReadStateFromUserActivity();
  };

  const handleScroll = async (): Promise<void> => {
    if (props.suspended) return;
    const el = chatWrapperRef.value;
    if (!el) return;

    viewportTelemetry.schedule();
    scrollAnchor.onScroll();
    scheduleViewportRevisionUpdate();
    scheduleObservedReadMessageTargetsSync();
    scheduleObservedHistoryPaginationTargetsSync();
    scheduleHistoryPrependCheck();
    schedulePersistScrollMeta();
    scheduleVisibleUnreadReactionCheck();

    const { scrollTop } = el;
    const isMobileViewport = isMobileMessageViewport();
    const hasFreshMobileScrollIntent =
      mobileScrollIntentAt > 0 &&
      Date.now() - mobileScrollIntentAt <= MOBILE_SCROLL_INTENT_TTL_MS;
    const isHistoryScrollIntent =
      !scrollAnchor.isRestoringScroll &&
      scrollTop < scrollState.previousScrollTop - 1 &&
      (!isMobileViewport ||
        (hasFreshMobileScrollIntent && mobileScrollIntent === 'older'));
    const isNewerScrollIntent =
      !scrollAnchor.isRestoringScroll &&
      scrollTop > scrollState.previousScrollTop + 1 &&
      (!isMobileViewport ||
        (hasFreshMobileScrollIntent && mobileScrollIntent === 'newer'));

    if (isHistoryScrollIntent) {
      lastHistoryScrollIntentAt = Date.now();
    }

    scrollState.previousScrollTop = scrollTop;

    if (
      isMobileViewport &&
      isMobileScrollGestureActive &&
      !isMobileTouchActive
    ) {
      scheduleMobileScrollGestureSettle();
    }

    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    const distanceFromBottom = Math.max(0, maxScroll - scrollTop);

    isShowScrollToBottomButton.value = distanceFromBottom > 200;
    syncOlderMessagesLoadingState();
    syncNewerMessagesLoadingState();

    if (isAutoScrollLoading) {
      return;
    }

    if (props.suspended || Date.now() < historyFetchSuspendedUntil.value) {
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
      isNewerScrollIntent &&
      distanceFromBottom < SCROLL_DISTANCE_FOR_REQUEST &&
      !isScrollLoading &&
      !prefetchedNewerAppend &&
      hasNewMessage
    ) {
      isScrollLoading = true;

      const topicId = route.value.id;
      const revision = scrollStateRevision;
      try {
        const lastMessage = state.messages[state.messages.length - 1];
        const latestKnownTopicMessageId =
          getSelectedTopic(route.value.id)?.lastMessage?.id || null;
        const shouldFetchNewerRange =
          !!lastMessage?.id &&
          !!latestKnownTopicMessageId &&
          lastMessage.id !== latestKnownTopicMessageId;

        if (shouldFetchNewerRange) {
          isNewerScrollLoading = true;
          syncNewerMessagesLoadingState();
          preserveViewportForDownPagination = true;

          const result = await fetchMessagesForTopic(topicId, {
            afterMessageId: lastMessage.id,
            skipSave: true,
            forceNetwork: !isMobileViewport
          });
          if (
            route.value.id !== topicId ||
            revision !== scrollStateRevision ||
            state.messages.at(-1)?.id !== lastMessage.id
          )
            return;
          hasNewMessage = result.length > 0;

          if (result.length > 0) {
            if (isMobileViewport) {
              prefetchedNewerAppend = {
                topicId: route.value.id,
                cursorId: lastMessage.id,
                messages: result
              };

              if (!isMobileScrollGestureActive) {
                scheduleMobileScrollGestureSettle();
              }
            } else {
              mergeMessagesForTopic(route.value.id, result, 'append', {
                syncLastMessage: false
              });
            }
          }
        }
      } finally {
        if (revision === scrollStateRevision) {
          completeNewerMessagesLoading();
          isScrollLoading = false;
        }
      }
    }
  };

  const scrollToBottom = async (opts?: {
    preferUnreadMarker?: boolean;
    smooth?: boolean;
    isCurrent?: () => boolean;
  }) => {
    if (props.suspended || !chatWrapperRef.value) return;
    const topicId = route.value.id;
    const isCurrent = () =>
      route.value.id === topicId && (opts?.isCurrent?.() ?? true);
    if (!isCurrent()) return;

    isShowScrollToBottomButton.value = false;

    if (opts?.preferUnreadMarker === true) {
      if (!state.hideUnreadMarker && state.unreadMarkerMessageId) {
        await messageListUserItemsRef.value?.ensureMessageRendered?.(
          state.unreadMarkerMessageId
        );
        await nextTick();
        if (!isCurrent()) return;
      }
      const unreadRef = messageListUserItemsRef.value?.unreadMessageStartRef;
      if (unreadRef?.length > 0) {
        const firstUnread = unreadRef[0];
        const container = chatWrapperRef.value;

        if (container && firstUnread) {
          scrollAnchor.prepareJumpMutation();
          scrollAnchor.setViewportMode('history', { pin: false });
          container.scrollTop +=
            firstUnread.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            8;
          requestAnimationFrame(() => {
            void flushQueuedReadMessages();
            flushVisibleUnreadMessages();
          });
          schedulePersistScrollMeta();
        }

        return;
      }

      if (!state.hideUnreadMarker && state.unreadMarkerMessageId) {
        await messageListUserItemsRef.value?.ensureMessageRendered?.(
          state.unreadMarkerMessageId
        );
        if (!isCurrent()) return;

        const currentMarkerKey = route.value?.id
          ? `${route.value.id}:${state.unreadMarkerMessageId}`
          : state.unreadMarkerMessageId;

        if (scrolledUnreadMarkerKey.value === currentMarkerKey) {
          return;
        }

        const didJumpToUnreadMessage = await scrollAnchor.jumpToMessage(
          state.unreadMarkerMessageId,
          {
            block: 'start',
            behavior: 'auto',
            isCurrent
          }
        );

        if (didJumpToUnreadMessage) {
          scrolledUnreadMarkerKey.value = currentMarkerKey;
          scrollAnchor.setViewportMode('history', { pin: false });
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

  let scrollStateRevision = 0;

  const handleScrollToButton = async (
    isCurrentNavigation = () => true,
    options: {
      smooth?: boolean;
      waitForTransition?: () => Promise<void>;
    } = {}
  ) => {
    const topicId = route.value.id;
    if (!topicId) return;
    resetScrollState();
    const revision = scrollStateRevision;
    const isCurrentTopic = () =>
      route.value.id === topicId &&
      revision === scrollStateRevision &&
      isCurrentNavigation();
    scrollAnchor.prepareJumpMutation();
    isShowScrollToBottomButton.value = false;
    hasOldMessage = true;
    hasNewMessage = true;

    if (getMessagesByTopicId(route.value.id).length === 0) {
      await hydrateMessagesFromCache(topicId);
      if (!isCurrentTopic()) return;
    }

    const latestRequest = fetchMessagesForTopic(topicId, {
      limit: 50,
      newMessages: true,
      syncLastMessage: false,
      skipSave: true,
      forceRefresh: true,
      forceNetwork: true
    });
    const applyLatestWindow = async (messages: IMessage[]) => {
      if (!isCurrentTopic() || !messages.length) return;
      suspendHistoryFetch(1800);
      suspendAutoRead(500);
      scrollAnchor.prepareJumpMutation();
      mergeMessagesForTopic(topicId, messages, 'replace', {
        syncLastMessage: false,
        windowMode: 'latest',
        visibleMessages: messages
      });
      const bufferedMessages = consumeBufferedIncomingMessagesForTopic(topicId);
      if (bufferedMessages.length > 0) {
        mergeMessagesForTopic(topicId, bufferedMessages, 'append', {
          syncLastMessage: false,
          windowMode: 'latest'
        });
      }

      await nextTick();
      if (!isCurrentTopic()) return;
      if (options.smooth === false) {
        scrollAnchor.scrollToBottomInstant();
      } else {
        await scrollAnchor.scrollToBottomSmooth(isCurrentTopic);
      }
      if (!isCurrentTopic()) return;
      isShowScrollToBottomButton.value = false;
      markAllVisibleAsRead();
      schedulePersistScrollMeta();
    };

    const localMessages = getFullMessagesByTopicId(topicId).slice(-50);
    const refreshLatestWindow = async () => {
      const latestMessages = await latestRequest;
      if (localMessages.length) await options.waitForTransition?.();
      if (!isCurrentTopic()) return;
      await applyLatestWindow(latestMessages.slice(-50));
    };
    if (localMessages.length) {
      // Переходим сразу; ответ сети не задерживает появление конца ленты.
      await applyLatestWindow(localMessages);
      void refreshLatestWindow();
    } else {
      await refreshLatestWindow();
    }
  };

  const handleHistoryScrollInteraction = (event: WheelEvent) => {
    const container = chatWrapperRef.value;

    if (!container || !(event.target instanceof Node)) {
      return;
    }

    if (!container.contains(event.target)) {
      return;
    }

    if (event.deltaY >= 0) {
      return;
    }

    lastHistoryScrollIntentAt = Date.now();

    if (isScrollLoading) {
      historyLoadCheckPending = true;
    }
  };

  const clearMobileScrollSettleTimeout = (): void => {
    if (mobileScrollSettleTimeoutId) {
      clearTimeout(mobileScrollSettleTimeoutId);
      mobileScrollSettleTimeoutId = null;
    }
  };

  const applyPrefetchedNewerAppend = (): void => {
    const prefetchedAppend = prefetchedNewerAppend;
    if (!prefetchedAppend) {
      return;
    }

    const currentLastMessageId = state.messages[state.messages.length - 1]?.id;
    if (
      route.value.id !== prefetchedAppend.topicId ||
      currentLastMessageId !== prefetchedAppend.cursorId
    ) {
      prefetchedNewerAppend = null;
      preserveViewportForDownPagination = false;
      hasNewMessage = true;
      return;
    }

    prefetchedNewerAppend = null;
    preserveViewportForDownPagination = true;
    pendingViewportAnchorMessageId =
      getVisibleMessageSnapshot()?.anchorMessageId || null;
    mergeMessagesForTopic(
      prefetchedAppend.topicId,
      prefetchedAppend.messages,
      'append',
      {
        syncLastMessage: false,
        windowMode: 'preserve-end',
        anchorMessageId: pendingViewportAnchorMessageId || undefined,
        visibleLimit: getHistoryVisibleWindowLimit(),
        persistDelayMs: HISTORY_PERSIST_IDLE_DELAY_MS
      }
    );
  };

  const finishMobileScrollGesture = (): void => {
    const settledIntent = mobileScrollIntent;

    clearMobileScrollSettleTimeout();
    isMobileTouchActive = false;
    isMobileScrollGestureActive = false;
    mobileTouchLastY = null;
    mobileScrollIntentAt = 0;

    if (settledIntent === 'newer') {
      applyPrefetchedNewerAppend();
    } else if (settledIntent === 'older' && prefetchedHistoryPrepend) {
      scheduleHistoryPrependCheck(0, true);
    }
  };

  function scheduleMobileScrollGestureSettle(
    delay = MOBILE_SCROLL_IDLE_DELAY_MS
  ): void {
    clearMobileScrollSettleTimeout();
    mobileScrollSettleTimeoutId = setTimeout(() => {
      mobileScrollSettleTimeoutId = null;
      finishMobileScrollGesture();
    }, delay);
  }

  const handleTouchStart = (event: TouchEvent): void => {
    if (!isMobileMessageViewport()) {
      return;
    }

    clearMobileScrollSettleTimeout();
    isMobileTouchActive = true;
    isMobileScrollGestureActive = true;
    mobileTouchLastY =
      event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent): void => {
    if (!isMobileMessageViewport() || !isMobileTouchActive) {
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (currentY === undefined || mobileTouchLastY === null) {
      return;
    }

    const deltaY = currentY - mobileTouchLastY;
    mobileTouchLastY = currentY;

    if (Math.abs(deltaY) < MOBILE_TOUCH_DIRECTION_THRESHOLD_PX) {
      return;
    }

    mobileScrollIntent = deltaY > 0 ? 'older' : 'newer';
    mobileScrollIntentAt = Date.now();

    if (mobileScrollIntent === 'older') {
      lastHistoryScrollIntentAt = mobileScrollIntentAt;

      if (isScrollLoading) {
        historyLoadCheckPending = true;
      }
    }
  };

  const handleTouchEnd = (): void => {
    if (!isMobileMessageViewport()) {
      return;
    }

    isMobileTouchActive = false;
    mobileTouchLastY = null;
    scheduleMobileScrollGestureSettle();
  };

  const handleTouchCancel = (): void => {
    if (!isMobileMessageViewport()) {
      return;
    }

    finishMobileScrollGesture();
  };

  const handleScrollEnd = (): void => {
    if (!isMobileMessageViewport() || isMobileTouchActive) {
      return;
    }

    scheduleMobileScrollGestureSettle();
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
      if (props.suspended || (route.value && route.value.type === 'AI')) return;

      if (oldLength === 0 && newLength > 0) {
        scrollState.shouldAutoScroll = true;
      }
    },
    { immediate: true }
  );

  watch(
    messageIds,
    (newIds, oldIds) => {
      if (props.suspended) return;
      if (!oldIds || !chatWrapperRef.value) {
        pendingMessagesMutationRevision = null;
        pendingViewportAnchorMessageId = null;
        return;
      }

      if (
        newIds.length === oldIds.length &&
        newIds.every((messageId, index) => messageId === oldIds[index])
      ) {
        return;
      }

      const oldSet = new Set(oldIds);
      const hasNew = newIds.some(id => !oldSet.has(id));
      const firstOldIndex = oldIds.length > 0 ? newIds.indexOf(oldIds[0]) : -1;
      const lastOldIndex =
        oldIds.length > 0 ? newIds.indexOf(oldIds[oldIds.length - 1]) : -1;
      const isPrepend = hasNew && oldIds.length > 0 && firstOldIndex > 0;
      const isAppend =
        hasNew &&
        oldIds.length > 0 &&
        lastOldIndex >= 0 &&
        lastOldIndex < newIds.length - 1;

      const reason = isPrepend ? 'prepend' : isAppend ? 'append' : 'replace';
      const isAtBottomBeforeMutation = isAppend
        ? scrollAnchor.isAtBottom()
        : false;
      const shouldPinAppendToBottom = shouldPinMessageAppendToBottom({
        isAppend,
        preserveViewportForDownPagination,
        isUserScrolling: scrollState.isUserScrolling,
        viewportMode: scrollAnchor.viewportMode.value,
        isAtBottom: isAtBottomBeforeMutation,
        isNearBottom: scrollAnchor.isNearBottom.value
      });
      const shouldPreserveAppendViewport =
        reason === 'append' && !shouldPinAppendToBottom;
      const mutation = scrollAnchor.beginViewportMutation(reason, {
        forcePreserve: reason === 'prepend' || shouldPreserveAppendViewport,
        forcePinBottom: shouldPinAppendToBottom,
        preferredMessageId: pendingViewportAnchorMessageId || undefined
      });

      pendingMessagesMutationRevision = mutation.revision;
    },
    { flush: 'pre' }
  );

  watch(
    messageIds,
    () => {
      if (pendingMessagesMutationRevision === null) {
        return;
      }

      const commitPendingViewportMutation = (): void => {
        if (pendingMessagesMutationRevision === null) {
          return;
        }

        scrollAnchor.commitViewportMutation(pendingMessagesMutationRevision);
        pendingMessagesMutationRevision = null;
      };

      commitPendingViewportMutation();

      nextTick(() => {
        commitPendingViewportMutation();

        preserveViewportForDownPagination = false;
        pendingViewportAnchorMessageId = null;
        scheduleObservedReadMessageTargetsSync();
        scheduleObservedHistoryPaginationTargetsSync();
        scheduleHistoryPrependCheck();
      });
    },
    { flush: 'post' }
  );

  const resetScrollState = () => {
    scrollStateRevision += 1;
    isScrollLoading = false;
    hasOldMessage = true;
    hasNewMessage = true;
    isHistoryScrollLoading = false;
    isNewerScrollLoading = false;
    hideOlderMessagesLoading(true);
    hideNewerMessagesLoading(true);
    pendingReadIds.clear();
    scrolledUnreadMarkerKey.value = null;
    pendingMessagesMutationRevision = null;
    pendingViewportAnchorMessageId = null;
    preserveViewportForDownPagination = false;
    prefetchedHistoryPrepend = null;
    prefetchedNewerAppend = null;
    historyLoadCheckPending = false;
    lastHistoryPrependAt = 0;
    lastHistoryScrollIntentAt = 0;
    clearMobileScrollSettleTimeout();
    isMobileTouchActive = false;
    isMobileScrollGestureActive = false;
    mobileTouchLastY = null;
    mobileScrollIntent = 'none';
    mobileScrollIntentAt = 0;
    isShowScrollToBottomButton.value = false;
    scrollState.isInitialLoad = true;
    scrollState.isUserScrolling = false;
    scrollState.previousScrollTop = 0;
    scrollState.shouldAutoScroll = true;
    scrollAnchor.setViewportMode('live', { pin: false });
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
    viewportTelemetry.schedule();

    if (enabled) {
      void flushQueuedReadMessages();
    }
  };

  let suspendedViewport: { top: number; anchor: ScrollAnchor | null } | null =
    null;
  watch(
    () => props.suspended,
    suspended => {
      if (suspended) {
        suspendedViewport = {
          top: chatWrapperRef.value?.scrollTop || 0,
          anchor: scrollAnchor.captureViewportAnchor()
        };
        scrollAnchor.setViewportMode('history', { pin: false });
        queuedReadIds.clear();
        pendingReadIds.clear();
        intersectionObserver?.disconnect();
        historyPaginationObserver?.disconnect();
        setTopicNearBottomState(route.value.id, false);
      } else
        nextTick(() => {
          if (suspendedViewport && chatWrapperRef.value) {
            if (!scrollAnchor.restoreViewportAnchor(suspendedViewport.anchor))
              chatWrapperRef.value.scrollTop = suspendedViewport.top;
            suspendedViewport = null;
          }
          setTopicNearBottomState(route.value.id, scrollAnchor.isAtBottom());
          setupIntersectionObserver();
          flushVisibleUnreadMessages();
        });
    },
    { flush: 'sync' }
  );

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pointermove', handleUserActivity, {
      passive: true
    });
    window.addEventListener('pointerdown', handleUserActivity, {
      passive: true
    });
    window.addEventListener('keydown', handleUserActivity, true);
    window.addEventListener('touchstart', handleUserActivity, {
      passive: true
    });
    window.addEventListener('wheel', handleHistoryScrollInteraction, {
      passive: true
    });
  });

  onUnmounted(() => {
    if (trackedViewportTopicId) {
      clearTopicNearBottomState(trackedViewportTopicId);
      clearTopicMessageVisibilityChecker(trackedViewportTopicId);
    }

    if (autoReadResumeTimeout) {
      clearTimeout(autoReadResumeTimeout);
      autoReadResumeTimeout = null;
    }

    if (observedMessageTargetsRafId) {
      cancelAnimationFrame(observedMessageTargetsRafId);
      observedMessageTargetsRafId = 0;
    }

    if (viewportRevisionRafId) {
      cancelAnimationFrame(viewportRevisionRafId);
      viewportRevisionRafId = 0;
    }

    if (unreadReactionCheckRafId) {
      cancelAnimationFrame(unreadReactionCheckRafId);
      unreadReactionCheckRafId = 0;
    }

    window.removeEventListener('wheel', handleHistoryScrollInteraction);
    clearMobileScrollSettleTimeout();

    if (readTargetsSyncTimeoutId) {
      clearTimeout(readTargetsSyncTimeoutId);
      readTargetsSyncTimeoutId = null;
    }

    if (viewportRevisionSyncTimeoutId) {
      clearTimeout(viewportRevisionSyncTimeoutId);
      viewportRevisionSyncTimeoutId = null;
    }

    if (unreadReactionCheckTimeoutId) {
      clearTimeout(unreadReactionCheckTimeoutId);
      unreadReactionCheckTimeoutId = null;
    }

    clearOlderMessagesLoadingHideTimeout();
    clearNewerMessagesLoadingHideTimeout();

    if (observedHistoryPaginationTargetsRafId) {
      cancelAnimationFrame(observedHistoryPaginationTargetsRafId);
      observedHistoryPaginationTargetsRafId = 0;
    }

    if (historyTargetsSyncTimeoutId) {
      clearTimeout(historyTargetsSyncTimeoutId);
      historyTargetsSyncTimeoutId = null;
    }

    if (historyPrependCheckRafId) {
      cancelAnimationFrame(historyPrependCheckRafId);
      historyPrependCheckRafId = 0;
    }

    if (historyPrependCheckTimeoutId) {
      clearTimeout(historyPrependCheckTimeoutId);
      historyPrependCheckTimeoutId = null;
    }

    intersectionObserver?.disconnect();
    historyPaginationObserver?.disconnect();
    intersectionObserverRoot = null;
    historyPaginationObserverRoot = null;
    observedReadMessageElements.clear();
    observedHistoryPaginationElements.clear();

    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('pointermove', handleUserActivity);
    window.removeEventListener('pointerdown', handleUserActivity);
    window.removeEventListener('keydown', handleUserActivity, true);
    window.removeEventListener('touchstart', handleUserActivity);
  });

  return {
    isShowScrollToBottomButton,
    viewportRevision,
    isLoadingInitialMessages,
    isLoadingOlderMessages,
    isLoadingNewerMessages,
    scrollState,
    handleScroll,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleScrollEnd,
    scrollToBottom,
    handleScrollToButton,
    setupIntersectionObserver,
    flushVisibleUnreadMessages,
    markAllVisibleAsRead,
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
