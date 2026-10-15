import { Capacitor } from '@capacitor/core';
import {
  Geolocation,
  type PermissionStatus as NativePermissionStatus
} from '@capacitor/geolocation';

const MAX_AGE_MS = 60_000;
let deviceLocation: Record<string, unknown> | null = null;
let sampledAt = 0;
let lastAttemptAt = 0;
let status = 'not_sampled';
let generation = 0;
let permissionRequested = false;
let browserPermission: PermissionStatus | null = null;
let inFlight: Promise<void> | null = null;
const unavailableListeners = new Set<() => void>();

export const onTelemetryLocationUnavailable = (listener: () => void): void => {
  unavailableListeners.add(listener);
};

const clearLocation = (nextStatus: string): void => {
  generation += 1;
  deviceLocation = null;
  sampledAt = 0;
  status = nextStatus;
  unavailableListeners.forEach(listener => listener());
};

export const getTelemetryLocationContext = (): Record<string, unknown> => ({
  device:
    deviceLocation && Date.now() - sampledAt <= MAX_AGE_MS
      ? deviceLocation
      : { status: status === 'resolved' ? 'not_sampled' : status }
});

const isGranted = (permission: Partial<NativePermissionStatus>): boolean =>
  permission.location === 'granted' || permission.coarseLocation === 'granted';

const getBrowserPermission = async (): Promise<PermissionState | undefined> => {
  if (!navigator.permissions?.query) return;
  try {
    const permission = await navigator.permissions.query({
      name: 'geolocation'
    });
    if (browserPermission !== permission) {
      if (browserPermission) browserPermission.onchange = null;
      browserPermission = permission;
      permission.onchange = () => {
        if (permission.state !== 'granted') {
          clearLocation(
            permission.state === 'denied' ? 'denied' : 'permission_required'
          );
        }
      };
    }
    return permission.state;
  } catch {
    return;
  }
};

export const refreshTelemetryLocation = (
  requestPermission = false
): Promise<void> => {
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'hidden'
  ) {
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      let permission: Partial<NativePermissionStatus>;
      if (Capacitor.isNativePlatform()) {
        permission = await Geolocation.checkPermissions();
        if (
          !isGranted(permission) &&
          permission.location !== 'denied' &&
          requestPermission &&
          !permissionRequested
        ) {
          permissionRequested = true;
          permission = await Geolocation.requestPermissions({
            permissions: ['location']
          });
        }
      } else {
        const state = await getBrowserPermission();
        permission = { location: state };
        if (!state && deviceLocation) permission.location = 'granted';
        if (
          state !== 'denied' &&
          !isGranted(permission) &&
          requestPermission &&
          !permissionRequested
        ) {
          // В браузере системный запрос открывает сам getCurrentPosition.
          permissionRequested = true;
          permission.location = 'granted';
        }
      }
      if (!isGranted(permission)) {
        clearLocation(
          permission.location === 'denied' ? 'denied' : 'permission_required'
        );
        return;
      }
      // Разрешение проверяется до кэша, чтобы отзыв убирал сохранённую позицию.
      if (Date.now() - lastAttemptAt < MAX_AGE_MS) return;
      lastAttemptAt = Date.now();
      const currentGeneration = generation;
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: MAX_AGE_MS
      });
      if (currentGeneration !== generation) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (
        !Number.isFinite(latitude) ||
        Math.abs(latitude) > 90 ||
        !Number.isFinite(longitude) ||
        Math.abs(longitude) > 180 ||
        !Number.isFinite(accuracy) ||
        accuracy < 0 ||
        !Number.isFinite(position.timestamp) ||
        Date.now() - position.timestamp > MAX_AGE_MS
      ) {
        throw new Error('Не удалось получить актуальную геолокацию.');
      }
      sampledAt = position.timestamp;
      status = 'resolved';
      deviceLocation = {
        source: 'device',
        status,
        latitude,
        longitude,
        accuracyMeters: accuracy,
        observedAt: new Date(position.timestamp).toISOString()
      };
    } catch {
      clearLocation('unavailable');
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
};
