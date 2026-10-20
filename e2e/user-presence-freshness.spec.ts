import { expect, test } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

test('частичная карточка справочника не скрывает сохранённое время посещения', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const users = await import('/src/composables/useUsers.ts');
    const lastOnline = '2026-10-20T09:00:00Z';
    users.upsertLocalUser({ id: 'partial-peer', initials: 'Сотрудник' } as any);
    const fallback = users.getUserLastOnline({
      id: 'partial-peer',
      lastOnline
    } as any);
    users.updateLocalUserStatus('partial-peer', new Date(lastOnline));
    users.upsertLocalUser({
      id: 'partial-peer',
      initials: 'Новое имя',
      lastOnline: undefined
    } as any);
    return {
      fallback,
      merged: users.getUserLastOnline(users.getUserById('partial-peer')!)
    };
  });
  expect(result.fallback).toBe('2026-10-20T09:00:00Z');
  expect(new Date(result.merged!).toISOString()).toBe(
    '2026-10-20T09:00:00.000Z'
  );
});

test('частичные события сохраняют независимо свежие статус и время посещения', async ({
  page
}) => {
  await openFixture(page);
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  const requested = new Promise<void>(resolve => (entered = resolve));
  await page.route('**/performance-api/users?*', async route => {
    entered();
    await gate;
    await route.fulfill({
      json: {
        data: [
          { id: 'partial-status', lastOnline: null, status: null },
          {
            id: 'partial-presence',
            lastOnline: '2026-10-20T09:00:00Z',
            status: { icon: '💼', text: 'Работаю' }
          }
        ]
      }
    });
  });
  await page.evaluate(async () => {
    const { users } = await import('/e2e/fixtures/network-harness.ts');
    for (const id of ['partial-status', 'partial-presence'])
      users.upsertLocalUser({
        id,
        initials: id,
        nickname: id,
        lastOnline: new Date('2026-10-20T08:00:00Z'),
        status: { icon: '⌛', text: 'Из кеша' }
      } as any);
    (window as any).__presenceRefresh = users.fetchAllUsers();
  });
  await requested;
  try {
    await page.evaluate(async () => {
      const { users } = await import('/e2e/fixtures/network-harness.ts');
      users.updateLocalUserStatus('partial-status', undefined, {
        icon: '🏖️',
        text: 'В отпуске'
      });
      users.updateLocalUserStatus('partial-presence', null);
    });
  } finally {
    release();
  }
  const result = await page.evaluate(async () => {
    await (window as any).__presenceRefresh;
    const { users } = await import('/e2e/fixtures/network-harness.ts');
    return ['partial-status', 'partial-presence'].map(id => {
      const user = users.getUserById(id)!;
      return {
        status: user.status?.text,
        lastOnline: users.getUserLastOnline(user)
      };
    });
  });
  expect(result).toEqual([
    { status: 'В отпуске', lastOnline: null },
    { status: 'Работаю', lastOnline: null }
  ]);
});

test('пагинация обновляет статусы за первой страницей и не откатывает WS во время HTTP', async ({
  page
}) => {
  await openFixture(page);
  await page.route('**/performance-api/users?*', async route => {
    const pageNumber = Number(
      new URL(route.request().url()).searchParams.get('page')
    );
    if (pageNumber === 2)
      await new Promise(resolve => setTimeout(resolve, 300));
    await route.fulfill({
      json: {
        data: [
          {
            id: `presence-${pageNumber}`,
            initials: `Сотрудник ${pageNumber}`,
            nickname: `presence-${pageNumber}`,
            lastOnline: null,
            status: null
          }
        ],
        meta: { totalItems: 2, totalPages: 2, currentPage: pageNumber }
      }
    });
  });
  const result = await page.evaluate(async () => {
    const { users } = await import('/e2e/fixtures/network-harness.ts');
    const loading = users.fetchAllUsers(1, 1);
    await new Promise(resolve => setTimeout(resolve, 150));
    users.upsertLocalUser({
      id: 'presence-1',
      initials: 'Сотрудник 1',
      nickname: 'presence-1',
      lastOnline: new Date('2026-10-20T09:30:00Z'),
      status: { icon: '🏖️', text: 'В отпуске' }
    } as any);
    await loading;
    return {
      first: users.getUserById('presence-1'),
      second: users.getUserById('presence-2'),
      secondOnline: users.getUserLastOnline(users.getUserById('presence-2')!)
    };
  });
  expect(result.first?.status?.text).toBe('В отпуске');
  expect(new Date(result.first!.lastOnline!).toISOString()).toBe(
    '2026-10-20T09:30:00.000Z'
  );
  expect(result.second?.status).toBeNull();
  expect(result.secondOnline).toBeNull();
});

test('неизвестное присутствие не считается онлайном, частичный статус сохраняет lastOnline', async ({
  page
}) => {
  await openFixture(page);
  const result = await page.evaluate(async () => {
    const { users } = await import('/e2e/fixtures/network-harness.ts');
    const { formatLastSeen } = await import('/src/utils/dateUtils.ts');
    const unknown = users.getUserLastOnline({ id: 'unknown' } as any);
    users.upsertLocalUser({
      id: 'presence-peer',
      lastOnline: new Date('2026-10-20T09:00:00Z')
    } as any);
    users.updateLocalUserStatus('presence-peer', undefined, {
      icon: '🏖️',
      text: 'В отпуске'
    });
    return {
      unknownOnline: unknown === null,
      unknownText: formatLastSeen(unknown),
      lastOnline: users.getUserLastOnline(users.getUserById('presence-peer')!),
      status: users.getUserById('presence-peer')?.status
    };
  });
  expect(result.unknownOnline).toBe(false);
  expect(result.unknownText).toBe('');
  expect(new Date(result.lastOnline!).toISOString()).toBe(
    '2026-10-20T09:00:00.000Z'
  );
  expect(result.status?.text).toBe('В отпуске');
});

test('скрытый дубликат сотрудника сохраняет актуальное присутствие по ID старого чата', async ({
  page
}) => {
  await openFixture(page);
  await page.route('**/performance-api/users?*', route =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'canonical-peer',
            initials: 'Сотрудник',
            nickname: '123',
            avatarUrl: 'same-avatar',
            lastOnline: null,
            ex: { erpUserId: 123 }
          },
          {
            id: 'legacy-peer',
            initials: 'Сотрудник',
            nickname: 'Сотрудник',
            avatarUrl: 'same-avatar',
            lastOnline: '2026-10-20T09:00:00Z',
            status: { icon: '🏖️', text: 'В отпуске' }
          }
        ]
      }
    })
  );
  const result = await page.evaluate(async () => {
    const { users } = await import('/e2e/fixtures/network-harness.ts');
    await users.fetchAllUsers();
    const legacy = users.getUserById('legacy-peer');
    return {
      count: users.getUsersList().length,
      legacy,
      lastOnline: legacy && users.getUserLastOnline(legacy)
    };
  });
  expect(result.count).toBe(1);
  expect(result.legacy?.status?.text).toBe('В отпуске');
  expect(new Date(result.lastOnline!).toISOString()).toBe(
    '2026-10-20T09:00:00.000Z'
  );
});
