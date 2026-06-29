import { getAuthUser } from './useAuth';
import {
  addTopicList,
  createTopic,
  deleteTopic,
  deleteTopicFromList,
  getSelectedTopic,
  updateLocalTopicUser
} from './useTopics';
import { upsertLocalUser } from './useUsers';
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
  buildBotEx,
  getBotApiKey,
  getBotUsername,
  isLocalBotTopicId
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
      apiKey
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

type GatewayBotResult = {
  id?: number;
  chat_user_id?: string;
  username?: string;
  display_name?: string;
  token?: string;
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
      'X-Owner-Id': authUser.id
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

  const chatUserId: string = result.chat_user_id;
  const token: string = result.token;

  // Открываем настоящий DM с только что созданным ботом-пользователем.
  const topic = await createTopic(chatUserId);

  if (!topic?.id) {
    throw new Error('Бот создан, но не удалось открыть диалог с ним');
  }

  // Помечаем пользователя как бота локально и сохраняем токен, чтобы клиент
  // распознавал бота, а форма редактирования показывала ключ.
  const ex = buildBotEx(topic.user?.ex, { username, apiKey: token });

  if (topic.user?.id) {
    upsertLocalUser({
      ...(topic.user as IUser),
      nickname: username,
      avatarUrl: avatarUrl || topic.user.avatarUrl || '',
      isBot: true,
      ex
    });
    updateLocalTopicUser(topic.user.id, {
      nickname: username,
      avatarUrl: avatarUrl || topic.user.avatarUrl || '',
      isBot: true,
      ex
    });
  }

  return { topic, token, chatUserId, username };
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

  upsertLocalUser({
    ...(topic.user as IUser),
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
    isBot: true,
    ex: buildBotEx(topic.user.ex, {
      username,
      apiKey
    })
  });

  updateLocalTopicUser(topic.user.id, {
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
    isBot: true,
    ex: buildBotEx(topic.user.ex, {
      username,
      apiKey
    })
  });
};

export const deleteBotTopic = async (topic: ITopic): Promise<void> => {
  if (!topic?.id) {
    return;
  }

  if (isLocalBotTopicId(topic.id)) {
    deleteTopicFromList(topic.id);
    return;
  }

  await deleteTopic(topic.id);
  deleteTopicFromList(topic.id);
};

export const getBotInitialForm = (topic?: ITopic | null) => ({
  name: topic?.name || topic?.user?.initials || '',
  username: getBotUsername(topic?.user),
  apiKey: getBotApiKey(topic?.user)
});
