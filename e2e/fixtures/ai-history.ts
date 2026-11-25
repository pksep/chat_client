import { test as base } from '@playwright/test';
export * from '@playwright/test';

// Общая граница серверной истории для UI-регрессий. Тесты протокола могут
// перекрыть этот маршрут своим ответом; настоящие бизнес-сервисы не вызываются.
export const test = base.extend<{ aiHistory: void }>({
  aiHistory: [
    async ({ page }, use) => {
      await page.route('**/users/me/access', async route => {
        const userId = await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('chat_auth_session') || '{}').user
              ?.id
        );
        return route.fulfill({
          json: {
            userId,
            erpUserId: null,
            erpRoleId: null,
            access: { client: true, ai: true },
            effective: { client: true, ai: true }
          }
        });
      });
      await page.route('**/response-models', route =>
        route.fulfill({ json: {
          defaults: { quick: 'model-a', advanced: 'model-a' },
          models: [
            { id: 'model-a', name: 'Модель А', efforts: ['low', 'high'], defaultEffort: 'low' },
            { id: 'model-b', name: 'Модель Б', efforts: ['low', 'high'], defaultEffort: 'high' }
          ]
        } })
      );
      await page.route('**/automations', route =>
        route.fulfill({ json: { automations: [] } })
      );
      await page.route('**/action-tasks/**', route => {
        if (route.request().method() !== 'GET')
          throw new Error(
            'Тест должен явно описать ответ на изменение поручения.'
          );
        return route.fulfill({ json: { tasks: [] } });
      });
      const states = new Map<
        string,
        { generation: number; deleted: boolean; protocol?: 0 | 1 }
      >();
      const receipts = new Map<
        string,
        { generation: number; deleted: boolean }
      >();
      await page.route('**/conversations/**', async route => {
        const path = new URL(route.request().url()).pathname.split('/');
        const index = path.indexOf('conversations');
        const id = path[index + 1];
        const state = states.get(id) ?? { generation: 0, deleted: false };
        if (
          route.request().method() === 'GET' &&
          path.at(-1) === 'messages' &&
          state.protocol === 1
        )
          return route.fulfill({
            json: {
              protocol: 1,
              generation: state.generation,
              messages: [],
              tasks: [],
              incompleteMessages: [],
              nextCursor: null
            }
          });
        if (route.request().method() === 'GET')
          return route.fulfill({ json: state });
        const request = route.request().postDataJSON();
        if (
          path.at(-1) === 'initialize' &&
          !state.deleted &&
          request.generation === state.generation
        ) {
          const next = { ...state, protocol: 1 as const };
          states.set(id, next);
          return route.fulfill({ json: next });
        }
        const key = `${id}:${request.operationId}`;
        if (receipts.has(key))
          return route.fulfill({ json: receipts.get(key) });
        if (state.deleted || request.generation !== state.generation)
          return route.fulfill({
            status: 409,
            json: {
              code: 'AI_CONVERSATION_CHANGED',
              userMessage: 'История чата уже изменена. Обновите чат.'
            }
          });
        const next = {
          generation: state.generation + 1,
          deleted: path.at(-1) === 'delete'
        };
        states.set(id, next);
        receipts.set(key, next);
        return route.fulfill({ json: next });
      });
      await use();
    },
    { auto: true }
  ]
});
