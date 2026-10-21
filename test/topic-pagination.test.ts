import { describe, expect, test } from 'bun:test';
import {
  collectTopicPages,
  hasNextTopicPage
} from '../src/utils/topic-pagination';

describe('пагинация чатов', () => {
  test('читает все страницы по серверной meta и удаляет дубликаты', async () => {
    const requests: number[][] = [];
    const applied: boolean[] = [];
    const result = await collectTopicPages(
      async (page, limit) => {
        requests.push([page, limit]);
        return {
          data:
            page === 1 ? [{ id: 'first' }] : [{ id: 'first' }, { id: 'last' }],
          meta: { totalItems: 2, totalPages: 2, currentPage: page }
        };
      },
      {
        onPage: (_, complete) => {
          applied.push(complete);
        }
      }
    );
    expect(requests).toEqual([
      [1, 50],
      [2, 50]
    ]);
    expect(result.map(topic => topic.id)).toEqual(['first', 'last']);
    expect(applied).toEqual([false, true]);
  });

  test('не принимает сбой второй страницы за полный список', async () => {
    const applied: boolean[] = [];
    await expect(
      collectTopicPages(
        async page => {
          if (page === 2) throw new Error('HTTP 503');
          return { data: [{ id: 'first' }], meta: { totalPages: 2 } };
        },
        {
          onPage: (_, complete) => {
            applied.push(complete);
          }
        }
      )
    ).rejects.toThrow('503');
    expect(applied).toEqual([false]);
  });

  test('останавливается при повторе страницы вместо бесконечных запросов', async () => {
    let requests = 0;
    await expect(
      collectTopicPages(async () => {
        requests++;
        return { data: [{ id: 'same' }], meta: { totalPages: 100 } };
      })
    ).rejects.toThrow('повторную');
    expect(requests).toBe(2);
  });

  test('не применяет поздний ответ прежней сессии', async () => {
    let current = true;
    let applied = false;
    await expect(
      collectTopicPages(
        async () => {
          current = false;
          return { data: [{ id: 'old' }], meta: { totalPages: 1 } };
        },
        {
          isCurrent: () => current,
          onPage: () => {
            applied = true;
          }
        }
      )
    ).rejects.toThrow('сессия');
    expect(applied).toBe(false);
  });

  test('поддерживает total и старый ответ без meta', () => {
    expect(hasNextTopicPage({ data: [], total: 51 }, 1, 50)).toBe(true);
    expect(hasNextTopicPage({ data: [], total: 51 }, 2, 50)).toBe(false);
    expect(hasNextTopicPage({ data: Array(50) }, 1, 50)).toBe(true);
    expect(hasNextTopicPage({ data: [] }, 2, 50)).toBe(false);
    expect(hasNextTopicPage({ data: [], meta: { totalPages: 0 } }, 1, 50)).toBe(
      false
    );
  });
});
