import { ref } from 'vue';
import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { getChatSDK } from '../services/useChat';
import {
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  getTopicIdsWithMessages
} from '../services/useMessages';
import { useTopics } from './useTopics';
import {
  navigateToDialogs,
  navigateToGroup
} from './navigation/useUrlRouting';
import { TopicType } from '../services/useChatSDK/types';
import { stripHtml } from '../utils/stripHtml';
import { getAuthUser } from './useAuth';

export interface IMessageSearchResult {
  id: string;
  topicId: string;
  message: IMessage;
  topic?: ITopic | null;
  previewText: string;
  createdAt?: string | Date;
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

  if (topic.name) {
    return topic;
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

  const authUserId = getAuthUser()?.id;
  const peerSetting = rawTopic.settings?.find(
    setting => setting.user && setting.user.id !== authUserId
  );
  const user = rawTopic.user || peerSetting?.user;

  return {
    ...rawTopic,
    user,
    name: user?.initials || user?.nickname || rawTopic.name,
    avatarUrl: user?.avatarUrl || rawTopic.avatarUrl
  };
};

const resolveMessageTopic = (
  message: IMessage & { topic?: ITopic | null }
): ITopic | null =>
  getTopicById(message.topicId) || normalizeRemoteTopic(message.topic);

const buildSearchResult = (
  message: IMessage & { topic?: ITopic | null }
): IMessageSearchResult | null => {
  const topicId = message.topicId || message.topic?.id;

  if (!topicId || !message.id) {
    return null;
  }

  const topic = resolveMessageTopic({ ...message, topicId });
  const previewText = getMessagePlainText(message) || 'Вложение';

  return {
    id: message.id,
    topicId,
    message: {
      ...message,
      topicId
    },
    topic,
    previewText,
    createdAt: message.createdAt
  };
};

const compareByCreatedAt = (
  left: IMessageSearchResult,
  right: IMessageSearchResult
): number =>
  new Date(left.createdAt || 0).getTime() -
  new Date(right.createdAt || 0).getTime();

const dedupeResults = (
  results: IMessageSearchResult[]
): IMessageSearchResult[] =>
  Array.from(new Map(results.map(result => [result.id, result])).values());

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
      .filter(message =>
        getMessagePlainText(message).toLowerCase().includes(normalizedQuery)
      )
      .map(message => buildSearchResult(message))
      .filter((result): result is IMessageSearchResult => Boolean(result));
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
      topicId: opts?.topicId
    });
    const data = response.data || [];

    return {
      results: data
        .map(message => buildSearchResult(message as IMessage & { topic?: ITopic }))
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
  opts?: { topicId?: string; limit?: number }
): Promise<{ results: IMessageSearchResult[]; total: number }> => {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return { results: [], total: 0 };
  }

  const localResults = searchLocalMessages(normalizedQuery, opts);
  const remote = await searchRemoteMessages(normalizedQuery, opts);
  const results = dedupeResults([...remote.results, ...localResults]).sort(
    compareByCreatedAt
  );

  return {
    results,
    total: remote.total ?? results.length
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

export const navigateToSearchResult = (
  result: IMessageSearchResult
): void => {
  setPendingSearchNavigation(result);

  const topic = result.topic || getTopicById(result.topicId);

  if (topic?.type === TopicType.Group) {
    navigateToGroup(result.topicId);
    return;
  }

  navigateToDialogs(result.topicId);
};
