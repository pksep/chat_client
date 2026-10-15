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
    await Promise.all([
      geo.initTelemetryLocation(),
      geo.initTelemetryLocation()
    ]);
    await geo.refreshTelemetryLocation();
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
    await geo.initTelemetryLocation();
    await geo.initTelemetryLocation();
    await geo.refreshTelemetryLocation();
    return { calls, context: geo.getTelemetryLocationContext() };
  });
  expect(result.calls).toBe(1);
  expect(result.context.device.latitude).toBeUndefined();
});

test('отправка текста и вложения без разрешения не открывает системный запрос', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    let requests = 0;
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({ state: 'prompt' })
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: () => {
        requests += 1;
      }
    });
    const { telemetry, telemetryLocation: geo } = await import(
      '/e2e/fixtures/telemetry-storage-harness.ts'
    );
    for (const name of [
      'chat.message_send.start',
      'upload.message_send.start'
    ]) {
      telemetry.recordTelemetryEvent({ category: 'chat', name });
      await geo.refreshTelemetryLocation();
    }
    return { requests, context: geo.getTelemetryLocationContext() };
  });
  expect(result.requests).toBe(0);
  expect(result.context.device).toEqual({ status: 'permission_required' });
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
    const refresh = geo.initTelemetryLocation();
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
    await geo.initTelemetryLocation();
    return geo.getTelemetryLocationContext();
  });
  expect(result.device).toEqual({ status: 'unavailable' });
});

test('Android использует приблизительное разрешение без повторного запроса точного', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    const calls: string[] = [];
    let highAccuracy: boolean | undefined;
    (window as any).androidBridge = {};
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'LaunchStartup',
          methods: [{ name: 'waitForPermissions', rtype: 'promise' }]
        },
        {
          name: 'Geolocation',
          methods: [
            { name: 'checkPermissions', rtype: 'promise' },
            { name: 'requestPermissions', rtype: 'promise' },
            { name: 'getCurrentPosition', rtype: 'promise' }
          ]
        }
      ],
      async nativePromise(
        _: string,
        method: string,
        options?: { enableHighAccuracy?: boolean }
      ) {
        calls.push(method);
        if (method === 'waitForPermissions') return;
        if (method === 'checkPermissions')
          return { location: 'prompt', coarseLocation: 'granted' };
        if (method === 'getCurrentPosition') {
          highAccuracy = options?.enableHighAccuracy;
          return {
            timestamp: Date.now(),
            coords: { latitude: 40, longitude: 44, accuracy: 1000 }
          };
        }
        throw new Error('Повторный запрос разрешения');
      }
    };
    const geo = await import('/src/services/useTelemetryLocation.ts');
    await geo.initTelemetryLocation();
    return { calls, highAccuracy, context: geo.getTelemetryLocationContext() };
  });
  expect(result.calls).toEqual([
    'waitForPermissions',
    'checkPermissions',
    'getCurrentPosition'
  ]);
  expect(result.highAccuracy).toBe(false);
  expect(result.context.device).toMatchObject({
    latitude: 40,
    longitude: 44,
    accuracyMeters: 1000
  });
});

for (const permission of ['granted', 'denied'] as const) {
  test(`Android ждёт завершения нативного запроса: ${permission}`, async ({
    page
  }) => {
    const result = await page.evaluate(async permission => {
      const calls: string[] = [];
      let finishPermissions!: () => void;
      let started!: () => void;
      const waiting = new Promise<void>(resolve => {
        started = resolve;
      });
      (window as any).androidBridge = {};
      (window as any).Capacitor = {
        PluginHeaders: [
          {
            name: 'LaunchStartup',
            methods: [{ name: 'waitForPermissions', rtype: 'promise' }]
          },
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
          if (method === 'waitForPermissions') {
            started();
            return new Promise<void>(resolve => {
              finishPermissions = resolve;
            });
          }
          if (method === 'checkPermissions')
            return { location: permission, coarseLocation: permission };
          if (method === 'getCurrentPosition')
            return {
              timestamp: Date.now(),
              coords: { latitude: 40, longitude: 44, accuracy: 20 }
            };
          throw new Error('Повторный системный запрос через плагин');
        }
      };
      const geo = await import('/src/services/useTelemetryLocation.ts');
      const initialization = geo.initTelemetryLocation();
      await waiting;
      const beforePermission = [...calls];
      finishPermissions();
      await initialization;
      await geo.initTelemetryLocation();
      return {
        beforePermission,
        calls,
        context: geo.getTelemetryLocationContext()
      };
    }, permission);
    expect(result.beforePermission).toEqual(['waitForPermissions']);
    expect(result.calls).toEqual([
      'waitForPermissions',
      'checkPermissions',
      ...(permission === 'granted' ? ['getCurrentPosition'] : [])
    ]);
    expect(result.context.device.status).toBe(
      permission === 'granted' ? 'resolved' : 'denied'
    );
  });
}
