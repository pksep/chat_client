import { ref } from 'vue';
import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { getChatSDK, getHasBrowserNetwork } from '../services/useChat';
import {
  getFullMessagesByTopicId,
  getClientMessageById,
  getMessagesByTopicId,
  getTopicIdsWithMessages,
  isDeletedMessageForTopic
} from '../services/useMessages';
import { useTopics } from './useTopics';
import {
  navigateToDialogs,
  navigateToFavorites,
  navigateToGroup
} from './navigation/useUrlRouting';
import { TopicType } from '../services/useChatSDK/types';
import { stripHtml } from '../utils/stripHtml';
import { getAuthUser } from './useAuth';
import {
  isFavoriteTopic,
  normalizeFavoriteTopic
} from '../utils/favorite-topic';
import { isBotTopic, isBotUser } from '../utils/bot';
import { compactPersonName } from '../utils/personName';
import { mergeMessageSnapshots } from '../utils/merge-message-snapshots';
import { pinComments } from '../services/usePinComments';
import type { PinComment } from '../services/pin-comments';

export interface IMessageSearchResult {
  id: string;
  topicId: string;
  message: IMessage;
  topic?: ITopic | null;
  previewText: string;
  pinComments?: PinComment[];
  createdAt?: string | Date;
}

export interface IMessageSearchResponse {
  results: IMessageSearchResult[];
  total: number;
}

const pendingSearchNavigation = ref<IMessageSearchResult | null>(null);
export const isMobileTopicSearchActive = ref(false);

export const setMobileTopicSearchActive = (value: boolean): void => {
  isMobileTopicSearchActive.value = value;
};

const normalizeSearchText = (value: string): string =>
  stripHtml(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSearchQuery = (query: string): string =>
  normalizeSearchText(query).toLowerCase();

const getMessagePlainText = (message?: Pick<IMessage, 'text'>): string =>
  normalizeSearchText(message?.text || '');

const getTopicById = (topicId?: string): ITopic | null => {
  if (!topicId) {
    return null;
  }

  const { getTopicList, getSelectedTopic } = useTopics();
  return (
    getSelectedTopic(topicId) ||
    getTopicList().find(topic => topic.id === topicId) ||
    null
  );
};

const normalizeRemoteTopic = (topic?: ITopic | null): ITopic | null => {
  if (!topic) {
    return null;
  }

  const authUserId = getAuthUser()?.id;

  if (isFavoriteTopic(topic, authUserId)) {
    return normalizeFavoriteTopic(topic, authUserId);
  }

  const rawTopic = topic as ITopic & {
    settings?: Array<{ user?: ITopic['user']; userId?: string }>;
  };

  if (rawTopic.type === TopicType.Group) {
    return {
      ...rawTopic,
      name: rawTopic.group?.title || rawTopic.name,
      avatarUrl: rawTopic.group?.avatarUrl || rawTopic.avatarUrl
    };
  }

  const peerSetting = rawTopic.settings?.find(
    setting => setting.user && setting.user.id !== authUserId
  );
  const user = rawTopic.user || peerSetting?.user;
  const rawName = user?.initials || user?.nickname || rawTopic.name || '';

  return {
    ...rawTopic,
    user,
    name:
      isBotTopic(rawTopic) || isBotUser(user)
        ? rawName
        : compactPersonName(rawName),
    avatarUrl: user?.avatarUrl || rawTopic.avatarUrl
  };
};

const resolveMessageTopic = (
  message: IMessage & { topic?: ITopic | null }
): ITopic | null =>
  getTopicById(message.topicId) || normalizeRemoteTopic(message.topic);

const buildSearchResult = (
  message: IMessage & { topic?: ITopic | null; pinComments?: PinComment[] },
  preferLocalComments = false
): IMessageSearchResult | null => {
  const topicId = message.topicId || message.topic?.id;

  if (
    !topicId ||
    !message.id ||
    message.deletedAt ||
    isDeletedMessageForTopic(topicId, message)
  ) {
    return null;
  }

  const topic = resolveMessageTopic({ ...message, topicId });

  if (message.isSystem && isFavoriteTopic(topic, getAuthUser()?.id)) {
    return null;
  }

  const { pinComments: remoteComments, ...source } = message;
  const current = preferLocalComments
    ? getClientMessageById(topicId, message.id) || source
    : source;
  const original = pinComments.projectPins(topicId, [current])[0];
  if (!original) return null;
  const previewText = getMessagePlainText(original) || 'Вложение';
  const localComments = pinComments.commentsFor(topicId, message.id);
  const notes = (
    preferLocalComments ? localComments : remoteComments || localComments
  ).filter(
    comment =>
      comment.topicId === topicId &&
      comment.messageId === message.id &&
      typeof comment.text === 'string' &&
      typeof comment.revision === 'string' &&
      (comment.scope === 'SELF'
        ? comment.authorId === getAuthUser()?.id &&
          Boolean(original.isPinnedForMe || original.isPinnedOnlyMe)
        : comment.scope === 'ALL' &&
          Boolean(
            original.isPinnedForAll ??
              (original.isPin && !original.isPinnedOnlyMe)
          ))
  );

  return {
    id: message.id,
    topicId,
    message: {
      ...original,
      topicId
    },
    topic,
    previewText,
    pinComments: notes,
    createdAt: message.createdAt
  };
};

const compareByCreatedAt = (
  left: IMessageSearchResult,
  right: IMessageSearchResult
): number =>
  new Date(right.createdAt || 0).getTime() -
  new Date(left.createdAt || 0).getTime();

const dedupeResults = (
  results: IMessageSearchResult[]
): IMessageSearchResult[] =>
  Array.from(new Map(results.map(result => [result.id, result])).values());

const matchesQuery = (result: IMessageSearchResult, query: string): boolean => {
  const tokens = normalizeSearchQuery(query).split(' ');
  return [
    getMessagePlainText(result.message),
    ...(result.pinComments || []).map(comment =>
      normalizeSearchText(comment.text)
    )
  ].some(text => tokens.every(token => text.toLowerCase().includes(token)));
};

const searchLocalMessages = (
  query: string,
  opts?: { topicId?: string; limit?: number }
): IMessageSearchResult[] => {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  const topicIds = opts?.topicId ? [opts.topicId] : getTopicIdsWithMessages();
  const results = topicIds.flatMap(topicId => {
    const fullMessages = getFullMessagesByTopicId(topicId);
    const visibleMessages = getMessagesByTopicId(topicId);
    const messages = fullMessages.length ? fullMessages : visibleMessages;

    return messages
      .map(message => buildSearchResult(message))
      .filter((result): result is IMessageSearchResult => Boolean(result))
      .filter(result => matchesQuery(result, normalizedQuery));
  });

  return dedupeResults(results)
    .sort(compareByCreatedAt)
    .slice(0, opts?.limit || 100);
};

const searchRemoteMessages = async (
  query: string,
  opts?: { topicId?: string; limit?: number }
): Promise<{ results: IMessageSearchResult[]; total: number | null }> => {
  const sdk = getChatSDK();

  if (!sdk) {
    return { results: [], total: null };
  }

  try {
    const response = await sdk.searchMessages(query, {
      page: 1,
      limit: opts?.limit || 100,
      topicId: opts?.topicId,
      includePinComments: true
    });
    const data = response.data || [];

    return {
      results: data
        .map(message =>
          buildSearchResult(message as IMessage & { topic?: ITopic })
        )
        .filter((result): result is IMessageSearchResult => Boolean(result)),
      total: response.total ?? response.meta?.totalItems ?? null
    };
  } catch (error) {
    console.warn('Remote message search is unavailable:', error);
    return { results: [], total: null };
  }
};

export const searchMessages = async (
  query: string,
  opts?: {
    topicId?: string;
    limit?: number;
    onLocalResults?: (response: IMessageSearchResponse) => void;
  }
): Promise<IMessageSearchResponse> => {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return { results: [], total: 0 };
  }

  const sdk = getChatSDK();
  const userId = getAuthUser()?.id;
  const noteVersions = new Map(
    [
      ...new Set([
        ...getTopicIdsWithMessages(),
        ...useTopics()
          .getTopicList()
          .map(topic => topic.id),
        ...(opts?.topicId ? [opts.topicId] : [])
      ])
    ].map(topicId => [topicId, pinComments.mutationVersion(topicId)])
  );
  const preferLocal = (message: IMessage) =>
    pinComments.pending(message.topicId, message.id) ||
    pinComments.mutationVersion(message.topicId) !==
      (noteVersions.get(message.topicId) ?? 0);
  const localResults = searchLocalMessages(normalizedQuery, opts);
  const localResponse = { results: localResults, total: localResults.length };
  if (localResults.length) opts?.onLocalResults?.(localResponse);
  if (!getHasBrowserNetwork()) return localResponse;

  const remote = await searchRemoteMessages(normalizedQuery, opts);
  if (getChatSDK() !== sdk || getAuthUser()?.id !== userId)
    return { results: [], total: 0 };
  const results = mergeMessageSnapshots(
    [...searchLocalMessages(normalizedQuery, opts), ...remote.results].map(
      result => result.message
    )
  )
    .map(message =>
      buildSearchResult(
        {
          ...message,
          pinComments: remote.results.find(result => result.id === message.id)
            ?.pinComments
        },
        preferLocal(message)
      )
    )
    .filter((result): result is IMessageSearchResult => !!result)
    .filter(
      result =>
        !preferLocal(result.message) || matchesQuery(result, normalizedQuery)
    )
    .sort(compareByCreatedAt);

  return {
    results,
    total: Math.max(remote.total ?? 0, results.length)
  };
};

export const setPendingSearchNavigation = (
  result: IMessageSearchResult | null
): void => {
  pendingSearchNavigation.value = result;
};

export const consumePendingSearchNavigation = (
  topicId: string
): IMessageSearchResult | null => {
  if (!pendingSearchNavigation.value) {
    return null;
  }

  if (pendingSearchNavigation.value.topicId !== topicId) {
    return null;
  }

  const result = pendingSearchNavigation.value;
  pendingSearchNavigation.value = null;
  return result;
};

export const getPendingSearchNavigation = () => pendingSearchNavigation.value;

export const navigateToSearchResult = (result: IMessageSearchResult): void => {
  setPendingSearchNavigation(result);

  const topic = result.topic || getTopicById(result.topicId);

  if (isFavoriteTopic(topic, getAuthUser()?.id)) {
    navigateToFavorites(result.topicId);
    return;
  }

  if (topic?.type === TopicType.Group) {
    navigateToGroup(result.topicId);
    return;
  }

  navigateToDialogs(result.topicId);
};
