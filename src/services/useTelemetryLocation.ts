import { Capacitor } from '@capacitor/core';
import { Geolocation, type PermissionStatus } from '@capacitor/geolocation';
import { readonly, ref } from 'vue';

const STORAGE_KEY = 'chat.telemetry.location.enabled.v1';
const MAX_AGE_MS = 60_000;
const readEnabled = (): boolean => {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(STORAGE_KEY) === 'true'
    );
  } catch {
    return false;
  }
};

const enabled = ref(readEnabled());
const pending = ref(false);
const errorMessage = ref('');
let generation = 0;
let deviceLocation: Record<string, unknown> | null = null;
let status = 'not_sampled';
let sampledAt = 0;
let inFlight: Promise<void> | null = null;
const disableListeners = new Set<() => void>();

export const onTelemetryLocationDisabled = (listener: () => void): void => {
  disableListeners.add(listener);
};

export const getTelemetryLocationContext = (): Record<string, unknown> => ({
  enabled: enabled.value,
  device:
    enabled.value && Date.now() - sampledAt <= MAX_AGE_MS
      ? deviceLocation || { status }
      : { status: enabled.value ? 'not_sampled' : 'disabled' }
});

export const refreshTelemetryLocation = (
  requestPermission = false
): Promise<void> => {
  if (
    !enabled.value ||
    (typeof document !== 'undefined' && document.visibilityState === 'hidden')
  ) {
    return Promise.resolve();
  }
  if (inFlight) return inFlight;
  if (!requestPermission && Date.now() - sampledAt < MAX_AGE_MS)
    return Promise.resolve();
  const currentGeneration = generation;
  inFlight = (async () => {
    try {
      let permission: Partial<PermissionStatus> | undefined;
      if (Capacitor.isNativePlatform()) {
        permission = await Geolocation.checkPermissions();
        if (requestPermission && permission.location !== 'granted') {
          permission = await Geolocation.requestPermissions({
            permissions: ['location']
          });
        }
      } else if (!requestPermission) {
        // Без явного действия пользователя не открываем системный запрос.
        const state = await navigator.permissions?.query({
          name: 'geolocation'
        });
        permission = { location: state?.state };
      }
      if (
        permission &&
        permission.location !== 'granted' &&
        permission.coarseLocation !== 'granted'
      ) {
        throw new Error(
          'Разрешение на геолокацию не предоставлено. Проверьте настройки устройства.'
        );
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: MAX_AGE_MS
      });
      if (!enabled.value || currentGeneration !== generation) return;
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
      errorMessage.value = '';
    } catch (error) {
      if (currentGeneration !== generation) return;
      deviceLocation = null;
      sampledAt = Date.now();
      status = 'unavailable';
      errorMessage.value =
        error instanceof Error ? error.message : 'Геолокация недоступна.';
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
};

const setEnabled = async (value: boolean): Promise<void> => {
  generation += 1;
  enabled.value = value;
  deviceLocation = null;
  sampledAt = 0;
  errorMessage.value = '';
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    /* WebView может запретить хранилище. */
  }
  if (!value) {
    disableListeners.forEach(listener => listener());
    return;
  }
  pending.value = true;
  try {
    await inFlight;
    await refreshTelemetryLocation(true);
  } finally {
    pending.value = false;
  }
};

export const useTelemetryLocation = () => ({
  enabled: readonly(enabled),
  pending: readonly(pending),
  errorMessage: readonly(errorMessage),
  setEnabled
});
