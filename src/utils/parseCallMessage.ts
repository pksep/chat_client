export type CallMessageKind = 'missed' | 'incoming' | 'outgoing';

export interface ParsedCallMessage {
  kind: CallMessageKind;
  title: string;
  duration: string | null;
  isOutgoing: boolean;
}

interface CallMessageOptions {
  messageEx?: unknown;
  isMeSender?: boolean;
  authUserId?: string;
}

export interface ParsedCallExPayload {
  type?: string;
  call?: {
    roomId?: string;
    event?: 'start' | 'end';
    direction?: CallMessageKind;
    durationSec?: number;
    creatorId?: string | null;
    wasAnswered?: boolean;
  };
}

export const parseCallMessageEx = (
  messageEx?: unknown
): ParsedCallExPayload | null => {
  if (!messageEx) {
    return null;
  }

  if (typeof messageEx === 'string') {
    try {
      return JSON.parse(messageEx) as ParsedCallExPayload;
    } catch {
      return null;
    }
  }

  if (typeof messageEx === 'object') {
    return messageEx as ParsedCallExPayload;
  }

  return null;
};

const formatDuration = (durationSec: number): string => {
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = Math.floor(durationSec % 60);
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} сек`);

  return parts.join(' ');
};

export const parseCallMessage = (
  message: string,
  options: CallMessageOptions = {}
): ParsedCallMessage | null => {
  const parsedEx = parseCallMessageEx(options.messageEx);

  if (parsedEx?.type === 'call' && parsedEx.call) {
    const creatorId = parsedEx.call.creatorId || null;
    const isOutgoing =
      typeof creatorId === 'string' && options.authUserId
        ? creatorId === options.authUserId
        : Boolean(options.isMeSender);
    const isMissed =
      parsedEx.call.direction === 'missed' ||
      parsedEx.call.wasAnswered === false;

    if (parsedEx.call.event === 'end') {
      const kind = isMissed ? 'missed' : isOutgoing ? 'outgoing' : 'incoming';

      return {
        kind,
        title:
          kind === 'missed'
            ? 'Пропущенный'
            : kind === 'outgoing'
              ? 'Исходящий'
              : 'Входящий',
        duration:
          !isMissed && typeof parsedEx.call.durationSec === 'number'
            ? formatDuration(parsedEx.call.durationSec)
            : null,
        isOutgoing
      };
    }

    const kind = isOutgoing ? 'outgoing' : 'incoming';

    return {
      kind,
      title: kind === 'outgoing' ? 'Исходящий' : 'Входящий',
      duration: null,
      isOutgoing
    };
  }

  return null;
};
