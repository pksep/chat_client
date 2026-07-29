import type { IMessage, ITopic } from '../components/interfaces/interfaces';

export const CALL_TOPIC_DESCRIPTION_PREFIX = 'sep-chat:call-topic:v1:';
export const CALL_TOPIC_DEFAULT_MESSAGE_TYPE = 'call-topic-default';

export interface CallTopicMeta {
  roomId: string;
  userId: string;
}

export const parseCallTopicDescription = (
  description?: string | null
): CallTopicMeta | null => {
  if (!description?.startsWith(CALL_TOPIC_DESCRIPTION_PREFIX)) {
    return null;
  }

  const payload = description.slice(CALL_TOPIC_DESCRIPTION_PREFIX.length);
  const separatorIndex = payload.lastIndexOf(':');

  if (separatorIndex <= 0 || separatorIndex === payload.length - 1) {
    return null;
  }

  const encodedRoomId = payload.slice(0, separatorIndex);
  const userId = payload.slice(separatorIndex + 1);

  try {
    const roomId = decodeURIComponent(encodedRoomId);
    return roomId && userId ? { roomId, userId } : null;
  } catch {
    return null;
  }
};

export const isCallTopic = (topic?: ITopic | null): boolean =>
  !!parseCallTopicDescription(topic?.group?.description);

const parseRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseRecord(parsed);
    } catch {
      return null;
    }
  }

  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
};

export const parseCallTopicDefaultMessageEx = (
  ex: unknown
): { roomId?: string } | null => {
  const parsed = parseRecord(ex);

  if (parsed?.type !== CALL_TOPIC_DEFAULT_MESSAGE_TYPE) {
    return null;
  }

  const meta = parseRecord(parsed.callTopicDefault);
  const roomId = meta?.roomId;

  return typeof roomId === 'string' ? { roomId } : {};
};

export const isCallTopicDefaultMessage = (
  message?: Pick<IMessage, 'ex'> | null
): boolean => !!parseCallTopicDefaultMessageEx(message?.ex);
