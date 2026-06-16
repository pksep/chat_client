import { TopicType } from '../services/useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';

export const LOCAL_BOT_TOPIC_ID_PREFIX = 'local-bot-topic-';
export const LOCAL_BOT_USER_ID_PREFIX = 'local-bot-user-';

type BotMeta = {
  isBot?: boolean;
  botUsername?: string;
  apiKey?: string;
  botApiKey?: string;
  erpInitials?: string;
  erpRole?: string;
};

const BOT_NAME_PATTERN = /^(бот|bot)\b/i;

const parseBotMeta = (value: unknown): BotMeta => {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);

      return parsed && typeof parsed === 'object' ? (parsed as BotMeta) : {};
    } catch {
      return {};
    }
  }

  if (typeof value === 'object') {
    return value as BotMeta;
  }

  return {};
};

const getNameCandidates = (
  user?: IUser | null,
  topic?: ITopic | null
): string[] =>
  [
    topic?.name,
    user?.initials,
    user?.nickname,
    parseBotMeta(user?.ex).erpInitials
  ].filter((value): value is string => Boolean(value));

export const isLocalBotTopicId = (topicId?: string | null): boolean =>
  Boolean(topicId && topicId.startsWith(LOCAL_BOT_TOPIC_ID_PREFIX));

export const isLocalBotUserId = (userId?: string | null): boolean =>
  Boolean(userId && userId.startsWith(LOCAL_BOT_USER_ID_PREFIX));

export const isLocalBotUser = (user?: IUser | null): boolean =>
  isLocalBotUserId(user?.id);

export const isLocalBotTopic = (topic?: ITopic | null): boolean =>
  isLocalBotTopicId(topic?.id);

export const isBotUser = (user?: IUser | null): boolean => {
  const meta = parseBotMeta(user?.ex);

  if (
    meta.isBot ||
    meta.botUsername ||
    meta.apiKey ||
    meta.botApiKey ||
    isLocalBotUserId(user?.id)
  ) {
    return true;
  }

  return getNameCandidates(user).some(value => BOT_NAME_PATTERN.test(value));
};

export const isBotTopic = (topic?: ITopic | null): boolean => {
  if (!topic || topic.type !== TopicType.DM) {
    return false;
  }

  if (isLocalBotTopicId(topic.id) || isBotUser(topic.user)) {
    return true;
  }

  return getNameCandidates(topic.user, topic).some(value =>
    BOT_NAME_PATTERN.test(value)
  );
};

export const getBotDisplayName = (topic?: ITopic | null): string => {
  return topic?.name || topic?.user?.initials || 'Бот';
};

export const getBotUsername = (user?: IUser | null): string => {
  const meta = parseBotMeta(user?.ex);

  return (
    meta.botUsername ||
    user?.nickname ||
    parseBotMeta(user?.ex).erpInitials ||
    ''
  );
};

export const getBotApiKey = (user?: IUser | null): string => {
  const meta = parseBotMeta(user?.ex);

  return meta.botApiKey || meta.apiKey || '';
};

export const buildBotEx = (
  currentEx: unknown,
  payload: {
    username: string;
    apiKey: string;
  }
): string => {
  const currentMeta = parseBotMeta(currentEx);

  return JSON.stringify({
    ...currentMeta,
    isBot: true,
    botUsername: payload.username,
    botApiKey: payload.apiKey,
    erpRole: currentMeta.erpRole || 'Бот'
  });
};

export const maskBotSecret = (value: string): string => {
  if (!value) {
    return '';
  }

  return '\u2022'.repeat(Math.max(8, Math.min(value.length, 24)));
};
