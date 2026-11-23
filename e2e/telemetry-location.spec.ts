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

test('Tauri: отказ геолокации переживает перезапуск, включение в профиле восстанавливает работу', async ({
  page
}) => {
  await page.addInitScript(() => {
    (window as any).isTauri = true;
    (window as any).locationRequests = 0;
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => ({
        state: sessionStorage.getItem('location-system-granted')
          ? 'granted'
          : 'prompt'
      })
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback, reject: PositionErrorCallback) => {
        (window as any).locationRequests++;
        if (!sessionStorage.getItem('location-system-granted')) {
          reject({
            code: 1,
            message: 'Тест: отказ геолокации'
          } as GeolocationPositionError);
        } else {
          resolve({
            timestamp: Date.now(),
            coords: { latitude: 40, longitude: 44, accuracy: 20 }
          } as GeolocationPosition);
        }
      }
    });
  });
  const initialize = () =>
    page.evaluate(async () => {
      const geo = await import('/src/services/useTelemetryLocation.ts');
      await geo.initTelemetryLocation();
      return {
        calls: (window as any).locationRequests,
        context: geo.getTelemetryLocationContext()
      };
    });
  await page.reload();
  expect((await initialize()).calls).toBe(1);
  await page.reload();
  expect((await initialize()).calls).toBe(0);
  await page.evaluate(() =>
    sessionStorage.setItem('location-system-granted', 'true')
  );
  await page.reload();
  expect((await initialize()).calls).toBe(0);
  await page.evaluate(async () => {
    const { saveDesktopPermissionChoice } = await import(
      '/src/services/desktop-permission-preferences.ts'
    );
    await saveDesktopPermissionChoice('geolocation', 'granted');
  });
  await page.reload();
  const allowed = await initialize();
  expect(allowed.calls).toBe(1);
  expect(allowed.context.device).toMatchObject({
    status: 'resolved',
    latitude: 40,
    longitude: 44
  });
  const saved = await page.evaluate(() =>
    localStorage.getItem('chat.desktop.permissions.v1')
  );
  expect(JSON.parse(saved!)).toEqual({ geolocation: 'granted' });
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

test('Tauri: отзыв геолокации во время записи ответа не публикует координаты и сохраняет отказ', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    (window as any).isTauri = true;
    const { mockIPC } = await import('/node_modules/@tauri-apps/api/mocks.js');
    let release!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => {
      signalStarted = resolve;
    });
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let saved: unknown;
    const commands: string[] = [];
    mockIPC(async (command, args) => {
      commands.push(command);
      if (command === 'desktop_load_permission_preferences') return {};
      if (command === 'desktop_save_permission_choice') {
        if (args.choice === 'granted') {
          signalStarted();
          await gate;
        }
        saved = args.choice;
      }
    });
    const { preferences: prefs, location: geo } = await import(
      '/e2e/fixtures/telemetry-location-permissions.ts'
    );
    await prefs.initializeDesktopPermissionPreferences();
    const permission = {
      state: 'granted',
      onchange: null as null | (() => void)
    };
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => permission
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) =>
        resolve({
          timestamp: Date.now(),
          coords: { latitude: 40, longitude: 44, accuracy: 20 }
        } as GeolocationPosition)
    });
    const refresh = geo.initTelemetryLocation();
    await Promise.race([
      started,
      refresh.then(() => {
        throw new Error(
          `Не началась запись разрешения: ${commands.join(', ')}`
        );
      })
    ]);
    permission.state = 'denied';
    permission.onchange?.();
    release();
    await refresh;
    await prefs.flushDesktopPermissionPreferences();
    return {
      context: geo.getTelemetryLocationContext(),
      choice: prefs.getDesktopPermissionChoice('geolocation'),
      saved
    };
  });
  expect(result.context.device).toEqual({ status: 'denied' });
  expect(result.choice).toBe('denied');
  expect(result.saved).toBe('denied');
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
  expect(result.calls).toEqual(['checkPermissions', 'getCurrentPosition']);
  expect(result.highAccuracy).toBe(false);
  expect(result.context.device).toMatchObject({
    latitude: 40,
    longitude: 44,
    accuracyMeters: 1000
  });
});

for (const permission of ['granted', 'denied'] as const) {
  test(`Android запрашивает геолокацию через плагин один раз: ${permission}`, async ({
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
          if (method === 'requestPermissions') {
            started();
            await new Promise<void>(resolve => {
              finishPermissions = resolve;
            });
            return { location: permission, coarseLocation: permission };
          }
          if (method === 'checkPermissions')
            return { location: 'prompt', coarseLocation: 'prompt' };
          if (method === 'getCurrentPosition')
            return {
              timestamp: Date.now(),
              coords: { latitude: 40, longitude: 44, accuracy: 20 }
            };
          throw new Error('Неожиданный запрос разрешений');
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
    expect(result.beforePermission).toEqual([
      'checkPermissions',
      'requestPermissions'
    ]);
    expect(result.calls).toEqual([
      'checkPermissions',
      'requestPermissions',
      ...(permission === 'granted' ? ['getCurrentPosition'] : [])
    ]);
    expect(result.context.device.status).toBe(
      permission === 'granted' ? 'resolved' : 'denied'
    );
  });
}
