import type { IMessage } from '../components/interfaces/interfaces';
import { parseCallMessageEx } from './parseCallMessage';

type TrackableMessage = Pick<IMessage, 'isSystem' | 'ex'>;

export const isCallSystemMessage = (
  message?: TrackableMessage | null
): boolean => {
  if (!message?.isSystem) {
    return false;
  }

  const parsedEx = parseCallMessageEx(message.ex);

  return parsedEx?.type === 'call';
};

export const isUnreadTrackableMessage = (
  message?: TrackableMessage | null
): boolean => {
  if (!message) {
    return false;
  }

  return !message.isSystem || isCallSystemMessage(message);
};

export const isOwnEndedCallSystemMessage = (
  message?: TrackableMessage | null,
  authUserId?: string | null
): boolean => {
  if (!message || !authUserId) {
    return false;
  }

  const parsedEx = parseCallMessageEx(message.ex);

  return (
    parsedEx?.type === 'call' &&
    parsedEx.call?.event === 'end' &&
    parsedEx.call?.creatorId === authUserId
  );
};

export const isUnreadTrackableMessageForUser = (
  message?: TrackableMessage | null,
  authUserId?: string | null
): boolean => {
  return (
    isUnreadTrackableMessage(message) &&
    !isOwnEndedCallSystemMessage(message, authUserId)
  );
};

export const isUnreadIgnoredSystemMessage = (
  message?: TrackableMessage | null
): boolean => {
  return Boolean(message?.isSystem) && !isCallSystemMessage(message);
};

export const isUnreadIgnoredMessageForUser = (
  message?: TrackableMessage | null,
  authUserId?: string | null
): boolean => {
  return (
    isUnreadIgnoredSystemMessage(message) ||
    isOwnEndedCallSystemMessage(message, authUserId)
  );
};
