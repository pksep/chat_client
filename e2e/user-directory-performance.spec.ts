import { expect, test } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';
import { writeFile } from 'node:fs/promises';

test.setTimeout(90_000);

test('индексная дедупликация сохраняет прежний порядок и выбор пользователя на неоднозначных данных', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const referencePath = '/e2e/fixtures/user-directory-reference.ts';
    const { filterVisibleUsers } = await import(/* @vite-ignore */ path);
    const { filterVisibleUsers: reference } = await import(
      /* @vite-ignore */ referencePath
    );
    let randomState = 294;
    const random = (max: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState % max;
    };
    for (let round = 0; round < 100; round++) {
      const rows = Array.from({ length: 500 }, (_, index) => {
        const initials = ['Иванов И. И.', 'Петров П. П.', '', undefined, 'Бот'][
          random(5)
        ];
        return {
          id: `test-${index}`,
          initials,
          nickname: [initials, '42', 'legacy', '', undefined][random(5)],
          avatarUrl: ['', 'a', 'b', undefined][random(4)],
          isBot: random(10) === 0,
          ex: [
            undefined,
            '{broken',
            '{"erpUserId":42}',
            { erpUserId: 0 },
            { isDeletedBot: true }
          ][random(5)]
        };
      });
      const expected = reference(rows);
      const actual = filterVisibleUsers(rows);
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        return { round, actual, expected };
    }
    const rows = Array.from({ length: 20_000 }, (_, index) => ({
      id: String(index),
      initials: 'Одинаковое имя',
      nickname: String(index),
      avatarUrl: `avatar-${index}`
    }));
    const start = performance.now();
    const actual = filterVisibleUsers(rows);
    return {
      matched: true,
      count: actual.length,
      sameNameMs: performance.now() - start
    };
  });
  expect(result).toMatchObject({ matched: true, count: 20_000 });
  expect((result as any).sameNameMs).toBeLessThan(500);
});

test('20 000 пользователей: чтение списка и поиск не перебирают справочник заново', async ({
  page
}, testInfo) => {
  await openFixture(page);
  await page.route('**/performance-api/users?*', route =>
    route.fulfill({
      json: {
        data: Array.from({ length: 20_000 }, (_, index) => ({
          id: `directory-${index}`,
          initials: `Сотрудник-${index}`,
          nickname: String(index),
          avatarUrl: `avatar-${index}`
        }))
      }
    })
  );
  const result = await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const { users } = await import(/* @vite-ignore */ path);
    const start = performance.now();
    await users.fetchAllUsers(1, 20_000);
    const loadMs = performance.now() - start;
    const started = performance.now();
    let count = 0;
    for (let index = 0; index < 20; index++)
      count += users.getUsersList().length;
    const listMs = performance.now() - started;
    const lookupStart = performance.now();
    let found = 0;
    for (let index = 0; index < 50_000; index++) {
      if (users.getUserById(`directory-${index % 20_000}`)) found++;
    }
    const lookupMs = performance.now() - lookupStart;
    const first = users.getUserById('directory-10');
    users.updateLocalUserStatus('directory-10', '2026-09-10T00:00:00Z', {
      text: 'На месте'
    });
    const updated = users.getUserById('directory-10');
    return {
      count,
      found,
      loadMs,
      listMs,
      lookupMs,
      sameList: users.getUsersList() === users.getUsersList(),
      updated: updated !== first && updated.status?.text === 'На месте'
    };
  });
  const path = testInfo.outputPath('user-directory-performance.json');
  await writeFile(path, JSON.stringify(result, null, 2));
  await testInfo.attach('user-directory-performance', {
    path,
    contentType: 'application/json'
  });
  expect(result.count).toBe(400_000);
  expect(result.found).toBe(50_000);
  expect(result.updated).toBe(true);
  expect(result.sameList).toBe(true);
  expect(result.listMs).toBeLessThan(250);
  expect(result.lookupMs).toBeLessThan(250);
});

test('слияние сохраняет статус и локального бота, канонические дубли и удаление работают', async ({
  page
}) => {
  await openFixture(page);
  await page.route('**/performance-api/users?*', route =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'legacy',
            initials: 'Иванов Иван Иванович',
            nickname: 'Иванов И. И.',
            avatarUrl: 'same'
          },
          {
            id: 'canonical',
            initials: 'Иванов Иван Иванович',
            nickname: '42',
            avatarUrl: 'same',
            ex: { erpUserId: 42 }
          },
          {
            id: 'different',
            initials: 'Иванов Иван Иванович',
            nickname: '43',
            avatarUrl: 'different'
          },
          { id: 'bot', initials: 'Иванов Иван Иванович', isBot: true },
          {
            id: 'deleted',
            initials: 'Удаленный аккаунт',
            isBot: true,
            ex: { isDeletedBot: true }
          }
        ]
      }
    })
  );
  const result = await page.evaluate(async () => {
    const path = '/e2e/fixtures/network-harness.ts';
    const { users } = await import(/* @vite-ignore */ path);
    users.upsertLocalUser({
      id: 'canonical',
      initials: 'Иванов И. И.',
      status: { text: 'Работаю' }
    });
    users.upsertLocalUser({
      id: 'local-bot-user-test',
      initials: 'Локальный бот',
      isBot: true
    });
    await users.fetchAllUsers();
    const first = users.getUsersList();
    const status = users.getUserById('canonical').status;
    users.upsertLocalUser({ id: 'canonical', status: null });
    const cleared = users.getUserById('canonical').status;
    users.removeLocalUser('different');
    return {
      ids: first.map((user: any) => user.id),
      status,
      cleared,
      removed: !users.getUserById('different'),
      finalCount: users.getUsersList().length
    };
  });
  expect(result).toEqual({
    ids: ['canonical', 'different', 'bot', 'local-bot-user-test'],
    status: { text: 'Работаю' },
    cleared: null,
    removed: true,
    finalCount: 3
  });
});
