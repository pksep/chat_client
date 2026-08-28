import { ref } from 'vue';
import { getAuthUser, getStoredChatAccessToken } from './useAuth';
import {
  addTopicList,
  createTopic,
  getSelectedTopic,
  updateLocalTopicDetails,
  updateLocalTopicUser
} from './useTopics';
import { removeLocalUser, upsertLocalUser } from './useUsers';
import { getConfig } from '../services/useConfig';
import { uploadFile } from '../services/useChat';
import type {
  IMessage,
  ITopic,
  IUser
} from '../components/interfaces/interfaces';
import { TopicType, MessageStatus } from '../services/useChatSDK/types';
import { addMessageToLocal } from '../services/useMessages';
import { generateUUID } from '../utils/generateUUID';
import {
  LOCAL_BOT_TOPIC_ID_PREFIX,
  LOCAL_BOT_USER_ID_PREFIX,
  type BotCommand,
  buildBotEx,
  buildDeletedBotUser,
  getBotApiKey,
  getBotCommands,
  getBotId,
  getBotOwnerUserId,
  getBotUsername,
  isLocalBotTopicId,
  normalizeBotCommands
} from '../utils/bot';

export type CreateBotPayload = {
  name: string;
  username: string;
  avatarUrl?: string;
  avatarFile?: File | null;
};

const normalizeBotUsername = (value: string): string =>
  value.trim().replace(/^@+/, '');

const generateBotApiKey = (): string =>
  `bot_${generateUUID().replaceAll('-', '').slice(0, 20)}`;

const gatewayBotCommandsById = ref<Record<string, BotCommand[]>>({});
const gatewayBotCommandsByChatUserId = ref<Record<string, BotCommand[]>>({});

const normalizeIdentifier = (value?: string | null): string =>
  typeof value === 'string' ? value.trim() : '';

const resolveTopicBotUser = (
  topic?: ITopic | null,
  ownerUserId?: string | null
): IUser | null => {
  const topicUserId = normalizeIdentifier(topic?.user?.id);

  if (topicUserId) {
    return topic?.user || null;
  }

  return (
    topic?.members?.find(member => {
      const memberId = normalizeIdentifier(member.id);

      return (
        memberId &&
        memberId !== ownerUserId &&
        (member.isBot ||
          getBotId(member) ||
          getBotOwnerUserId(member) ||
          getBotUsername(member))
      );
    }) || null
  );
};

const resolveTopicBotChatUserId = (
  topic?: ITopic | null,
  ownerUserId?: string | null
): string => normalizeIdentifier(resolveTopicBotUser(topic, ownerUserId)?.id);

const mergeBotTopicMembers = (
  topic: ITopic,
  botUser: IUser,
  ownerUser: IUser
): IUser[] => {
  const members = topic.members?.length ? topic.members : [ownerUser, botUser];
  const nextMembers = members.map(member =>
    member.id === botUser.id ? botUser : member
  );

  if (!nextMembers.some(member => member.id === botUser.id)) {
    nextMembers.push(botUser);
  }

  return nextMembers;
};

export const getCachedBotCommands = (
  botId?: number | null,
  chatUserId?: string | null
): BotCommand[] | undefined => {
  if (botId) {
    return gatewayBotCommandsById.value[String(botId)];
  }

  if (chatUserId) {
    return gatewayBotCommandsByChatUserId.value[chatUserId];
  }

  return undefined;
};

export const createLocalBotTopic = (
  payload: CreateBotPayload
): ITopic | null => {
  const authUser = getAuthUser();

  if (!authUser?.id) {
    return null;
  }

  const topicId = `${LOCAL_BOT_TOPIC_ID_PREFIX}${generateUUID()}`;
  const userId = `${LOCAL_BOT_USER_ID_PREFIX}${generateUUID()}`;
  const username = normalizeBotUsername(payload.username);
  const apiKey = generateBotApiKey();
  const botUser = {
    ...authUser,
    id: userId,
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
    lastOnline: null,
    status: null,
    isBot: true,
    ex: buildBotEx(authUser.ex, {
      username,
      apiKey,
      ownerUserId: authUser.id
    })
  } as IUser;

  upsertLocalUser(botUser);

  const topic = {
    id: topicId,
    type: TopicType.DM,
    name: payload.name.trim(),
    avatarUrl: payload.avatarUrl || '',
    user: botUser,
    members: [authUser, botUser],
    info: {
      isMute: false,
      isPin: false,
      isMarkedUnread: false
    },
    unreadMessageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  } as unknown as ITopic;

  addTopicList(topic);

  const welcomeMessage = {
    id: generateUUID(),
    topicId,
    text: 'Добрый день, чем могу помочь?',
    senderUserId: botUser.id,
    senderUser: botUser,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    status: MessageStatus.Read,
    isRead: true,
    isReadByMe: true,
    isSystem: false,
    isEdit: false,
    isPin: false,
    media: []
  } as unknown as IMessage;

  addMessageToLocal(topicId, welcomeMessage);

  return getSelectedTopic(topicId) || topic;
};

export type CreateBotResult = {
  topic: ITopic;
  token: string;
  chatUserId: string;
  username: string;
};

const resolveBotGatewayUrl = (): string => {
  const base = (getConfig().CHAT_BOT_GATEWAY || '').replace(/\/+$/, '');

  if (!base) {
    throw new Error(
      'Сервис ботов (sep-bot) не настроен: отсутствует CHAT_BOT_GATEWAY'
    );
  }

  return base;
};

const resolveBotGatewayAuthHeaders = (): { Authorization: string } => {
  const accessToken = getStoredChatAccessToken();

  if (!accessToken) {
    throw new Error(
      'Не удалось авторизовать запрос к сервису ботов: access token не найден'
    );
  }

  return { Authorization: `Bearer ${accessToken}` };
};

type GatewayBotResult = {
  id?: number;
  chat_user_id?: string;
  username?: string;
  display_name?: string;
  description?: string;
  commands?: BotCommand[];
  is_active?: boolean;
  token?: string;
};

const cacheGatewayBotCommands = (bot?: GatewayBotResult | null): void => {
  if (!bot || bot.commands === undefined) {
    return;
  }

  const commands = normalizeBotCommands(bot.commands);

  if (bot.id) {
    gatewayBotCommandsById.value = {
      ...gatewayBotCommandsById.value,
      [String(bot.id)]: commands
    };
  }

  if (bot.chat_user_id) {
    gatewayBotCommandsByChatUserId.value = {
      ...gatewayBotCommandsByChatUserId.value,
      [bot.chat_user_id]: commands
    };
  }
};

const cacheGatewayBots = (bots?: GatewayBotResult[]): void => {
  bots?.forEach(cacheGatewayBotCommands);
};

const fetchGatewayBotsByOwner = async (): Promise<GatewayBotResult[]> => {
  const gateway = resolveBotGatewayUrl();
  const response = await fetch(`${gateway}/bots`, {
    headers: resolveBotGatewayAuthHeaders()
  });

  if (!response.ok) {
    throw new Error(
      await readGatewayError(
        response,
        `Сервис ботов вернул ошибку ${response.status}`
      )
    );
  }

  const body = (await response.json()) as { result?: GatewayBotResult[] };
  const bots = body.result || [];

  cacheGatewayBots(bots);

  return bots;
};

const fetchGatewayBotCommandsByChatUserId = async (
  chatUserId: string
): Promise<GatewayBotResult | null> => {
  const normalizedChatUserId = normalizeIdentifier(chatUserId);

  if (!normalizedChatUserId) {
    return null;
  }

  const gateway = resolveBotGatewayUrl();
  const response = await fetch(
    `${gateway}/bots/chat-users/${encodeURIComponent(normalizedChatUserId)}/commands`,
    { headers: resolveBotGatewayAuthHeaders() }
  );

  if (!response.ok) {
    throw new Error(
      await readGatewayError(
        response,
        `Сервис ботов вернул ошибку ${response.status}`
      )
    );
  }

  const body = (await response.json()) as { result?: GatewayBotResult | null };
  const bot = body.result || null;

  cacheGatewayBotCommands(bot);

  return bot;
};

export const loadBotCommandsViaGateway = async (
  topic?: ITopic | null
): Promise<BotCommand[]> => {
  const authUser = getAuthUser();
  const botId = getBotId(topic?.user);

  if (!topic?.user?.id) {
    return getBotCommands(topic?.user);
  }

  const botByChatUserId = await fetchGatewayBotCommandsByChatUserId(
    topic.user.id
  );

  if (botByChatUserId) {
    return normalizeBotCommands(botByChatUserId.commands);
  }

  if (!authUser?.id) {
    return getBotCommands(topic.user);
  }

  const bots = await fetchGatewayBotsByOwner();
  const bot = bots.find(
    item => (botId && item.id === botId) || item.chat_user_id === topic.user?.id
  );

  if (!bot) {
    return getBotCommands(topic.user);
  }

  return normalizeBotCommands(bot.commands);
};

const resolveGatewayBotId = async (
  topic: ITopic,
  ownerUserId: string
): Promise<number | null> => {
  const botUser = resolveTopicBotUser(topic, ownerUserId);
  const botId = getBotId(topic.user) || getBotId(botUser);
  const chatUserId = resolveTopicBotChatUserId(topic, ownerUserId);

  if (botId) {
    return botId;
  }

  const botByChatUserId = chatUserId
    ? await fetchGatewayBotCommandsByChatUserId(chatUserId).catch(() => null)
    : null;

  if (botByChatUserId?.id) {
    return botByChatUserId.id;
  }

  const botUsername = normalizeBotUsername(
    getBotUsername(topic.user) || getBotUsername(botUser)
  ).toLowerCase();
  const bots = await fetchGatewayBotsByOwner();
  const bot =
    bots.find(
      item =>
        (chatUserId && item.chat_user_id === chatUserId) ||
        (botUsername && item.username === botUsername)
    ) || null;

  return bot?.id || null;
};

const markBotTopicDeleted = (topic: ITopic): void => {
  const deletedUser = buildDeletedBotUser(
    resolveTopicBotUser(topic, getAuthUser()?.id)
  );

  if (!deletedUser) {
    return;
  }

  updateLocalTopicDetails(topic.id, {
    name: deletedUser.initials,
    avatarUrl: '',
    user: deletedUser,
    ...(topic.members
      ? {
          members: topic.members.map(member =>
            member.id === deletedUser.id ? deletedUser : member
          )
        }
      : {})
  });
  removeLocalUser(deletedUser.id);
};

type GatewayErrorBody = {
  message?: unknown;
  error?: { message?: unknown } | string;
  description?: unknown;
};

const formatErrorDetail = (value: unknown): string => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(formatErrorDetail).filter(Boolean).join(', ');
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      formatErrorDetail(record.message) ||
      formatErrorDetail(record.description) ||
      JSON.stringify(value)
    );
  }

  return String(value);
};

const readGatewayError = async (
  response: Response,
  fallback: string
): Promise<string> => {
  try {
    const errorBody = (await response.json()) as GatewayErrorBody;
    const detail =
      errorBody?.message ??
      (typeof errorBody?.error === 'object'
        ? errorBody.error.message
        : errorBody?.error) ??
      errorBody?.description;
    return formatErrorDetail(detail) || fallback;
  } catch {
    return fallback;
  }
};

// Создаёт бота через шлюз sep-bot: бот заводится как реальный пользователь
// chat_server (is_bot=true), шлюз отдаёт API-токен, после чего открываем
// настоящий DM с этим пользователем. Токен показывается один раз.
export const createBotViaGateway = async (
  payload: CreateBotPayload
): Promise<CreateBotResult | null> => {
  const authUser = getAuthUser();

  if (!authUser?.id) {
    throw new Error(
      'Не удалось определить владельца: нет авторизованного пользователя'
    );
  }

  const username = normalizeBotUsername(payload.username).toLowerCase();
  const gateway = resolveBotGatewayUrl();
  const avatarUrl = payload.avatarFile
    ? (await uploadFile(payload.avatarFile)).path
    : payload.avatarUrl;

  const response = await fetch(`${gateway}/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...resolveBotGatewayAuthHeaders()
    },
    body: JSON.stringify({
      username,
      displayName: payload.name.trim(),
      avatarUrl
    })
  });

  if (!response.ok) {
    let message = `Сервис ботов вернул ошибку ${response.status}`;

    try {
      const errorBody = (await response.json()) as GatewayErrorBody;
      const detail =
        errorBody?.message ??
        (typeof errorBody?.error === 'object'
          ? errorBody.error.message
          : errorBody?.error) ??
        errorBody?.description;
      message = formatErrorDetail(detail) || message;
    } catch {
      // тело ошибки не JSON — оставляем дефолтное сообщение
    }

    throw new Error(message);
  }

  const body = (await response.json()) as { result?: GatewayBotResult };
  const result = body?.result;

  if (!result?.chat_user_id || !result?.token) {
    throw new Error('Сервис ботов вернул неполный ответ');
  }

  cacheGatewayBotCommands(result);

  const chatUserId: string = result.chat_user_id;
  const token: string = result.token;

  // Открываем настоящий DM с только что созданным ботом-пользователем.
  const topic = await createTopic(chatUserId);

  if (!topic?.id) {
    throw new Error('Бот создан, но не удалось открыть диалог с ним');
  }

  // Помечаем пользователя как бота локально и сохраняем токен, чтобы клиент
  // распознавал бота, а форма редактирования показывала ключ.
  const ex = buildBotEx(topic.user?.ex, {
    username,
    apiKey: token,
    botId: result.id,
    ownerUserId: authUser.id
  });

  const existingBotUser =
    topic.user?.id === chatUserId
      ? topic.user
      : topic.members?.find(member => member.id === chatUserId);
  const botUser = {
    ...(existingBotUser || {}),
    id: chatUserId,
    initials: result.display_name || payload.name.trim(),
    nickname: username,
    avatarUrl: avatarUrl || existingBotUser?.avatarUrl || '',
    lastOnline: existingBotUser?.lastOnline || null,
    status: existingBotUser?.status || null,
    isBot: true,
    ex
  } as IUser;

  upsertLocalUser(botUser);
  updateLocalTopicDetails(topic.id, {
    name: botUser.initials,
    avatarUrl: botUser.avatarUrl || '',
    user: botUser,
    members: mergeBotTopicMembers(topic, botUser, authUser as IUser)
  });
  updateLocalTopicUser(botUser.id, {
    initials: botUser.initials,
    nickname: botUser.nickname,
    avatarUrl: botUser.avatarUrl || '',
    isBot: true,
    ex
  });

  return {
    topic: getSelectedTopic(topic.id) || topic,
    token,
    chatUserId,
    username
  };
};

export const updateLocalBotTopic = (
  topic: ITopic,
  payload: {
    name: string;
    username: string;
    apiKey: string;
    avatarUrl?: string;
  }
): void => {
  if (!topic?.user?.id) {
    return;
  }

  const username = normalizeBotUsername(payload.username);
  const apiKey = payload.apiKey || getBotApiKey(topic.user);
  const botId = getBotId(topic.user) || undefined;

  upsertLocalUser({
    ...(topic.user as IUser),
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
    isBot: true,
    ex: buildBotEx(topic.user.ex, {
      username,
      apiKey,
      botId
    })
  });

  updateLocalTopicUser(topic.user.id, {
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
    isBot: true,
    ex: buildBotEx(topic.user.ex, {
      username,
      apiKey,
      botId
    })
  });
};

export const updateBotTopic = async (
  topic: ITopic,
  payload: {
    name: string;
    username: string;
    apiKey: string;
    avatarUrl?: string;
  }
): Promise<void> => {
  const botId = getBotId(topic.user);

  if (!botId || isLocalBotTopicId(topic.id)) {
    updateLocalBotTopic(topic, payload);
    return;
  }

  const authUser = getAuthUser();

  if (!authUser?.id) {
    throw new Error(
      'Не удалось обновить бота: нет авторизованного пользователя'
    );
  }

  const username = normalizeBotUsername(payload.username).toLowerCase();
  const gateway = resolveBotGatewayUrl();
  const response = await fetch(`${gateway}/bots/${botId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...resolveBotGatewayAuthHeaders()
    },
    body: JSON.stringify({
      username,
      displayName: payload.name.trim(),
      avatarUrl: payload.avatarUrl || undefined
    })
  });

  if (!response.ok) {
    throw new Error(
      await readGatewayError(
        response,
        `Сервис ботов вернул ошибку ${response.status}`
      )
    );
  }

  const body = (await response.json()) as { result?: GatewayBotResult };
  const result = body?.result;
  const nextUsername = result?.username || username;
  const nextName = result?.display_name || payload.name.trim();
  const apiKey = payload.apiKey || getBotApiKey(topic.user);
  const avatarUrl = payload.avatarUrl || topic.user?.avatarUrl || '';
  const nextBotId = result?.id || botId;
  cacheGatewayBotCommands(result);

  updateLocalBotTopic(topic, {
    ...payload,
    name: nextName,
    username: nextUsername,
    apiKey,
    avatarUrl
  });

  if (topic.user?.id) {
    const ex = buildBotEx(topic.user.ex, {
      username: nextUsername,
      apiKey,
      botId: nextBotId
    });

    upsertLocalUser({
      ...(topic.user as IUser),
      initials: nextName,
      nickname: nextUsername,
      avatarUrl,
      isBot: true,
      ex
    });
    updateLocalTopicUser(topic.user.id, {
      initials: nextName,
      nickname: nextUsername,
      avatarUrl,
      isBot: true,
      ex
    });
  }
};

export const deleteBotTopic = async (topic: ITopic): Promise<void> => {
  if (!topic?.id) {
    return;
  }

  if (isLocalBotTopicId(topic.id)) {
    markBotTopicDeleted(topic);
    return;
  }

  const authUser = getAuthUser();

  if (authUser?.id) {
    const botId = await resolveGatewayBotId(topic, authUser.id);

    if (!botId) {
      throw new Error(
        'Не удалось удалить бота: sep-bot не нашел запись по chat user id'
      );
    }

    const gateway = resolveBotGatewayUrl();
    const response = await fetch(`${gateway}/bots/${botId}/deactivate`, {
      method: 'POST',
      headers: resolveBotGatewayAuthHeaders()
    });

    if (!response.ok) {
      const message = await readGatewayError(
        response,
        `Сервис ботов вернул ошибку ${response.status}`
      );

      if (response.status === 404 && message.includes('Бот не найден')) {
        markBotTopicDeleted(topic);
        return;
      }

      throw new Error(message);
    }

    markBotTopicDeleted(topic);
    return;
  }

  throw new Error('Не удалось удалить бота: не найден текущий пользователь');
};

export const getBotInitialForm = (topic?: ITopic | null) => {
  const cachedCommands = getCachedBotCommands(
    getBotId(topic?.user),
    topic?.user?.id
  );

  return {
    name: topic?.name || topic?.user?.initials || '',
    username: getBotUsername(topic?.user),
    apiKey: getBotApiKey(topic?.user),
    commands: cachedCommands ?? getBotCommands(topic?.user)
  };
};
