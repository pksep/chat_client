import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { getBotUsername, isBotUser } from './bot';
import { parseUserEx } from './parseUserEx';

export const normalizeSearchText = (value?: string | null): string =>
  (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();

export const normalizeAtSearchQuery = (value?: string | null): string =>
  normalizeSearchText(value).replace(/^@+/, '');

const normalizeCandidate = (value?: string | null): string =>
  normalizeSearchText(value).replace(/^@+/, '');

const matchesSearchValues = (
  values: Array<string | null | undefined>,
  query?: string | null
): boolean => {
  const normalizedQuery = normalizeAtSearchQuery(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some(value =>
    normalizeCandidate(value).includes(normalizedQuery)
  );
};

export const getUserSearchValues = (user?: IUser | null): string[] => {
  if (!user) {
    return [];
  }

  const ex = parseUserEx(user.ex);

  return [
    user.initials,
    user.nickname,
    ex.erpInitials,
    isBotUser(user) ? getBotUsername(user) : ''
  ].filter((value): value is string => Boolean(value));
};

export const matchesUserSearch = (
  user?: IUser | null,
  query?: string | null
): boolean => matchesSearchValues(getUserSearchValues(user), query);

export const getTopicSearchValues = (topic?: ITopic | null): string[] => {
  if (!topic) {
    return [];
  }

  return [
    topic.name,
    topic.group?.title,
    ...getUserSearchValues(topic.user)
  ].filter((value): value is string => Boolean(value));
};

export const matchesTopicSearch = (
  topic?: ITopic | null,
  query?: string | null
): boolean => matchesSearchValues(getTopicSearchValues(topic), query);
