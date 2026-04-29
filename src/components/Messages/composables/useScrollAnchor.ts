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
}

type ViewportMode = 'live' | 'history' | 'jump';
type MutationReason =
  | 'prepend'
  | 'append'
  | 'replace'
  | 'realtime'
  | 'jump'
  | 'unknown';

interface PendingViewportMutation {
  anchor: ScrollAnchor | null;
  preserveViewport: boolean;
  pinToBottom: boolean;
  revision: number;
  reason: MutationReason;
}

export function useScrollAnchor(options: UseScrollAnchorOptions) {
  const {
    containerRef,
    bottomThreshold = 72,
    bottomLockThreshold = 4,
    messageSelector = '[data-message-id]'
  } = options;

  const viewportMode = ref<ViewportMode>('live');
  const isNearBottom = ref(true);

  let savedAnchor: ScrollAnchor | null = null;
  let stickyAnchor: ScrollAnchor | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let isRestoringScroll = false;
  let restoreRafId = 0;
  let scrollRafId = 0;
  let revision = 0;
  let pendingMutation: PendingViewportMutation | null = null;
  let forceNoPreserveForNextMutation = false;
  let forceNoPinBottomForNextMutation = false;
  const smoothTailDistancePx = 120;
  const smoothSettleDelayMs = 220;

  const getContainerMetrics = () => {
    const container = containerRef.value;
    if (!container) {
      return null;
    }

    const maxScroll = Math.max(
      0,
      container.scrollHeight - container.clientHeight
    );
    const normalizedScrollTop = Math.min(container.scrollTop, 0);

    return {
      container,
      maxScroll,
      distanceFromBottom: Math.abs(normalizedScrollTop),
      distanceFromTop: maxScroll + normalizedScrollTop
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
      stickyAnchor = null;
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

    const containerRect = container.getBoundingClientRect();
    const messageElements = getMessageElements();
    let bestCandidate: ScrollAnchor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const element of messageElements) {
      const messageId = element.dataset.messageId;
      if (!messageId) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      const isVisible =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom;

      if (!isVisible) {
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
    const nextAnchor = findVisibleAnchor(preferredMessageId);
    if (!nextAnchor) {
      return null;
    }

    stickyAnchor = nextAnchor;
    return nextAnchor;
  };

  const setInternalScrollLock = () => {
    isRestoringScroll = true;
    requestAnimationFrame(() => {
      isRestoringScroll = false;
    });
  };

  const restoreAnchorPosition = (anchor: ScrollAnchor | null): boolean => {
    const container = containerRef.value;
    if (!container || !anchor) {
      return false;
    }

    const anchorElement = container.querySelector(
      `[data-message-id="${anchor.messageId}"]`
    );

    if (!(anchorElement instanceof HTMLElement)) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = anchorElement.getBoundingClientRect();
    const currentRelativeTop = elementRect.top - containerRect.top;
    const drift = currentRelativeTop - anchor.relativeTop;

    if (Math.abs(drift) <= 0.5) {
      return true;
    }

    setInternalScrollLock();
    container.scrollTop -= drift;

    return true;
  };

  const scheduleAnchorRestore = (anchor: ScrollAnchor | null) => {
    if (!anchor) {
      return;
    }

    if (restoreRafId) {
      cancelAnimationFrame(restoreRafId);
      restoreRafId = 0;
    }

    nextTick(() => {
      restoreAnchorPosition(anchor);
      restoreRafId = requestAnimationFrame(() => {
        restoreAnchorPosition(anchor);
        restoreRafId = requestAnimationFrame(() => {
          restoreAnchorPosition(anchor);
          restoreRafId = 0;
          stickyAnchor = captureViewportAnchor(anchor.messageId) || anchor;
          updateBottomState();
        });
      });
    });
  };

  const beginViewportMutation = (
    reason: MutationReason = 'unknown',
    options?: {
      forcePreserve?: boolean;
      forcePinBottom?: boolean;
      preferredMessageId?: string;
    }
  ): PendingViewportMutation => {
    revision += 1;

    const atBottomBeforeMutation = updateBottomState();
    const preserveViewport =
      options?.forcePreserve ??
      (forceNoPreserveForNextMutation
        ? false
        : !atBottomBeforeMutation ||
          viewportMode.value === 'history' ||
          viewportMode.value === 'jump');
    const nextAnchor = preserveViewport
      ? captureViewportAnchor(options?.preferredMessageId)
      : null;
    forceNoPreserveForNextMutation = false;

    pendingMutation = {
      anchor: nextAnchor,
      preserveViewport,
      pinToBottom:
        options?.forcePinBottom ??
        (forceNoPinBottomForNextMutation
          ? false
          : !preserveViewport && atBottomBeforeMutation),
      revision,
      reason
    };
    forceNoPinBottomForNextMutation = false;

    if (preserveViewport && reason !== 'jump') {
      viewportMode.value = 'history';
    }

    return pendingMutation;
  };

  const commitViewportMutation = (
    expectedRevision?: number,
    options?: {
      behavior?: ScrollBehavior;
      forceAnchor?: ScrollAnchor | null;
    }
  ): void => {
    const currentMutation = pendingMutation;
    if (!currentMutation) {
      return;
    }

    if (
      expectedRevision !== undefined &&
      currentMutation.revision !== expectedRevision
    ) {
      return;
    }

    pendingMutation = null;

    if (currentMutation.preserveViewport) {
      scheduleAnchorRestore(options?.forceAnchor ?? currentMutation.anchor);
      return;
    }

    if (currentMutation.pinToBottom) {
      keepBottomPinned(options?.behavior || 'auto');
    }
  };

  const saveAnchor = (): void => {
    savedAnchor = captureViewportAnchor();
  };

  const restoreAnchor = (): void => {
    if (!savedAnchor) {
      return;
    }

    scheduleAnchorRestore(savedAnchor);
    savedAnchor = null;
  };

  const beforePrepend = (): void => {
    viewportMode.value = 'history';
    saveAnchor();
  };

  const afterPrepend = (): void => {
    restoreAnchor();
  };

  const keepBottomPinned = (behavior: ScrollBehavior = 'auto'): void => {
    const container = containerRef.value;
    if (!container) {
      return;
    }

    setInternalScrollLock();
    container.scrollTo({ top: 0, behavior });
    updateBottomState();
  };

  const scrollWithSmoothTail = async (
    finalTop: number,
    behavior: ScrollBehavior = 'smooth'
  ): Promise<void> => {
    const container = containerRef.value;

    if (!container) {
      return;
    }

    const currentTop = container.scrollTop;
    const delta = finalTop - currentTop;

    if (
      behavior !== 'smooth' ||
      !Number.isFinite(delta) ||
      Math.abs(delta) <= smoothTailDistancePx
    ) {
      setInternalScrollLock();
      container.scrollTo({ top: finalTop, behavior });
      updateBottomState();
      return;
    }

    const nearTargetTop = finalTop - Math.sign(delta) * smoothTailDistancePx;

    setInternalScrollLock();
    container.scrollTo({ top: nearTargetTop, behavior: 'auto' });

    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    setInternalScrollLock();
    container.scrollTo({ top: finalTop, behavior: 'smooth' });
    await new Promise<void>(resolve =>
      setTimeout(() => {
        resolve();
      }, smoothSettleDelayMs)
    );
    setInternalScrollLock();
    container.scrollTo({ top: finalTop, behavior: 'auto' });
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

  const handleAppend = (smooth = true): void => {
    if (updateBottomState()) {
      keepBottomPinned(smooth ? 'smooth' : 'auto');
      return;
    }

    viewportMode.value = 'history';
    scheduleAnchorRestore(stickyAnchor || captureViewportAnchor());
  };

  const scrollToBottomSmooth = async (): Promise<void> => {
    viewportMode.value = 'live';
    await scrollWithSmoothTail(0, 'smooth');
  };

  const scrollToBottomInstant = (): void => {
    viewportMode.value = 'live';
    keepBottomPinned('auto');
  };

  const handleResizeDrift = (): void => {
    if (isRestoringScroll) {
      return;
    }

    if (updateBottomState() && viewportMode.value === 'live') {
      keepBottomPinned('auto');
      return;
    }

    if (!stickyAnchor) {
      stickyAnchor = captureViewportAnchor();
    }

    if (stickyAnchor) {
      restoreAnchorPosition(stickyAnchor);
      stickyAnchor =
        captureViewportAnchor(stickyAnchor.messageId) || stickyAnchor;
    }
  };

  const observeMessageElement = (element: Node) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (element.matches(messageSelector)) {
      resizeObserver?.observe(element);
    }

    element.querySelectorAll(messageSelector).forEach(child => {
      if (child instanceof HTMLElement) {
        resizeObserver?.observe(child);
      }
    });
  };

  const cleanupResizeObserver = (): void => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  };

  const setupResizeObserver = (): void => {
    cleanupResizeObserver();

    const container = containerRef.value;
    if (!container) {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      handleResizeDrift();
    });

    getMessageElements().forEach(element => {
      resizeObserver?.observe(element);
    });
  };

  const cleanupMutationObserver = (): void => {
    mutationObserver?.disconnect();
    mutationObserver = null;
  };

  const setupMutationObserver = (): void => {
    cleanupMutationObserver();

    const container = containerRef.value;
    if (!container) {
      return;
    }

    mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          observeMessageElement(node);
        });
      }
    });

    mutationObserver.observe(container, {
      childList: true,
      subtree: true
    });
  };

  const initialize = (): void => {
    updateBottomState();
    setupResizeObserver();
    setupMutationObserver();
  };

  const cleanup = (): void => {
    if (restoreRafId) {
      cancelAnimationFrame(restoreRafId);
      restoreRafId = 0;
    }

    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = 0;
    }

    cleanupResizeObserver();
    cleanupMutationObserver();
  };

  const syncScrollHeight = (): void => {
    updateBottomState();
  };

  const onScroll = (): void => {
    if (isRestoringScroll || scrollRafId) {
      return;
    }

    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = 0;

      if (updateBottomState()) {
        return;
      }

      if (viewportMode.value !== 'jump') {
        viewportMode.value = 'history';
      }
      stickyAnchor = captureViewportAnchor();
    });
  };

  const waitForMessageElement = async (
    messageId: string,
    maxFrames = 6
  ): Promise<HTMLElement | null> => {
    const getElement = () => {
      const container = containerRef.value;

      if (!container) {
        return null;
      }

      const messageElement = container.querySelector(
        `[data-message-id="${messageId}"]`
      );

      return messageElement instanceof HTMLElement ? messageElement : null;
    };

    let messageElement = getElement();

    if (messageElement) {
      return messageElement;
    }

    for (let frame = 0; frame < maxFrames; frame += 1) {
      await nextTick();
      await new Promise<void>(resolve =>
        requestAnimationFrame(() => resolve())
      );
      messageElement = getElement();

      if (messageElement) {
        return messageElement;
      }
    }

    return null;
  };

  const jumpToMessage = async (
    messageId: string,
    options?: {
      block?: ScrollLogicalPosition;
      behavior?: ScrollBehavior;
      highlightClassName?: string;
      highlightDurationMs?: number;
    }
  ): Promise<boolean> => {
    const container = containerRef.value;
    if (!container) {
      return false;
    }

    const messageElement = await waitForMessageElement(messageId);

    if (!messageElement) {
      return false;
    }

    viewportMode.value = 'jump';
    stickyAnchor = null;
    const finalTop = getMessageTargetTop(
      messageElement,
      options?.block || 'center'
    );

    if (finalTop === null) {
      return false;
    }

    await scrollWithSmoothTail(finalTop, options?.behavior || 'auto');

    const highlightClassName = options?.highlightClassName;
    if (highlightClassName) {
      messageElement.classList.add(highlightClassName);
      setTimeout(() => {
        messageElement.classList.remove(highlightClassName);
      }, options?.highlightDurationMs ?? 1000);
    }

    requestAnimationFrame(() => {
      stickyAnchor =
        captureViewportAnchor(messageId) || captureViewportAnchor();
      updateBottomState();
    });

    return true;
  };

  const prepareJumpMutation = (): void => {
    viewportMode.value = 'jump';
    stickyAnchor = null;
    forceNoPreserveForNextMutation = true;
    forceNoPinBottomForNextMutation = true;
  };

  const setViewportMode = (
    mode: ViewportMode,
    options?: { pin?: boolean }
  ): void => {
    viewportMode.value = mode;
    if (mode === 'live') {
      stickyAnchor = null;
      if (options?.pin !== false) {
        keepBottomPinned('auto');
      }
    }
  };

  const restoreViewportFromAnchor = (
    anchor: ScrollAnchor | null,
    mode: ViewportMode = 'history'
  ): boolean => {
    const container = containerRef.value;

    if (!container) {
      return false;
    }

    viewportMode.value = mode;

    if (!anchor) {
      if (mode === 'live') {
        keepBottomPinned('auto');
        return true;
      }

      return false;
    }

    stickyAnchor = anchor;
    scheduleAnchorRestore(anchor);

    return true;
  };

  onMounted(() => {
    nextTick(() => {
      initialize();
    });
  });

  onUnmounted(() => {
    cleanup();
  });

  return {
    viewportMode,
    isNearBottom,
    isAtBottom: updateBottomState,
    saveAnchor,
    restoreAnchor,
    beforePrepend,
    afterPrepend,
    handleAppend,
    scrollToBottomSmooth,
    scrollToBottomInstant,
    setupResizeObserver,
    initialize,
    cleanup,
    syncScrollHeight,
    onScroll,
    keepBottomPinned,
    captureViewportAnchor,
    beginViewportMutation,
    commitViewportMutation,
    jumpToMessage,
    prepareJumpMutation,
    setViewportMode,
    restoreViewportFromAnchor,
    get isRestoringScroll() {
      return isRestoringScroll;
    }
  };
}
