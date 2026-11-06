import { afterEach, expect, mock, test } from 'bun:test';

const events: Array<{
  name: string;
  traceId?: string;
  payload: Record<string, unknown>;
}> = [];
let unavailable = false;
let nextTrace = 0;
mock.module('../src/services/useTelemetry', () => ({
  createTelemetryTraceId: () => `request-${++nextTrace}`,
  recordTelemetryEvent: (event: (typeof events)[number]) => {
    if (unavailable) throw new Error('Телеметрия недоступна');
    events.push(event);
  }
}));
mock.module('@pksep/yui', () => ({
  MessageTypeEnum: { error: 'error', success: 'success' }
}));

const { recordErrorRequest } = await import(
  '../src/services/error-notification-telemetry'
);
const { showErrorNotification, showNotification, useNotifications } =
  await import('../src/composables/useNotifications');
const { state, closeNotification } = useNotifications();

afterEach(() => {
  closeNotification();
  events.length = 0;
  unavailable = false;
});

test('плашка связана с таймаутом запроса и сохраняет оба места вызова', () => {
  const error = new DOMException('signal timed out', 'TimeoutError');
  recordErrorRequest(error, {
    source: 'managerRequest',
    url: 'https://user:secret@synthetic.invalid/api/manager/access?token=secret#secret',
    method: 'GET',
    elapsedMs: 20003,
    timeoutMs: 20000,
    phase: 'request'
  });
  showErrorNotification(error.message, {
    error,
    source: 'manager.inquiries.refresh'
  });

  expect(state.items[0].description).toBe('signal timed out');
  expect(events.map(event => event.name)).toEqual([
    'network.request.failed',
    'notification.error.shown'
  ]);
  expect(events[1].traceId).toBe(events[0].traceId);
  expect(events[1].payload).toMatchObject({
    source: 'manager.inquiries.refresh',
    errorName: 'TimeoutError',
    errorMessage: 'signal timed out',
    requestPath: '/api/manager/access',
    method: 'GET',
    elapsedMs: 20003,
    timeoutMs: 20000,
    notificationStack: expect.arrayContaining([
      expect.stringContaining('errorNotificationTelemetry.test.ts')
    ])
  });
  expect(JSON.stringify(events)).not.toContain('secret');
});

test('обычная строковая ошибка записывается без изменения текста плашки', () => {
  showErrorNotification('Не удалось выполнить действие');

  expect(state.items[0].description).toBe('Не удалось выполнить действие');
  expect(events).toHaveLength(1);
  expect(events[0].payload.description).toBe('Не удалось выполнить действие');
  expect(events[0].payload.notificationStack).toEqual(
    expect.arrayContaining([
      expect.stringContaining('errorNotificationTelemetry.test.ts')
    ])
  );
});

test('успешные уведомления не записываются как ошибки', () => {
  showNotification({
    title: 'Готово',
    description: 'Сохранено',
    type: 'success' as never
  });
  expect(state.items).toHaveLength(1);
  expect(events).toEqual([]);
});

test('диагностика удаляет секреты из сообщений и стеков', () => {
  const error = new Error(
    'GET https://user:secret@synthetic.invalid/api/access?token=secret#secret Bearer secret access_token=secret'
  );
  error.stack =
    'Error\n    at request (https://user:secret@synthetic.invalid/assets/app.js?token=secret#secret)';
  showErrorNotification(error);

  expect(state.items[0].description).toContain('secret');
  expect(JSON.stringify(events)).not.toContain('secret');
  expect(events[0].payload.errorMessage).toContain(
    'https://synthetic.invalid/api/access'
  );
});

test('структурированная ошибка не передаёт заголовки и тело ответа', () => {
  showErrorNotification({
    message: 'Не удалось выполнить действие',
    request: { headers: { privateHeader: 'secret' }, body: 'secret' },
    response: { body: 'secret' }
  });

  expect(state.items[0].description).toBe('Не удалось выполнить действие');
  expect(events[0].payload.errorMessage).toBe('Не удалось выполнить действие');
  expect(JSON.stringify(events)).not.toContain('secret');
});

test('недоступная телеметрия не мешает показу и закрытию ошибки', () => {
  unavailable = true;
  const error = new Error('Сбой запроса');
  expect(() =>
    recordErrorRequest(error, {
      source: 'managerRequest',
      url: '/api/manager/access',
      method: 'GET',
      elapsedMs: 10,
      phase: 'request'
    })
  ).not.toThrow();
  expect(() => showErrorNotification(error)).not.toThrow();
  expect(state.items[0].description).toBe('Сбой запроса');
  closeNotification(state.items[0].key);
  expect(state.items).toEqual([]);
});
