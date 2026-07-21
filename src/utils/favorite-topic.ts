import type { ITopic } from '../components/interfaces/interfaces';

export const FAVORITE_TOPIC_NAME = 'Избранное';
export const FAVORITE_TOPIC_DESCRIPTION = 'sep-chat:favorite-messages:v1';

type TopicWithSettings = ITopic & {
  settings?: Array<{
    userId?: string | null;
    user?: { id?: string | null } | null;
  }>;
};

const getKnownMemberIds = (topic: TopicWithSettings): string[] => {
  const memberIds = (topic.members || []).map(member => member?.id);
  const settingIds = (topic.settings || []).map(
    setting => setting.userId || setting.user?.id
  );

  return [
    ...new Set(
      [...memberIds, ...settingIds]
        .filter((id): id is string => Boolean(id))
        .map(String)
    )
  ];
};

export const isFavoriteTopic = (
  topic?: ITopic | null,
  authUserId?: string | null
): boolean => {
  if (!topic) {
    return false;
  }

  if (topic.isFavorite) {
    return true;
  }

  const normalizedAuthUserId = authUserId ? String(authUserId) : '';
  const memberIds = getKnownMemberIds(topic);
  const hasOnlyCurrentUser =
    Boolean(normalizedAuthUserId) &&
    memberIds.length === 1 &&
    memberIds[0] === normalizedAuthUserId;

  if (topic.type === 'GROUP') {
    return (
      topic.group?.description === FAVORITE_TOPIC_DESCRIPTION &&
      hasOnlyCurrentUser
    );
  }

  if (topic.type !== 'DM') {
    return false;
  }

  if (memberIds.length > 0) {
    return hasOnlyCurrentUser;
  }

  if (topic.user?.id) {
    return (
      Boolean(normalizedAuthUserId) &&
      String(topic.user.id) === normalizedAuthUserId
    );
  }

  if (topic.name && topic.name !== FAVORITE_TOPIC_NAME) {
    return false;
  }

  return !topic.avatarUrl;
};

export const normalizeFavoriteTopic = (
  topic: ITopic,
  authUserId?: string | null
): ITopic => {
  if (!isFavoriteTopic(topic, authUserId)) {
    return topic;
  }

  return {
    ...topic,
    isFavorite: true,
    user: undefined,
    name: FAVORITE_TOPIC_NAME,
    avatarUrl: '',
    typingUserIds: [],
    activeCall: null,
    lastMessage: topic.lastMessage?.isSystem ? undefined : topic.lastMessage
  };
};

export const filterFavoriteTopicSystemMessages = <
  T extends { isSystem?: boolean }
>(
  topic: ITopic | null | undefined,
  messages: T[],
  authUserId?: string | null
): T[] =>
  isFavoriteTopic(topic, authUserId)
    ? messages.filter(message => !message.isSystem)
    : messages;
