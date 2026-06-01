const CALL_INVITE_PARAM = 'callInvite';
const CALL_ROOM_PARAM = 'callRoom';

interface GroupCallInviteParams {
  inviteToken: string;
  organization: string | null;
  roomId: string;
}

const resolveCurrentOrigin = (currentOrigin?: string | null): string | null => {
  if (typeof currentOrigin === 'string') {
    return currentOrigin;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return null;
};

export const parseGroupCallInviteUrl = (
  value: string | URL,
  options?: {
    currentOrigin?: string | null;
  }
): GroupCallInviteParams | null => {
  try {
    const url =
      value instanceof URL
        ? new URL(value.toString())
        : new URL(
            value,
            resolveCurrentOrigin(options?.currentOrigin) || 'http://localhost'
          );

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    const currentOrigin = resolveCurrentOrigin(options?.currentOrigin);

    if (currentOrigin && url.origin !== currentOrigin) {
      return null;
    }

    const inviteToken = url.searchParams.get(CALL_INVITE_PARAM);
    const roomId = url.searchParams.get(CALL_ROOM_PARAM);

    if (!inviteToken || !roomId) {
      return null;
    }

    return {
      inviteToken,
      organization: url.searchParams.get('organization'),
      roomId
    };
  } catch {
    return null;
  }
};

export const isGroupCallInviteUrl = (
  value: string | URL,
  options?: {
    currentOrigin?: string | null;
  }
): boolean => Boolean(parseGroupCallInviteUrl(value, options));
