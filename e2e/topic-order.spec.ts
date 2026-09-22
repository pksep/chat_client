import { expect, test } from '@playwright/test';
import type { ITopic } from '../src/components/interfaces/interfaces';
import {
  applyTopicPinSetting,
  sortTopicsByPinOrder
} from '../src/utils/topic-order';

const createTopic = (
  id: string,
  options: {
    isPin?: boolean;
    pinnedAt?: string | Date;
    lastMessageAt?: string | Date;
  } = {}
): ITopic =>
  ({
    id,
    type: 'DM',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    info: {
      isPin: options.isPin || false,
      isMute: false,
      pinnedAt: options.pinnedAt
    },
    lastMessage: options.lastMessageAt
      ? ({ createdAt: options.lastMessageAt } as ITopic['lastMessage'])
      : undefined
  }) as ITopic;

const sortedIds = (topics: ITopic[]) =>
  sortTopicsByPinOrder(topics).map(topic => topic.id);

test.describe('Порядок закреплённых чатов', () => {
  test('самое свежее закрепление находится первым', () => {
    const older = createTopic('older', {
      isPin: true,
      pinnedAt: '2026-09-20T10:00:00Z'
    });
    const newer = createTopic('newer');
    newer.info = applyTopicPinSetting(newer.info, {
      isPin: true,
      pinnedAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z')
    });

    expect(sortedIds([older, newer])).toEqual(['newer', 'older']);
  });

  test('новое сообщение не меняет порядок закреплённых чатов', () => {
    const newerPin = createTopic('newer-pin', {
      isPin: true,
      pinnedAt: '2026-09-21T10:00:00Z',
      lastMessageAt: '2026-09-21T10:00:00Z'
    });
    const olderPinWithNewMessage = createTopic('older-pin', {
      isPin: true,
      pinnedAt: '2026-09-20T10:00:00Z',
      lastMessageAt: '2026-09-22T10:00:00Z'
    });

    expect(sortedIds([olderPinWithNewMessage, newerPin])).toEqual([
      'newer-pin',
      'older-pin'
    ]);
  });

  test('повторное закрепление перемещает чат наверх', () => {
    const first = createTopic('first', {
      isPin: true,
      pinnedAt: '2026-09-21T10:00:00Z'
    });
    const second = createTopic('second', {
      isPin: true,
      pinnedAt: '2026-09-20T10:00:00Z'
    });

    second.info = applyTopicPinSetting(second.info, {
      isPin: false,
      updatedAt: new Date('2026-09-22T09:00:00Z')
    });
    second.info = applyTopicPinSetting(second.info, {
      isPin: true,
      updatedAt: new Date('2026-09-22T10:00:00Z')
    });

    expect(sortedIds([first, second])).toEqual(['second', 'first']);
  });

  test('незакреплённые чаты по-прежнему сортируются по сообщениям', () => {
    const older = createTopic('older', {
      lastMessageAt: '2026-09-20T10:00:00Z'
    });
    const newer = createTopic('newer', {
      lastMessageAt: '2026-09-21T10:00:00Z'
    });

    expect(sortedIds([older, newer])).toEqual(['newer', 'older']);
  });
});
