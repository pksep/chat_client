import { expect, test, type Page } from '@playwright/test';
import { createAndroidPerformanceServer } from './fixtures/android-performance-server';

let fixture: Awaited<ReturnType<typeof createAndroidPerformanceServer>>;
const readStartupState = (page: Page, userId: string) =>
  page.evaluate(async id => {
    // Используем уже загруженные URL, включая версию HMR работающего Vite.
    const moduleUrl = (path: string) => {
      const entry = performance
        .getEntriesByType('resource')
        .find(row => new URL(row.name).pathname === path);
      if (!entry) throw new Error(`Модуль приложения не загружен: ${path}`);
      return entry.name;
    };
    const auth = await import(moduleUrl('/src/composables/useAuth.ts'));
    const directory = await import(moduleUrl('/src/composables/useUsers.ts'));
    return {
      authId: auth.getAuthUser()?.id,
      initials: directory.getUserById(id)?.initials
    };
  }, userId);
test.beforeAll(async () => {
  fixture = await createAndroidPerformanceServer({
    port: 5192,
    userCount: 4000,
    messagesPerTopic: 20
  });
});
test.afterAll(async () => {
  await fixture.close();
});

for (const { savedUser, cacheTopics } of [
  { savedUser: true, cacheTopics: true },
  { savedUser: false, cacheTopics: true },
  { savedUser: true, cacheTopics: false }
]) {
  test(`холодный запуск: ${!cacheTopics ? 'список без кеша не ждёт справочник' : savedUser ? 'справочник не блокирует чаты и поздний кеш не затирает сервер' : 'сессия без профиля восстанавливает пользователя из кеша'}`, async ({
    page,
    isMobile
  }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let releaseUsers!: () => void;
    const usersResponse = new Promise<void>(resolve => {
      releaseUsers = resolve;
    });
    let usersRequests = 0;
    let topicsRequests = 0;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (!['localhost', '127.0.0.1'].includes(url.hostname))
        return route.abort();
      if (url.pathname === '/__cold-start-seed')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Подготовка кеша</title>'
        });
      if (url.pathname === '/api/users') {
        usersRequests++;
        await usersResponse;
      }
      if (url.pathname === '/api/topics') topicsRequests++;
      return route.continue();
    });
    await page.goto('/__cold-start-seed');
    await page.evaluate(
      async ({
        origin,
        config,
        user,
        topics,
        users,
        savedUser,
        cacheTopics
      }) => {
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({
            token: 'chat-294-local-fixture',
            user: savedUser ? user : undefined
          })
        );
        sessionStorage.setItem('userId', user.id);
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        if (cacheTopics) {
          localStorage.setItem(
            `chat-offline-fast-topics-v1:${user.id}`,
            JSON.stringify(topics)
          );
        }
        localStorage.setItem(
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
        );
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('chat-offline-state-db', 2);
          request.onupgradeneeded = () =>
            request.result.createObjectStore('entities', {
              keyPath: 'cacheKey'
            });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('entities', 'readwrite');
            tx.objectStore('entities').put({
              cacheKey: `${user.id}:users`,
              userId: user.id,
              type: 'users',
              items: users.map(row => ({
                ...row,
                initials: `Старое имя ${row.id}`
              })),
              updatedAt: new Date().toISOString()
            });
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        });
      },
      {
        origin: fixture.origin,
        config: fixture.config,
        user: fixture.user,
        topics: fixture.topics,
        users: fixture.users,
        savedUser,
        cacheTopics
      }
    );
    await page.addInitScript(() => {
      const originalGet = IDBObjectStore.prototype.get;
      const success = Object.getOwnPropertyDescriptor(
        IDBRequest.prototype,
        'onsuccess'
      )!;
      const pending: (() => void)[] = [];
      let released = false;
      (window as any).heldUserCacheReads = 0;
      (window as any).releaseUserCache = () => {
        released = true;
        pending.splice(0).forEach(callback => callback());
      };
      IDBObjectStore.prototype.get = function (...args) {
        const request = originalGet.apply(this, args);
        if (this.name === 'entities' && String(args[0]).endsWith(':users')) {
          Object.defineProperty(request, 'onsuccess', {
            configurable: true,
            set(callback) {
              success.set!.call(request, (event: Event) => {
                if (released) callback.call(request, event);
                else {
                  (window as any).heldUserCacheReads++;
                  pending.push(() => callback.call(request, event));
                }
              });
            },
            get() {
              return success.get!.call(request);
            }
          });
        }
        return request;
      };
    });
    try {
      await page.goto('/');
      await expect
        .poll(() => page.evaluate(() => (window as any).heldUserCacheReads), {
          timeout: 30_000
        })
        .toBe(1);
      if (savedUser) {
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        if (isMobile)
          await page
            .getByRole('button', { name: 'Остаться в браузере' })
            .click();
        const row = page
          .locator('[data-testid*="-ContactList-Item"]:visible')
          .filter({ hasText: fixture.topics[1].user.initials })
          .first();
        await expect(row).toBeVisible();
        await row.click();
        await expect(page.locator('[data-message-id]').first()).toBeVisible();
        expect((await readStartupState(page, fixture.user.id)).authId).toBe(
          fixture.user.id
        );
        releaseUsers();
        await expect
          .poll(
            async () => (await readStartupState(page, fixture.user.id)).initials
          )
          .toBe(fixture.user.initials);
      } else {
        await expect(page.locator('#startup-shell')).toHaveCount(1);
      }
      await page.evaluate(() => (window as any).releaseUserCache());
      if (savedUser) {
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                performance.getEntriesByName('chat-startup:users-cache-ready')
                  .length
            )
          )
          .toBe(1);
        expect((await readStartupState(page, fixture.user.id)).initials).toBe(
          fixture.user.initials
        );
        expect(usersRequests).toBe(1);
        if (!cacheTopics) expect(topicsRequests).toBe(1);
      } else {
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        expect((await readStartupState(page, fixture.user.id)).authId).toBe(
          fixture.user.id
        );
      }
      expect(errors).toEqual([]);
    } finally {
      releaseUsers();
    }
  });
}
