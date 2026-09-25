let pendingFrame = 0;
let observation:
  | {
      topicId: string;
      notificationMessageId: string;
      latestMessageId: string;
      isFresh: boolean;
    }
  | undefined;

export const resolveNotificationHistoryPaint = (
  topicId: string,
  notificationMessageId: string,
  latestMessageId: string,
  isFresh: boolean
): void => {
  if (
    observation?.topicId !== topicId ||
    observation.notificationMessageId !== notificationMessageId
  )
    return;
  observation.latestMessageId = latestMessageId;
  observation.isFresh = isFresh;
  performance.mark('chat-notification:history-resolved', {
    detail: { topicId, notificationMessageId, latestMessageId, isFresh }
  });
};

// Готовый кадр подтверждает последнюю страницу, а не только сообщение из уведомления.
export const observeNotificationPaint = (
  topicId: string,
  messageId: string
): void => {
  if (typeof window === 'undefined' || !messageId) return;
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  const markName = 'chat-notification:message-painted';
  const firstFrameMarkName = 'chat-notification:first-message-frame';
  performance.clearMarks(markName);
  performance.clearMarks(firstFrameMarkName);
  performance.clearMarks('chat-notification:history-resolved');
  const current = (observation = {
    topicId,
    notificationMessageId: messageId,
    latestMessageId: '',
    isFresh: false
  });
  const deadline = performance.now() + 30_000;
  let visibleOnPreviousFrame = false;
  let firstMessageFrameRecorded = false;
  const check = () => {
    pendingFrame = 0;
    if (performance.now() > deadline || !location.pathname.includes(topicId))
      return;
    const contentExposed =
      document.visibilityState === 'visible' &&
      !document.querySelector(
        '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
      );
    const isVisible = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect();
      const composerTop =
        document.querySelector('.chat__input')?.getBoundingClientRect().top ??
        innerHeight;
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < Math.min(innerHeight, composerTop) &&
        getComputedStyle(node).visibility !== 'hidden'
      );
    };
    if (contentExposed && !firstMessageFrameRecorded) {
      const visibleMessages = [
        ...document.querySelectorAll<HTMLElement>('[data-message-id]')
      ].filter(isVisible);
      if (visibleMessages.length) {
        firstMessageFrameRecorded = true;
        performance.mark(firstFrameMarkName, {
          detail: {
            topicId,
            notificationMessageId: messageId,
            messageId: current.latestMessageId,
            isFresh: current.isFresh,
            includesTarget: visibleMessages.some(
              node => node.dataset.messageId === messageId
            ),
            includesLatest:
              current.isFresh &&
              visibleMessages.some(
                node => node.dataset.messageId === current.latestMessageId
              )
          }
        });
      }
    }
    const message = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(current.latestMessageId)}"]`
    );
    const visible =
      current.isFresh && contentExposed && !!message && isVisible(message);
    if (visible && visibleOnPreviousFrame) {
      performance.mark(markName, {
        detail: {
          topicId,
          notificationMessageId: messageId,
          messageId: current.latestMessageId,
          isFresh: true
        }
      });
      return;
    }
    visibleOnPreviousFrame = visible;
    pendingFrame = requestAnimationFrame(check);
  };
  pendingFrame = requestAnimationFrame(check);
};
