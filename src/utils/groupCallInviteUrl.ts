const CALL_INVITE_PARAM = 'callInvite';
const CALL_ROOM_PARAM = 'callRoom';
const TRUSTED_NATIVE_CALL_INVITE_ORIGINS = new Set(['https://chat.pksep.ru']);

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

const isNativeClient = (): boolean => {
  if (typeof window === 'undefined') return false;

  const capacitor = (
    window as typeof window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
      };
    }
  ).Capacitor;

  return capacitor?.isNativePlatform?.() === true;
};

export const parseGroupCallInviteUrl = (
  value: string | URL,
  options?: {
    allowTrustedNativeOrigin?: boolean;
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

    const allowTrustedNativeOrigin =
      options?.allowTrustedNativeOrigin ?? isNativeClient();
    const isTrustedNativeOrigin =
      allowTrustedNativeOrigin &&
      TRUSTED_NATIVE_CALL_INVITE_ORIGINS.has(url.origin);

    if (
      currentOrigin &&
      url.origin !== currentOrigin &&
      !isTrustedNativeOrigin
    ) {
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
    allowTrustedNativeOrigin?: boolean;
    currentOrigin?: string | null;
  }
): boolean => Boolean(parseGroupCallInviteUrl(value, options));
