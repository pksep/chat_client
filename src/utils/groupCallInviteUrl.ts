import { isTauri } from '@tauri-apps/api/core';

const CALL_INVITE_PARAM = 'callInvite';
const CALL_ROOM_PARAM = 'callRoom';
const TRUSTED_CALL_INVITE_ORIGINS = new Set(['https://chat.pksep.ru']);

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

  return isTauri() || capacitor?.isNativePlatform?.() === true;
};

export const buildPublicGroupCallInviteUrl = (
  invite: GroupCallInviteParams
): string => {
  const url = new URL('https://chat.pksep.ru/');
  url.searchParams.set(CALL_ROOM_PARAM, invite.roomId);
  url.searchParams.set(CALL_INVITE_PARAM, invite.inviteToken);
  if (invite.organization)
    url.searchParams.set('organization', invite.organization);
  return url.toString();
};

export const buildDesktopGroupCallInviteUrl = (
  value: string
): string | null => {
  const invite = parseGroupCallInviteUrl(value, { allowTrustedOrigin: true });
  if (!invite) return null;
  const url = new URL('sepchat://invite');
  url.search = new URL(buildPublicGroupCallInviteUrl(invite)).search;
  return url.toString();
};

export const parseDesktopGroupCallInviteUrl = (
  value: string
): string | null => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'sepchat:' ||
      url.hostname !== 'invite' ||
      !['', '/'].includes(url.pathname) ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const roomId = url.searchParams.get(CALL_ROOM_PARAM);
    const inviteToken = url.searchParams.get(CALL_INVITE_PARAM);
    if (!roomId || !inviteToken) return null;
    return buildPublicGroupCallInviteUrl({
      roomId,
      inviteToken,
      organization: url.searchParams.get('organization')
    });
  } catch {
    return null;
  }
};

export const parseGroupCallInviteUrl = (
  value: string | URL,
  options?: {
    allowTrustedNativeOrigin?: boolean;
    allowTrustedOrigin?: boolean;
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

    const allowTrustedOrigin =
      options?.allowTrustedOrigin ??
      options?.allowTrustedNativeOrigin ??
      isNativeClient();
    const isTrustedOrigin =
      allowTrustedOrigin && TRUSTED_CALL_INVITE_ORIGINS.has(url.origin);

    if (currentOrigin && url.origin !== currentOrigin && !isTrustedOrigin) {
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
    allowTrustedOrigin?: boolean;
    currentOrigin?: string | null;
  }
): boolean => Boolean(parseGroupCallInviteUrl(value, options));

export const buildGroupCallInviteAuthorizationUrl = (
  value: string | URL
): string => {
  const currentUrl =
    value instanceof URL ? new URL(value.toString()) : new URL(value);
  const authorizationUrl = new URL('/', currentUrl.origin);
  const invite = parseGroupCallInviteUrl(currentUrl, {
    currentOrigin: currentUrl.origin
  });

  if (!invite) {
    return authorizationUrl.toString();
  }

  authorizationUrl.searchParams.set(CALL_ROOM_PARAM, invite.roomId);
  authorizationUrl.searchParams.set(CALL_INVITE_PARAM, invite.inviteToken);

  if (invite.organization) {
    authorizationUrl.searchParams.set('organization', invite.organization);
  }

  return authorizationUrl.toString();
};
