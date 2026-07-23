import { expect, test } from '@playwright/test';
import type {
  IMessage,
  ITopic,
  IUser
} from '../src/components/interfaces/interfaces';
import {
  FAVORITE_TOPIC_DESCRIPTION,
  FAVORITE_TOPIC_NAME,
  filterFavoriteTopicSystemMessages,
  isFavoriteTopic,
  normalizeFavoriteTopic
} from '../src/utils/favorite-topic';
import { matchesTopicSearch } from '../src/utils/searchMatch';
import { getTopicsByChatsToolbarFilter } from '../src/utils/chats-toolbar-filter';

const authUser = { id: 'current-user' } as IUser;

const createTopic = (changes: Partial<ITopic> = {}): ITopic =>
  ({
    id: 'favorite-topic-id',
    type: 'GROUP',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    info: {
      isPin: true,
      isMute: false,
      isMarkedUnread: false
    },
    members: [authUser],
    group: {
      id: 'favorite-group-id',
      title: FAVORITE_TOPIC_NAME,
      description: FAVORITE_TOPIC_DESCRIPTION
    },
    ...changes
  }) as ITopic;

const createMessage = (id: string, isSystem: boolean, text: string): IMessage =>
  ({
    id,
    topicId: 'favorite-topic-id',
    senderUserId: authUser.id,
    text,
    isSystem
  }) as IMessage;

test.describe('Избранные сообщения', () => {
  test('распознаёт серверную группу с маркером и одним авторизованным пользователем', () => {
    expect(isFavoriteTopic(createTopic(), authUser.id)).toBe(true);
  });

  test('не принимает за Избранное топик со вторым участником', () => {
    const topic = createTopic({
      members: [authUser, { id: 'peer-user' } as IUser]
    });

    expect(isFavoriteTopic(topic, authUser.id)).toBe(false);
  });

  test('не принимает за Избранное обычную одноучастниковую группу без маркера', () => {
    const topic = createTopic({
      group: {
        ...createTopic().group,
        description: 'Обычная группа'
      } as ITopic['group']
    });

    expect(isFavoriteTopic(topic, authUser.id)).toBe(false);
  });

  test('сохраняет серверный тип GROUP и скрывает системный preview', () => {
    const normalized = normalizeFavoriteTopic(
      createTopic({
        lastMessage: createMessage(
          'system-message',
          true,
          'Князян Э. А. создал группу'
        )
      }),
      authUser.id
    );

    expect(normalized).toMatchObject({
      id: 'favorite-topic-id',
      type: 'GROUP',
      isFavorite: true,
      name: FAVORITE_TOPIC_NAME,
      avatarUrl: '',
      activeCall: null,
      typingUserIds: []
    });
    expect(normalized.user).toBeUndefined();
    expect(normalized.lastMessage).toBeUndefined();
  });

  test('не отдаёт системные сообщения в viewport Избранного', () => {
    const systemMessage = createMessage(
      'system-message',
      true,
      'Князян Э. А. создал группу'
    );
    const userMessage = createMessage(
      'user-message',
      false,
      'Первое сообщение'
    );

    expect(
      filterFavoriteTopicSystemMessages(
        createTopic(),
        [systemMessage, userMessage],
        authUser.id
      )
    ).toEqual([userMessage]);
  });

  test('находится по имени и входит только в фильтр Все', () => {
    const topic = normalizeFavoriteTopic(
      createTopic({ unreadMessageCount: 1 }),
      authUser.id
    );
    const topics = [topic];

    expect(matchesTopicSearch(topic, 'избранное')).toBe(true);
    expect(getTopicsByChatsToolbarFilter(topics, 'all', authUser.id)).toEqual([
      topic
    ]);
    expect(getTopicsByChatsToolbarFilter(topics, 'chats', authUser.id)).toEqual(
      []
    );
    expect(
      getTopicsByChatsToolbarFilter(topics, 'groups', authUser.id)
    ).toEqual([]);
    expect(getTopicsByChatsToolbarFilter(topics, 'bots', authUser.id)).toEqual(
      []
    );
  });
});
