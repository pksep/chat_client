import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/__telemetry-location', route =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><script type="module" src="/@vite/client"></script><div id="app"></div>'
    })
  );
  await page.goto('/__telemetry-location');
});

test('локация работает по умолчанию с системным разрешением, без настройки приложения', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let calls = 0;
    const permission = {
      state: 'prompt',
      onchange: null as null | (() => void)
    };
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => permission
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) => {
        calls += 1;
        permission.state = 'granted';
        permission.onchange?.();
        resolve({
          timestamp: Date.now(),
          coords: { latitude: 40.18, longitude: 44.51, accuracy: 15 }
        } as GeolocationPosition);
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation();
    const before = { calls, context: geo.getTelemetryLocationContext() };
    await geo.refreshTelemetryLocation(true);
    await geo.refreshTelemetryLocation(true);
    return {
      before,
      context: geo.getTelemetryLocationContext(),
      calls,
      preference: localStorage.getItem('chat.telemetry.location.enabled.v1')
    };
  });
  expect(result.before.calls).toBe(0);
  expect(result.before.context.device).toEqual({
    status: 'permission_required'
  });
  expect(result.context.device).toMatchObject({
    source: 'device',
    latitude: 40.18,
    longitude: 44.51,
    accuracyMeters: 15
  });
  expect(result.calls).toBe(1);
  expect(result.preference).toBeNull();
});

test('отклонённый или закрытый системный запрос не повторяется при каждом сообщении', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let calls = 0;
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({ state: 'prompt' })
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_: unknown, reject: PositionErrorCallback) => {
        calls += 1;
        reject({
          code: 1,
          message: 'Доступ запрещён'
        } as GeolocationPositionError);
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation(true);
    await geo.refreshTelemetryLocation(true);
    return { calls, context: geo.getTelemetryLocationContext() };
  });
  expect(result.calls).toBe(1);
  expect(result.context.device.latitude).toBeUndefined();
});

test('отзыв системного разрешения во время запроса не возвращает координаты в контекст', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let release!: PositionCallback;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    const permission = {
      state: 'granted',
      onchange: null as null | (() => void)
    };
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => permission
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) => {
        release = resolve;
        signalStarted();
      }
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    const refresh = geo.refreshTelemetryLocation(true);
    await started;
    permission.state = 'denied';
    permission.onchange?.();
    release({
      timestamp: Date.now(),
      coords: { latitude: 40, longitude: 44, accuracy: 20 }
    } as GeolocationPosition);
    await refresh;
    return geo.getTelemetryLocationContext();
  });
  expect(result.device).toEqual({ status: 'denied' });
});

test('ошибка GPS оставляет диагностику без координат и не прерывает выполнение', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({ state: 'granted' })
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_: unknown, reject: PositionErrorCallback) =>
        reject({
          code: 2,
          message: 'GPS недоступен'
        } as GeolocationPositionError)
    });
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation(true);
    return geo.getTelemetryLocationContext();
  });
  expect(result.device).toEqual({ status: 'unavailable' });
});

test('Android использует приблизительное разрешение без повторного запроса точного', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const calls: string[] = [];
    (window as any).androidBridge = {};
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'Geolocation',
          methods: [
            { name: 'checkPermissions', rtype: 'promise' },
            { name: 'requestPermissions', rtype: 'promise' },
            { name: 'getCurrentPosition', rtype: 'promise' }
          ]
        }
      ],
      async nativePromise(_: string, method: string) {
        calls.push(method);
        if (method === 'checkPermissions')
          return { location: 'prompt', coarseLocation: 'granted' };
        if (method === 'getCurrentPosition')
          return {
            timestamp: Date.now(),
            coords: { latitude: 40, longitude: 44, accuracy: 1000 }
          };
        throw new Error('Повторный запрос разрешения');
      }
    };
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.refreshTelemetryLocation(true);
    return { calls, context: geo.getTelemetryLocationContext() };
  });
  expect(result.calls).toEqual(['checkPermissions', 'getCurrentPosition']);
  expect(result.context.device).toMatchObject({
    latitude: 40,
    longitude: 44,
    accuracyMeters: 1000
  });
});
