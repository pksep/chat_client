import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue';

export interface ScrollAnchor {
  messageId: string;
  relativeTop: number;
}

interface UseScrollAnchorOptions {
  containerRef: Ref<HTMLElement | null>;
  bottomThreshold?: number;
  bottomLockThreshold?: number;
  messageSelector?: string;
  getViewportAnchor?: (preferredMessageId?: string) => ScrollAnchor | null;
}

type ViewportMode = 'live' | 'history' | 'jump';
type MutationReason = 'prepend' | 'append' | 'replace' | 'unknown';

interface PendingViewportMutation {
  anchor: ScrollAnchor | null;
  preserveViewport: boolean;
  pinToBottom: boolean;
  revision: number;
  reason: MutationReason;
  scrollHeight: number;
  scrollTop: number;
  startedAt: number;
}

/**
 * Maintains one scroll invariant: a structural list mutation either keeps the
 * same visible message at the same viewport coordinate or keeps the live edge
 * pinned to the bottom. Media reflows are intentionally left to native scroll
 * anchoring while reading history.
 */
export function useScrollAnchor(options: UseScrollAnchorOptions) {
  const {
    containerRef,
    bottomThreshold = 72,
    bottomLockThreshold = 4,
    messageSelector = '[data-message-id]',
    getViewportAnchor
  } = options;

  const viewportMode = ref<ViewportMode>('live');
  const isNearBottom = ref(true);

  let pendingMutation: PendingViewportMutation | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let observedContainer: HTMLElement | null = null;
  let observedViewport: HTMLElement | null = null;
  let viewportHeight = 0;
  let viewportWidth = 0;
  let contentScrollHeight = 0;
  let observedContent: HTMLElement | null = null;
  let userScrollIntentElement: HTMLElement | null = null;
  let isRestoringScroll = false;
  let internalScrollUnlockRafId = 0;
  let scrollRafId = 0;
  let restoreRafId = 0;
  let resizeRafId = 0;
  let anchorRestoreToken = 0;
  let revision = 0;
  let lastUserScrollIntentAt = 0;

  const smoothTailDistancePx = 120;
  const smoothSettleDelayMs = 220;

  const getMessageSelector = (messageId: string): string => {
    const escapedMessageId = window.CSS?.escape
      ? window.CSS.escape(messageId)
      : messageId.replace(/["\\]/g, '\\$&');

    return `[data-message-id="${escapedMessageId}"]`;
  };

  const getContainerMetrics = () => {
    const container = containerRef.value;
    if (!container) {
      return null;
    }

    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    const scrollTop = Math.min(maxScroll, Math.max(0, container.scrollTop));

    return {
      container,
      maxScroll,
      scrollTop,
      distanceFromBottom: maxScroll - scrollTop,
      distanceFromTop: scrollTop
    };
  };

  const getMessageElements = (): HTMLElement[] => {
    const container = containerRef.value;
    if (!container) {
      return [];
    }

    return Array.from(container.querySelectorAll(messageSelector)).filter(
      (element): element is HTMLElement => element instanceof HTMLElement
    );
  };

  const updateBottomState = (): boolean => {
    const metrics = getContainerMetrics();
    const nearBottom =
      !metrics || metrics.distanceFromBottom <= bottomThreshold;
    const lockedToBottom =
      !metrics || metrics.distanceFromBottom <= bottomLockThreshold;

    isNearBottom.value = nearBottom;
    if (lockedToBottom && viewportMode.value !== 'jump') {
      viewportMode.value = 'live';
    }

    return lockedToBottom;
  };

  const findVisibleAnchor = (
    preferredMessageId?: string
  ): ScrollAnchor | null => {
    const container = containerRef.value;
    if (!container) {
      return null;
    }

    const indexedAnchor = getViewportAnchor?.(preferredMessageId);
    if (indexedAnchor) {
      return indexedAnchor;
    }

    const containerRect = container.getBoundingClientRect();
    let bestCandidate: ScrollAnchor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of getMessageElements()) {
      const messageId = element.dataset.messageId;
      if (!messageId) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (
        rect.bottom <= containerRect.top ||
        rect.top >= containerRect.bottom
      ) {
        continue;
      }

      const relativeTop = rect.top - containerRect.top;
      if (preferredMessageId && messageId === preferredMessageId) {
        return { messageId, relativeTop };
      }

      if (relativeTop < -rect.height * 0.75) {
        continue;
      }

      const distance = Math.abs(relativeTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCandidate = { messageId, relativeTop };
      }
    }

    return bestCandidate;
  };

  const captureViewportAnchor = (
    preferredMessageId?: string
  ): ScrollAnchor | null => {
    const anchor = findVisibleAnchor(preferredMessageId);
    return anchor;
  };

  const setInternalScrollLock = (): void => {
    isRestoringScroll = true;

    if (internalScrollUnlockRafId) {
      cancelAnimationFrame(internalScrollUnlockRafId);
    }

    internalScrollUnlockRafId = requestAnimationFrame(() => {
      internalScrollUnlockRafId = 0;
      isRestoringScroll = false;
    });
  };

  const hasUserScrollIntentAfter = (startedAt: number): boolean =>
    lastUserScrollIntentAt > startedAt;

  const cancelScheduledAnchorRestore = (): void => {
    anchorRestoreToken += 1;
    if (restoreRafId) {
      cancelAnimationFrame(restoreRafId);
      restoreRafId = 0;
    }
  };

  const markUserScrollIntent = (): void => {
    lastUserScrollIntentAt = performance.now();
    cancelScheduledAnchorRestore();
  };

  const markHistoryScrollIntent = (): void => {
    markUserScrollIntent();
    if (viewportMode.value !== 'jump') {
      viewportMode.value = 'history';
    }
  };

  const restoreAnchorPosition = (anchor: ScrollAnchor | null): boolean => {
    const container = containerRef.value;
    if (!container || !anchor) {
      return false;
    }

    const anchorElement = container.querySelector(
      getMessageSelector(anchor.messageId)
    );
    if (!(anchorElement instanceof HTMLElement)) {
      return false;
    }

    const currentRelativeTop =
      anchorElement.getBoundingClientRect().top -
      container.getBoundingClientRect().top;
    const drift = currentRelativeTop - anchor.relativeTop;

    if (Math.abs(drift) <= 0.5) {
      return true;
    }

    setInternalScrollLock();
    container.scrollTop += drift;
    return true;
  };

  const restoreMutationSnapshot = (
    mutation: PendingViewportMutation
  ): boolean => {
    const container = containerRef.value;
    if (!container || mutation.reason !== 'prepend') {
      return false;
    }

    const heightDelta = container.scrollHeight - mutation.scrollHeight;
    if (!Number.isFinite(heightDelta)) {
      return false;
    }

    const targetScrollTop = mutation.scrollTop + heightDelta;
    if (Math.abs(container.scrollTop - targetScrollTop) <= 0.5) {
      return true;
    }

    setInternalScrollLock();
    container.scrollTop = targetScrollTop;
    return true;
  };

  const keepBottomPinned = (behavior: ScrollBehavior = 'auto'): void => {
    const metrics = getContainerMetrics();
    if (!metrics) {
      return;
    }

    if (
      behavior === 'auto' &&
      Math.abs(metrics.container.scrollTop - metrics.maxScroll) <= 0.5
    ) {
      isNearBottom.value = true;
      if (viewportMode.value !== 'jump') {
        viewportMode.value = 'live';
      }
      return;
    }

    setInternalScrollLock();
    metrics.container.scrollTo({ top: metrics.maxScroll, behavior });
    isNearBottom.value = true;
    if (viewportMode.value !== 'jump') {
      viewportMode.value = 'live';
    }
  };

  const scheduleMutationRestore = (
    mutation: PendingViewportMutation,
    anchor: ScrollAnchor | null
  ): void => {
    cancelScheduledAnchorRestore();
    const token = ++anchorRestoreToken;

    nextTick(() => {
      if (token !== anchorRestoreToken) {
        return;
      }

      restoreRafId = requestAnimationFrame(() => {
        restoreRafId = 0;
        if (
          token !== anchorRestoreToken ||
          hasUserScrollIntentAfter(mutation.startedAt)
        ) {
          return;
        }

        if (mutation.pinToBottom) {
          keepBottomPinned('auto');
          return;
        }

        if (mutation.preserveViewport) {
          if (!restoreAnchorPosition(anchor)) {
            restoreMutationSnapshot(mutation);
          }
          updateBottomState();
        }
      });
    });
  };

  const beginViewportMutation = (
    reason: MutationReason = 'unknown',
    mutationOptions?: {
      forcePreserve?: boolean;
      forcePinBottom?: boolean;
      preferredMessageId?: string;
    }
  ): PendingViewportMutation => {
    revision += 1;

    const atBottomBeforeMutation = updateBottomState();
    const preserveViewport =
      mutationOptions?.forcePreserve ??
      (!atBottomBeforeMutation ||
        viewportMode.value === 'history' ||
        viewportMode.value === 'jump');
    const anchor = preserveViewport
      ? captureViewportAnchor(mutationOptions?.preferredMessageId)
      : null;

    pendingMutation = {
      anchor,
      preserveViewport,
      pinToBottom:
        mutationOptions?.forcePinBottom ??
        (!preserveViewport && atBottomBeforeMutation),
      revision,
      reason,
      scrollHeight: containerRef.value?.scrollHeight || 0,
      scrollTop: containerRef.value?.scrollTop || 0,
      startedAt: performance.now()
    };
    if (preserveViewport && viewportMode.value !== 'jump') {
      viewportMode.value = 'history';
    }

    return pendingMutation;
  };

  const commitViewportMutation = (
    expectedRevision?: number,
    commitOptions?: {
      behavior?: ScrollBehavior;
      forceAnchor?: ScrollAnchor | null;
    }
  ): void => {
    const mutation = pendingMutation;
    if (
      !mutation ||
      (expectedRevision !== undefined && mutation.revision !== expectedRevision)
    ) {
      return;
    }

    pendingMutation = null;
    const anchor = commitOptions?.forceAnchor ?? mutation.anchor;

    if (mutation.preserveViewport) {
      if (!restoreAnchorPosition(anchor)) {
        restoreMutationSnapshot(mutation);
      }
    } else if (mutation.pinToBottom) {
      keepBottomPinned(commitOptions?.behavior || 'auto');
    }

    scheduleMutationRestore(mutation, anchor);
  };

  const scrollWithSmoothTail = async (
    requestedTop: number,
    behavior: ScrollBehavior = 'smooth',
    isCurrent = () => true
  ): Promise<void> => {
    const metrics = getContainerMetrics();
    if (!metrics) {
      return;
    }

    const finalTop = Math.min(metrics.maxScroll, Math.max(0, requestedTop));
    const delta = finalTop - metrics.container.scrollTop;
    const scrollToTop = (top: number, scrollBehavior: ScrollBehavior): void => {
      if (!isCurrent()) return;
      setInternalScrollLock();
      metrics.container.scrollTo({ top, behavior: scrollBehavior });
    };

    if (
      behavior !== 'smooth' ||
      !Number.isFinite(delta) ||
      Math.abs(delta) <= smoothTailDistancePx
    ) {
      scrollToTop(finalTop, behavior);
      updateBottomState();
      return;
    }

    const nearTargetTop = finalTop - Math.sign(delta) * smoothTailDistancePx;
    scrollToTop(nearTargetTop, 'auto');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    scrollToTop(finalTop, 'smooth');
    await new Promise<void>(resolve =>
      setTimeout(resolve, smoothSettleDelayMs)
    );
    if (!isCurrent()) return;
    scrollToTop(finalTop, 'auto');
    updateBottomState();
  };

  const getMessageTargetTop = (
    messageElement: HTMLElement,
    block: ScrollLogicalPosition
  ): number | null => {
    const container = containerRef.value;
    if (!container) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const messageRect = messageElement.getBoundingClientRect();
    const relativeTop = messageRect.top - containerRect.top;

    if (block === 'start') {
      return container.scrollTop + relativeTop;
    }
    if (block === 'end') {
      return (
        container.scrollTop +
        relativeTop -
        (container.clientHeight - messageRect.height)
      );
    }

    return (
      container.scrollTop +
      relativeTop -
      (container.clientHeight - messageRect.height) / 2
    );
  };

  const scrollToBottomSmooth = async (
    isCurrent = () => true
  ): Promise<void> => {
    viewportMode.value = 'live';
    const metrics = getContainerMetrics();
    await scrollWithSmoothTail(metrics?.maxScroll || 0, 'smooth', isCurrent);
  };

  const scrollToBottomInstant = (): void => {
    viewportMode.value = 'live';
    keepBottomPinned('auto');
  };

  const getContentElement = (): HTMLElement | null => {
    const container = containerRef.value;
    if (!container) {
      return null;
    }

    return (
      Array.from(container.children).find(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element.classList.contains('chat__message-bubble')
      ) || null
    );
  };

  const syncResizeTarget = (): void => {
    const container = containerRef.value;
    if (container !== observedViewport) {
      if (observedViewport) {
        resizeObserver?.unobserve(observedViewport);
      }
      observedViewport = container;
      viewportHeight = container?.clientHeight || 0;
      viewportWidth = container?.clientWidth || 0;
      contentScrollHeight = container?.scrollHeight || 0;
      if (container) {
        resizeObserver?.observe(container);
      }
    }

    const content = getContentElement();
    if (content === observedContent) {
      return;
    }

    if (observedContent) {
      resizeObserver?.unobserve(observedContent);
    }
    observedContent = content;
    if (content) {
      resizeObserver?.observe(content);
    }
  };

  const syncScrollGeometry = (): boolean => {
    const container = containerRef.value;
    if (
      !container ||
      (container.clientHeight === viewportHeight &&
        container.clientWidth === viewportWidth &&
        container.scrollHeight === contentScrollHeight)
    ) {
      return false;
    }

    viewportHeight = container.clientHeight;
    viewportWidth = container.clientWidth;
    contentScrollHeight = container.scrollHeight;
    if (viewportMode.value === 'live') {
      keepBottomPinned('auto');
    }
    return true;
  };

  const handleContentResize = (entries: ResizeObserverEntry[]): void => {
    // Клавиатура меняет высоту окна, но не длинной ленты сообщений.
    // Удерживаем её нижний край до отрисовки нового размера окна.
    if (entries.some(entry => entry.target === observedViewport)) {
      syncScrollGeometry();
      if (viewportMode.value === 'live') {
        keepBottomPinned('auto');
      } else {
        updateBottomState();
      }
    }

    if (resizeRafId || isRestoringScroll) {
      return;
    }

    resizeRafId = requestAnimationFrame(() => {
      resizeRafId = 0;
      if (viewportMode.value === 'live') {
        keepBottomPinned('auto');
      } else {
        updateBottomState();
      }
    });
  };

  const setupResizeObserver = (): void => {
    const container = containerRef.value;
    if (!container) {
      return;
    }

    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(handleContentResize);
    }

    syncResizeTarget();
  };

  const setupMutationObserver = (): void => {
    const container = containerRef.value;
    if (!container || observedContainer === container) {
      return;
    }

    mutationObserver?.disconnect();
    observedContainer = container;
    mutationObserver = new MutationObserver(() => {
      syncResizeTarget();
    });
    mutationObserver.observe(container, { childList: true });
  };

  const cleanupUserScrollIntentListeners = (): void => {
    const container = userScrollIntentElement;
    if (!container) {
      return;
    }

    container.removeEventListener('wheel', markHistoryScrollIntent);
    container.removeEventListener('touchstart', markUserScrollIntent);
    container.removeEventListener('touchmove', markHistoryScrollIntent);
    container.removeEventListener('pointerdown', markUserScrollIntent);
    container.removeEventListener('keydown', markHistoryScrollIntent);
    userScrollIntentElement = null;
  };

  const setupUserScrollIntentListeners = (): void => {
    const container = containerRef.value;
    if (!container || userScrollIntentElement === container) {
      return;
    }

    cleanupUserScrollIntentListeners();
    userScrollIntentElement = container;
    container.addEventListener('wheel', markHistoryScrollIntent, {
      passive: true
    });
    container.addEventListener('touchstart', markUserScrollIntent, {
      passive: true
    });
    container.addEventListener('touchmove', markHistoryScrollIntent, {
      passive: true
    });
    container.addEventListener('pointerdown', markUserScrollIntent, {
      passive: true
    });
    container.addEventListener('keydown', markHistoryScrollIntent);
  };

  const initialize = (): void => {
    setupResizeObserver();
    setupMutationObserver();
    setupUserScrollIntentListeners();
    updateBottomState();
  };

  const cleanup = (): void => {
    cancelScheduledAnchorRestore();
    if (internalScrollUnlockRafId) {
      cancelAnimationFrame(internalScrollUnlockRafId);
      internalScrollUnlockRafId = 0;
    }
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = 0;
    }
    if (resizeRafId) {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = 0;
    }

    resizeObserver?.disconnect();
    resizeObserver = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
    observedContainer = null;
    observedViewport = null;
    observedContent = null;
    cleanupUserScrollIntentListeners();
  };

  const onScroll = (): void => {
    if (scrollRafId) {
      return;
    }

    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = 0;
      // Scroll может прийти раньше ResizeObserver. Трансформация содержимого
      // меняет scrollHeight вообще без resize: это не переход пользователя в историю.
      syncScrollGeometry();
      if (updateBottomState()) {
        return;
      }

      if (!isRestoringScroll && viewportMode.value !== 'jump') {
        viewportMode.value = 'history';
      }
    });
  };

  const waitForMessageElement = async (
    messageId: string,
    maxFrames = 6
  ): Promise<HTMLElement | null> => {
    const findElement = (): HTMLElement | null => {
      const element = containerRef.value?.querySelector(
        getMessageSelector(messageId)
      );
      return element instanceof HTMLElement ? element : null;
    };

    let element = findElement();
    for (let frame = 0; !element && frame < maxFrames; frame += 1) {
      await nextTick();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      element = findElement();
    }
    return element;
  };

  const jumpToMessage = async (
    messageId: string,
    jumpOptions?: {
      block?: ScrollLogicalPosition;
      behavior?: ScrollBehavior;
      highlightClassName?: string;
      highlightDurationMs?: number;
      targetElement?: HTMLElement | null;
      isCurrent?: () => boolean;
    }
  ): Promise<boolean> => {
    if (!containerRef.value) {
      return false;
    }

    const messageElement = await waitForMessageElement(messageId);
    if (!messageElement || jumpOptions?.isCurrent?.() === false) {
      return false;
    }

    cancelScheduledAnchorRestore();
    viewportMode.value = 'jump';
    const targetTop = getMessageTargetTop(
      jumpOptions?.targetElement || messageElement,
      jumpOptions?.block || 'center'
    );
    if (targetTop === null) {
      return false;
    }

    const container = containerRef.value;
    const finalTop = Math.min(
      Math.max(0, container.scrollHeight - container.clientHeight),
      Math.max(0, targetTop)
    );
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? 'instant'
      : jumpOptions?.behavior || 'auto';
    const startedAt = performance.now();
    setInternalScrollLock();
    // Один плавный переход сразу к фрагменту, без мгновенного переноса и доводки.
    container.scrollTo({ top: finalTop, behavior });
    if (behavior === 'smooth') {
      await new Promise<void>(resolve => {
        let previousTop = container.scrollTop;
        let stableFrames = 0;
        const waitForScroll = (): void => {
          const currentTop = container.scrollTop;
          stableFrames =
            Math.abs(currentTop - previousTop) < 0.5 ? stableFrames + 1 : 0;
          previousTop = currentTop;
          const elapsed = performance.now() - startedAt;
          if (
            jumpOptions?.isCurrent?.() === false ||
            hasUserScrollIntentAfter(startedAt) ||
            (elapsed > 100 && stableFrames >= 3) ||
            elapsed >= 1500
          ) {
            resolve();
            return;
          }
          requestAnimationFrame(waitForScroll);
        };
        requestAnimationFrame(waitForScroll);
      });
    }
    if (jumpOptions?.isCurrent?.() === false) return false;

    if (jumpOptions?.highlightClassName) {
      messageElement.classList.add(jumpOptions.highlightClassName);
      setTimeout(() => {
        messageElement.classList.remove(jumpOptions.highlightClassName || '');
      }, jumpOptions.highlightDurationMs ?? 1000);
    }

    requestAnimationFrame(updateBottomState);
    return true;
  };

  const prepareJumpMutation = (): void => {
    cancelScheduledAnchorRestore();
    viewportMode.value = 'jump';
  };

  const setViewportMode = (
    mode: ViewportMode,
    modeOptions?: { pin?: boolean }
  ): void => {
    viewportMode.value = mode;
    if (mode === 'live') {
      if (modeOptions?.pin !== false) {
        keepBottomPinned('auto');
      }
    }
  };

  onMounted(() => {
    nextTick(initialize);
  });

  onUnmounted(cleanup);

  return {
    viewportMode,
    isNearBottom,
    isAtBottom: updateBottomState,
    hasUserScrollIntentAfter,
    scrollToBottomSmooth,
    scrollToBottomInstant,
    initialize,
    onScroll,
    captureViewportAnchor,
    beginViewportMutation,
    commitViewportMutation,
    jumpToMessage,
    prepareJumpMutation,
    setViewportMode,
    get isRestoringScroll() {
      return isRestoringScroll;
    }
  };
}
