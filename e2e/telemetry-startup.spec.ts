import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
});

test('первое открытие запрашивает геолокацию до входа и отправки сообщений', async ({
  page
}) => {
  await page.addInitScript(() => {
    const permission = { state: 'prompt', onchange: null };
    (window as any).locationStartup = { requests: 0, screenReady: false };
    Object.defineProperty(navigator.permissions, 'query', {
      value: async () => permission
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (resolve: PositionCallback) => {
        const startup = (window as any).locationStartup;
        startup.requests += 1;
        startup.screenReady =
          !document.getElementById('startup-shell') &&
          !!document.querySelector('#app')?.childElementCount;
        permission.state = 'granted';
        resolve({
          timestamp: Date.now(),
          coords: { latitude: 40.18, longitude: 44.51, accuracy: 25 }
        } as GeolocationPosition);
      }
    });
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => (window as any).locationStartup))
    .toEqual({ requests: 1, screenReady: true });
});

test('сохранённое разрешение используется после повторного открытия страницы', async ({
  page,
  context,
  baseURL
}) => {
  await context.grantPermissions(['geolocation'], { origin: baseURL! });
  await context.setGeolocation({ latitude: 40.18, longitude: 44.51 });
  await page.addInitScript(() => {
    const query = navigator.permissions.query.bind(navigator.permissions);
    const getPosition = navigator.geolocation.getCurrentPosition.bind(
      navigator.geolocation
    );
    const startup = {
      permissions: [] as PermissionState[],
      coordinates: null as null | { latitude: number; longitude: number }
    };
    (window as any).locationStartup = startup;
    Object.defineProperty(navigator.permissions, 'query', {
      value: async (descriptor: PermissionDescriptor) => {
        const permission = await query(descriptor);
        if (descriptor.name === 'geolocation') {
          startup.permissions.push(permission.state);
        }
        return permission;
      }
    });
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (
        resolve: PositionCallback,
        reject?: PositionErrorCallback,
        options?: PositionOptions
      ) =>
        getPosition(
          position => {
            startup.coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            resolve(position);
          },
          reject,
          options
        )
    });
  });
  const expectSavedPermission = () =>
    expect
      .poll(() => page.evaluate(() => (window as any).locationStartup))
      .toEqual({
        permissions: ['granted'],
        coordinates: { latitude: 40.18, longitude: 44.51 }
      });
  await page.goto('/');
  await expectSavedPermission();
  await page.reload();
  await expectSavedPermission();
});
