import { getAuthUser } from './useAuth';
import {
  addTopicList,
  deleteTopic,
  deleteTopicFromList,
  getSelectedTopic,
  updateLocalTopicUser
} from './useTopics';
import { upsertLocalUser } from './useUsers';
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
    ex: buildBotEx(topic.user.ex, {
      username,
      apiKey
    })
  });

  updateLocalTopicUser(topic.user.id, {
    initials: payload.name.trim(),
    nickname: username,
    avatarUrl: payload.avatarUrl || '',
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
