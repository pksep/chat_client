import { TopicType } from '../services/useChatSDK/types';
import type { ITopic, IUser } from '../components/interfaces/interfaces';

export const LOCAL_BOT_TOPIC_ID_PREFIX = 'local-bot-topic-';
export const LOCAL_BOT_USER_ID_PREFIX = 'local-bot-user-';

type BotMeta = {
  isBot?: boolean;
  isDeletedBot?: boolean;
  botUsername?: string;
  apiKey?: string;
  botApiKey?: string;
  botId?: number;
  botOwnerUserId?: string;
  botCommands?: BotCommand[];
  commands?: BotCommand[];
  erpInitials?: string;
  erpRole?: string;
};

export type BotCommand = {
  command: string;
  description: string;
};

const BOT_NAME_PATTERN = /^(бот|bot)\b/i;
const MAX_BOT_COMMANDS = 50;

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

export const isDeletedBotUser = (user?: IUser | null): boolean => {
  const meta = parseBotMeta(user?.ex);
  return Boolean(meta.isDeletedBot || user?.nickname === 'deleted_bot');
};

export const isBotUser = (user?: IUser | null): boolean => {
  if (isDeletedBotUser(user)) {
    return false;
  }

  const meta = parseBotMeta(user?.ex);

  if (
    user?.isBot ||
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

  if (isDeletedBotUser(topic.user)) {
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

export const getBotId = (user?: IUser | null): number | null => {
  const meta = parseBotMeta(user?.ex);
  return typeof meta.botId === 'number' ? meta.botId : null;
};

export const getBotOwnerUserId = (user?: IUser | null): string => {
  const meta = parseBotMeta(user?.ex);
  return typeof meta.botOwnerUserId === 'string' ? meta.botOwnerUserId : '';
};

export const normalizeBotCommandName = (value: string): string => {
  const normalized = value
    .trim()
    .replace(/^\/+/, '')
    .split(/\s+/)[0]
    ?.replace(/[^\w-]/g, '');

  return normalized ? `/${normalized}` : '';
};

const normalizeBotCommand = (value: unknown): BotCommand | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const command = normalizeBotCommandName(
    String(record.command || record.name || '')
  );

  if (!command) {
    return null;
  }

  return {
    command,
    description:
      typeof record.description === 'string' ? record.description.trim() : ''
  };
};

export const normalizeBotCommands = (commands: unknown): BotCommand[] => {
  if (!Array.isArray(commands)) {
    return [];
  }

  const seenCommands = new Set<string>();
  const normalizedCommands: BotCommand[] = [];

  for (const command of commands) {
    const normalized = normalizeBotCommand(command);

    if (!normalized) {
      continue;
    }

    const key = normalized.command.toLowerCase();

    if (seenCommands.has(key)) {
      continue;
    }

    seenCommands.add(key);
    normalizedCommands.push(normalized);

    if (normalizedCommands.length >= MAX_BOT_COMMANDS) {
      break;
    }
  }

  return normalizedCommands;
};

export const getBotCommands = (user?: IUser | null): BotCommand[] => {
  const meta = parseBotMeta(user?.ex);
  return normalizeBotCommands(meta.botCommands || meta.commands);
};

export const buildBotEx = (
  currentEx: unknown,
  payload: {
    username: string;
    apiKey: string;
    botId?: number;
    ownerUserId?: string;
  }
): string => {
  const metaWithoutCommands = { ...parseBotMeta(currentEx) };
  delete metaWithoutCommands.botCommands;
  delete metaWithoutCommands.commands;

  return JSON.stringify({
    ...metaWithoutCommands,
    isBot: true,
    botUsername: payload.username,
    botApiKey: payload.apiKey,
    ...(payload.botId !== undefined ? { botId: payload.botId } : {}),
    ...(payload.ownerUserId ? { botOwnerUserId: payload.ownerUserId } : {}),
    erpRole: metaWithoutCommands.erpRole || 'Бот'
  });
};

export const maskBotSecret = (value: string): string => {
  if (!value) {
    return '';
  }

  return '\u2022'.repeat(Math.max(8, Math.min(value.length, 24)));
};
