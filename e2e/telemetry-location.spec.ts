import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/__telemetry-location', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><div id="app"></div>'
    })
  );
  await page.goto('/__telemetry-location');
});

test('координаты собираются после включения и исчезают после отключения', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let calls = 0;
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (resolve: PositionCallback) => {
        calls += 1;
        resolve({
          timestamp: Date.now(),
          coords: { latitude: 40.18, longitude: 44.51, accuracy: 15 }
        } as GeolocationPosition);
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation();
    const before = { calls, context: geo.getTelemetryLocationContext() };
    await geo.useTelemetryLocation().setEnabled(true);
    const enabled = geo.getTelemetryLocationContext();
    await geo.useTelemetryLocation().setEnabled(false);
    await geo.refreshTelemetryLocation();
    return {
      before,
      enabled,
      disabled: geo.getTelemetryLocationContext(),
      calls
    };
  });
  expect(result.before.calls).toBe(0);
  expect(result.enabled.device).toMatchObject({
    source: 'device',
    latitude: 40.18,
    longitude: 44.51,
    accuracyMeters: 15
  });
  expect(result.disabled).toEqual({
    enabled: false,
    device: { status: 'disabled' }
  });
  expect(result.calls).toBe(1);
});

test('сохранённое согласие не вызывает повторный запрос разрешения ОС', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    localStorage.setItem('chat.telemetry.location.enabled.v1', 'true');
    let calls = 0;
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({ state: 'prompt' })
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: () => {
        calls += 1;
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation();
    return { calls, context: geo.getTelemetryLocationContext() };
  });
  expect(result.calls).toBe(0);
  expect(result.context.device).toEqual({ status: 'unavailable' });
});

test('отключение во время запроса не возвращает координаты в контекст', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let release!: PositionCallback;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) => {
        release = resolve;
        signalStarted();
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    const enabling = geo.useTelemetryLocation().setEnabled(true);
    await started;
    await geo.useTelemetryLocation().setEnabled(false);
    release({
      timestamp: Date.now(),
      coords: { latitude: 40, longitude: 44, accuracy: 20 }
    } as GeolocationPosition);
    await enabling;
    return geo.getTelemetryLocationContext();
  });
  expect(result).toEqual({ enabled: false, device: { status: 'disabled' } });
});

test('ошибка GPS оставляет диагностику без координат и показывает причину', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_: unknown, reject: PositionErrorCallback) =>
        reject({
          code: 1,
          message: 'Доступ запрещён'
        } as GeolocationPositionError)
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.useTelemetryLocation().setEnabled(true);
    return {
      context: geo.getTelemetryLocationContext(),
      error: geo.useTelemetryLocation().errorMessage.value
    };
  });
  expect(result.context.device).toEqual({ status: 'unavailable' });
  expect(result.error).toBeTruthy();
});
