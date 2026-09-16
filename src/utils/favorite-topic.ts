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
      (hasOnlyCurrentUser || memberIds.length === 1)
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

const toTimestamp = (value: unknown): number => {
  const timestamp = value ? new Date(value as string | Date).getTime() : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getFavoritePriority = (topic: ITopic): number[] => {
  const lastMessage = topic.lastMessage?.isSystem
    ? undefined
    : topic.lastMessage;

  return [
    lastMessage ? 1 : 0,
    toTimestamp(lastMessage?.updatedAt || lastMessage?.createdAt),
    toTimestamp(topic.updatedAt),
    toTimestamp(topic.createdAt)
  ];
};

const isHigherPriorityFavorite = (
  current: ITopic,
  candidate: ITopic
): boolean => {
  const currentPriority = getFavoritePriority(current);
  const candidatePriority = getFavoritePriority(candidate);

  return candidatePriority.some(
    (value, index) =>
      value !== currentPriority[index] &&
      value > currentPriority[index] &&
      candidatePriority
        .slice(0, index)
        .every(
          (priority, priorityIndex) =>
            priority === currentPriority[priorityIndex]
        )
  );
};

export const dedupeFavoriteTopics = (
  topics: ITopic[],
  authUserId?: string | null
): ITopic[] => {
  const result: ITopic[] = [];
  let favoriteIndex = -1;

  topics.forEach(topic => {
    if (!isFavoriteTopic(topic, authUserId)) {
      result.push(topic);
      return;
    }

    if (favoriteIndex < 0) {
      favoriteIndex = result.length;
      result.push(topic);
      return;
    }

    if (isHigherPriorityFavorite(result[favoriteIndex], topic)) {
      result[favoriteIndex] = topic;
    }
  });

  return result;
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
