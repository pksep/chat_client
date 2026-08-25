interface ShouldPinMessageAppendOptions {
  isAppend: boolean;
  preserveViewportForDownPagination: boolean;
  isUserScrolling: boolean;
  viewportMode: 'live' | 'history' | 'jump';
  isAtBottom: boolean;
  isNearBottom: boolean;
}

export const shouldPinMessageAppendToBottom = ({
  isAppend,
  preserveViewportForDownPagination,
  isUserScrolling,
  viewportMode,
  isAtBottom,
  isNearBottom
}: ShouldPinMessageAppendOptions): boolean =>
  isAppend &&
  !preserveViewportForDownPagination &&
  !isUserScrolling &&
  (isAtBottom || (viewportMode === 'live' && isNearBottom));
