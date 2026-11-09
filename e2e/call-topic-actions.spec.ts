import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { makeMessages, openFixture } from './fixtures/topic-performance-page';

for (const hasTopic of [false, true]) {
  test(`Действия звонка доступны ${hasTopic ? 'с топиком' : 'без топика'} в общем списке чатов`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000);
    const state = await openFixture(page, { shell: true });
    const topicId = 'call-actions-topic';
    const transcript = 'Обсудили задачи и договорились о следующей встрече.';
    const messages = makeMessages(topicId, 1).map(message => ({
      ...message,
      text: 'Информация о звонке. Запись звонка найдена.',
      ex: {
        type: 'call-topic-default',
        callTopicDefault: { roomId: 'call-actions-room' }
      }
    }));
    await page.route(`**/performance-api/messages/topic/${topicId}**`, route =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/pinned')
          ? []
          : messages
      })
    );
    await page.route('**/performance-api/calls/summaries/latest?**', route =>
      route.fulfill({
        json: {
          id: 'call-actions-summary',
          roomId: 'call-actions-room',
          topicId: 'source-topic',
          recorderUserId: 'performance-user',
          status: 'READY',
          hasTranscript: true,
          transcript,
          videoStatus: 'FAILED',
          videoAvailable: false,
          createdAt: '2026-11-09T07:00:00Z'
        }
      })
    );
    await page.evaluate(
      async ({ topicId, hasTopic, messages }) => {
        const fixture = (window as any).topicPerformance;
        fixture.setTopics(
          hasTopic
            ? [
                {
                  id: topicId,
                  type: 'GROUP',
                  name: 'Звонилка',
                  group: {
                    id: topicId,
                    description:
                      'sep-chat:call-topic:v1:call-actions-room:performance-user'
                  }
                }
              ]
            : []
        );
        fixture.seed(topicId, messages);
        const routingPath = '/src/composables/navigation/useUrlRouting.ts';
        const { navigateToCall } = await import(/* @vite-ignore */ routingPath);
        navigateToCall(topicId);
      },
      {
        topicId,
        hasTopic,
        messages
      }
    );
    await expect(page).toHaveURL(`/call/${topicId}`);
    if (testInfo.project.name === 'chromium-mobile') {
      await page
        .getByRole('button', { name: 'Показать промпты звонка' })
        .click();
    }
    const actions = page.locator('.call-topic-actions');
    await expect(actions).toBeInViewport();
    await expect(actions.getByRole('button')).toHaveCount(4);
    for (const name of [
      'Сделать краткое содержание',
      'Скачать транскрибацию звонка',
      'Список действий по звонку'
    ]) {
      await expect(actions.getByRole('button', { name })).toBeEnabled();
      await expect(actions.getByRole('button', { name })).toBeInViewport();
    }
    await expect(
      actions.getByRole('button', { name: 'Скачать видео-запись' })
    ).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('call-actions.png') });
    const started = page.waitForEvent('download');
    await actions
      .getByRole('button', { name: 'Скачать транскрибацию звонка' })
      .click();
    const download = await started;
    expect(download.suggestedFilename()).toBe(
      'Транскрибация-звонка-2026-11-09.txt'
    );
    expect(await download.failure()).toBeNull();
    expect(await readFile((await download.path())!, 'utf8')).toContain(
      transcript
    );
    expect(state.errors).toEqual([]);
  });
}
