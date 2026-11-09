import { expect, test } from '@playwright/test';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

const topicId = 'call-material-topic';
const summary = {
  id: 'call-material-summary',
  roomId: 'call-material-room',
  topicId,
  recorderUserId: 'performance-user',
  status: 'READY',
  hasTranscript: true,
  transcript: 'Анна подготовит документ к пятнице.',
  videoStatus: 'FAILED',
  videoAvailable: false,
  createdAt: '2026-11-09T07:00:00Z'
};
const prompts = {
  brief: 'Сделать краткое содержание',
  actions: 'Список действий по звонку',
  prompt: 'Кто подготовит документ?'
};
const initialMessage = {
  ...makeMessages(topicId, 1)[0],
  text: 'Информация о звонке. Запись звонка найдена.',
  ex: {
    type: 'call-topic-default',
    callTopicDefault: { roomId: summary.roomId }
  }
};

for (const kind of ['brief', 'actions', 'prompt'] as const) {
  for (const failed of [false, true]) {
    test(`${kind}: ответ ${failed ? 'об ошибке' : 'AI'} появляется в чате без WebSocket`, async ({
      page
    }, testInfo) => {
      const state = await openFixture(page, { shell: true, count: 0 });
      const text = failed
        ? 'Не удалось авторизовать запрос к AI. Обновите страницу и повторите запрос.'
        : 'Анна подготовит документ к пятнице.';
      const botMessage = {
        ...makeMessages(topicId, 1)[0],
        id: `bot-${kind}`,
        text,
        senderUserId: 'zvonilka',
        senderUser: { id: 'zvonilka', name: 'Звонилка' },
        ex: { type: 'call-summary-bot-response' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isReadByMe: true
      };
      await page.route(
        `**/performance-api/messages/topic/${topicId}**`,
        route =>
          route.fulfill({
            json: new URL(route.request().url()).pathname.endsWith('/pinned')
              ? []
              : [initialMessage]
          })
      );
      await page.route('**/performance-api/calls/summaries/latest?**', route =>
        route.fulfill({ json: summary })
      );
      const requests: { authorization?: string; body: any }[] = [];
      await page.route(
        `**/performance-api/calls/summaries/${summary.id}/${kind}/send`,
        async route => {
          requests.push({
            authorization: route.request().headers().authorization,
            body: route.request().postDataJSON()
          });
          botMessage.createdAt = new Date().toISOString();
          botMessage.updatedAt = botMessage.createdAt;
          await route.fulfill({
            json: {
              text,
              message: botMessage,
              ...(failed ? { errorMessage: text } : {})
            }
          });
        }
      );
      await page.evaluate(
        async ({ topicId, summary, initialMessage }) => {
          const fixture = (window as any).topicPerformance;
          const authPath = '/src/composables/useLogin.ts';
          const { setAuthToken } = await import(/* @vite-ignore */ authPath);
          setAuthToken('current-user-access-token');
          fixture.setTopics([
            {
              id: topicId,
              type: 'GROUP',
              name: 'Звонилка',
              group: {
                id: topicId,
                description: `sep-chat:call-topic:v1:${summary.roomId}:performance-user`
              }
            }
          ]);
          fixture.seed(topicId, [initialMessage]);
          fixture.sdk.sendWebSocketEvent = (_type: string, payload: any) => {
            if (payload.text)
              fixture.messages.addMessageToLocal(topicId, {
                id: 'user-prompt',
                topicId,
                text: payload.text,
                type: 'TEXT',
                senderUserId: 'performance-user',
                senderUser: { id: 'performance-user', name: 'Тест' },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'DELIVERED',
                media: [],
                reactions: [],
                messageRead: [],
                isReadByMe: true
              });
            return true;
          };
          const routingPath = '/src/composables/navigation/useUrlRouting.ts';
          const { navigateToCall } = await import(
            /* @vite-ignore */ routingPath
          );
          navigateToCall(topicId);
        },
        { topicId, summary, initialMessage }
      );
      await expect(page).toHaveURL(`/call/${topicId}`);
      if (kind === 'prompt') {
        await page.evaluate(
          async ({ topicId, summary, prompt }) => {
            const path = '/src/services/useCallSummaries.ts';
            const service = await import(/* @vite-ignore */ path);
            await service.sendCallSummaryPromptToChat(topicId, prompt);
            await service.withCallSummaryTyping(topicId, () =>
              service.sendGeneratedCallPromptResponseToChat(
                summary,
                topicId,
                prompt
              )
            );
          },
          { topicId, summary, prompt: prompts.prompt }
        );
      } else {
        if (testInfo.project.name === 'chromium-mobile') {
          await page
            .getByRole('button', { name: 'Показать промпты звонка' })
            .click();
        }
        const button = page
          .locator('.call-topic-actions')
          .getByRole('button', { name: prompts[kind] });
        await expect(button).toBeEnabled();
        await button.click();
      }
      const response = page.locator(`[data-message-id="${botMessage.id}"]`);
      await expect(response).toContainText(text);
      await expect(
        page.locator('[data-message-id="user-prompt"]')
      ).toContainText(prompts[kind]);
      expect(requests).toEqual([
        {
          authorization: 'Bearer current-user-access-token',
          body: {
            targetTopicId: topicId,
            ...(kind === 'prompt' ? { prompt: prompts.prompt } : {})
          }
        }
      ]);
      // HTTP-ответ и последующее событие должны обновлять одно сообщение.
      await page.evaluate(botMessage => {
        (window as any).topicPerformance.emitChatEvent({
          type: 'changeMessage',
          payload: {
            type: 'NEW',
            topicId: botMessage.topicId,
            data: botMessage
          }
        });
      }, botMessage);
      await expect(response).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(async topicId => {
            const path = '/src/services/useCallSummaries.ts';
            const service = await import(/* @vite-ignore */ path);
            return service.isCallSummaryMaterialTypingInTopic(topicId);
          }, topicId)
        )
        .toBe(false);
      if (failed) {
        await page.screenshot({
          path: testInfo.outputPath(`call-${kind}-error.png`)
        });
      }
      expect(state.errors).toEqual([]);
    });
  }
}

test('обрыв соединения оставляет понятное сообщение об ошибке в чате', async ({
  page
}) => {
  const state = await openFixture(page, { shell: true, count: 0 });
  await page.route('**/performance-api/calls/summaries/*/prompt/send', route =>
    route.abort('connectionfailed')
  );
  await page.getByTestId('open-performance-0').click();
  const result = await page.evaluate(async summary => {
    const path = '/src/services/useCallSummaries.ts';
    const service = await import(/* @vite-ignore */ path);
    return service.withCallSummaryTyping('performance-0', () =>
      service.sendGeneratedCallPromptResponseToChat(
        summary,
        'performance-0',
        'Кто подготовит документ?'
      )
    );
  }, summary);
  expect(result).toBe(false);
  await expect(page.locator('.system-message-text')).toContainText(
    'Не удалось получить ответ по звонку. Проверьте соединение и повторите запрос.'
  );
  await page.evaluate(async () => {
    const path = '/e2e/fixtures/call-material-error.ts';
    const { mountCallMaterialErrorPreview } = await import(
      /* @vite-ignore */ path
    );
    mountCallMaterialErrorPreview('performance-0');
  });
  await expect(page.locator('.calls-bot__conversation')).toContainText(
    'Не удалось получить ответ по звонку. Проверьте соединение и повторите запрос.'
  );
  expect(state.errors).toEqual([]);
});
