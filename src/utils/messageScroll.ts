interface ShouldPinMessageAppendOptions {
  isAppend: boolean;
  preserveViewportForDownPagination: boolean;
  isUserScrolling: boolean;
  viewportMode: 'live' | 'history' | 'jump';
  isAtBottom: boolean;
  isNearBottom: boolean;
}

interface MessageReactionLayoutValue {
  id?: string;
  senderUserId?: string;
  text?: string;
}

export const getMessageReactionLayoutSignature = (
  reactions?: MessageReactionLayoutValue[]
): string =>
  (reactions || [])
    .map(
      reaction =>
        `${reaction.id || ''}:${reaction.senderUserId || ''}:${reaction.text || ''}`
    )
    .sort()
    .join(',');

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
