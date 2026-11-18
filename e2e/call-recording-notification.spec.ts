import { expect, test, type Page } from '@playwright/test';
import { openFixture } from './fixtures/topic-performance-page';

const recording = {
  summaryId: 'recording-summary',
  roomId: 'recording-room',
  topicId: 'performance-0',
  recorderUserId: 'denis',
  recorderName: 'Денис'
};

async function prepare(page: Page) {
  const fixture = await openFixture(page, { topicCount: 1 });
  await page.evaluate(async () => {
    const callsPath = '/src/services/useCallState.ts';
    const summariesPath = '/src/services/useCallSummaries.ts';
    const notificationsPath = '/src/composables/useNotifications.ts';
    const calls = await import(/* @vite-ignore */ callsPath);
    const summaries = await import(/* @vite-ignore */ summariesPath);
    const { useNotifications } = await import(
      /* @vite-ignore */ notificationsPath
    );
    const notifications = useNotifications();
    notifications.closeNotification();
    summaries.ensureCallSummaryEvents();
    await Promise.resolve();
    (window as any).recordingFixture = { calls, summaries, notifications };
  });
  return fixture;
}

async function emitRecording(page: Page, payload = recording) {
  return page.evaluate(payload => {
    const { summaries, notifications } = (window as any).recordingFixture;
    (window as any).topicPerformance.emitChatEvent({
      type: 'callSummaryRecordingStarted',
      payload
    });
    return {
      notices: notifications.state.items.map(({ title, description }) => ({
        title,
        description
      })),
      recording: summaries.isAnyCallSummaryRecording(payload.roomId)
    };
  }, payload);
}

for (const scenario of [
  {
    name: 'в другом звонке того же чата',
    roomId: 'other-room',
    open: true,
    incoming: false
  },
  {
    name: 'после выхода из звонка',
    roomId: recording.roomId,
    open: false,
    incoming: false
  },
  {
    name: 'до принятия входящего звонка',
    roomId: recording.roomId,
    open: true,
    incoming: true
  },
  { name: 'без текущей комнаты', roomId: null, open: true, incoming: false }
]) {
  test(`запись не показывает уведомление ${scenario.name}`, async ({
    page
  }) => {
    const { errors } = await prepare(page);
    await page.evaluate(scenario => {
      const { calls } = (window as any).recordingFixture;
      calls.roomId.value = scenario.roomId;
      calls.topicId.value = 'performance-0';
      calls.open.value = scenario.open;
      calls.isIncoming.value = scenario.incoming;
    }, scenario);
    const result = await emitRecording(page);
    expect(result.notices).toEqual([]);
    expect(result.recording).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('уведомление текущего звонка работает в свёрнутом окне и не повторяется', async ({
  page
}) => {
  const { errors } = await prepare(page);
  await page.evaluate(roomId => {
    const { calls } = (window as any).recordingFixture;
    calls.roomId.value = roomId;
    calls.open.value = true;
    calls.isIncoming.value = false;
    calls.isModalVisible.value = false;
  }, recording.roomId);
  const expected = [
    { title: 'Запись звонка', description: 'Денис включил запись звонка' }
  ];
  expect((await emitRecording(page)).notices).toEqual(expected);
  expect((await emitRecording(page)).notices).toEqual(expected);
  await page.evaluate(() => {
    (window as any).recordingFixture.notifications.closeNotification();
  });
  const ownRecording = await emitRecording(page, {
    ...recording,
    summaryId: 'own-summary',
    recorderUserId: 'performance-user'
  });
  expect(ownRecording.notices).toEqual([
    { title: 'Запись звонка', description: 'Запись звонка включена' }
  ]);
  expect(errors).toEqual([]);
});

test('событие другого звонка не блокирует уведомление после перехода в его комнату', async ({
  page
}) => {
  const { errors } = await prepare(page);
  await page.evaluate(() => {
    const { calls } = (window as any).recordingFixture;
    calls.roomId.value = 'other-room';
    calls.open.value = true;
    calls.isIncoming.value = false;
  });
  expect((await emitRecording(page)).notices).toEqual([]);
  await page.evaluate(roomId => {
    (window as any).recordingFixture.calls.roomId.value = roomId;
  }, recording.roomId);
  expect((await emitRecording(page)).notices).toEqual([
    { title: 'Запись звонка', description: 'Денис включил запись звонка' }
  ]);
  expect(errors).toEqual([]);
});
