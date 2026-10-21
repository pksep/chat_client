import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getAuthToken } from '../composables/useLogin';
import { getConfig } from './useConfig';
import { withNetworkTimeout } from '../utils/network-timeout';
import {
  getTelemetryDeviceContext,
  getTelemetryInstallationId,
  hydrateTelemetryDeviceContext
} from './useTelemetryDevice';
import { getIsVpnActive } from './useVpnStatus';
import {
  getTelemetryLocationContext,
  onTelemetryLocationUnavailable,
  refreshTelemetryLocation
} from './useTelemetryLocation';

export type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error';
export type TelemetryCategory =
  | 'app'
  | 'call'
  | 'upload'
  | 'network'
  | 'chat'
  | 'notification'
  | 'lifecycle';

type TelemetryEventInput = {
  name: string;
  category: TelemetryCategory;
  level?: TelemetryLevel;
  traceId?: string | null;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

type TelemetryEvent = {
  id: string;
  name: string;
  category: TelemetryCategory;
  level: TelemetryLevel;
  traceId?: string | null;
  sessionId: string;
  entityType?: string;
  entityId?: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
  context: Record<string, unknown>;
};

const TELEMETRY_BATCH_SIZE = 20;
const TELEMETRY_MAX_QUEUE_SIZE = 300;
const PERSISTED_NETWORK_TELEMETRY_KEY = 'chat.telemetry.network.pending.v1';
const PERSISTED_NETWORK_TELEMETRY_MAX_SIZE = 180;
const TELEMETRY_FLUSH_DELAY_MS = 2000;
const TELEMETRY_RETRY_DELAY_MS = 10000;
const MAX_STRING_LENGTH = 700;
const MAX_ARRAY_LENGTH = 30;
const MAX_DEPTH = 5;

const shouldPersistTelemetry = (
  event: Pick<TelemetryEvent, 'category' | 'name'> &
    Partial<Pick<TelemetryEvent, 'level'>>
): boolean =>
  event.category === 'network' ||
  (event.category === 'app' && event.name.startsWith('app.update.')) ||
  (event.category === 'chat' &&
    (event.name.startsWith('chat.message_delete.') ||
      event.level === 'warn' ||
      event.level === 'error'));

const getPersistedNetworkTelemetry = (): TelemetryEvent[] => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  try {
    const parsed = JSON.parse(
      localStorage.getItem(PERSISTED_NETWORK_TELEMETRY_KEY) || '[]'
    );

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (event): event is TelemetryEvent =>
          !!event &&
          typeof event === 'object' &&
          typeof event.id === 'string' &&
          typeof event.name === 'string' &&
          typeof event.occurredAt === 'string' &&
          shouldPersistTelemetry(event)
      )
      .slice(-PERSISTED_NETWORK_TELEMETRY_MAX_SIZE);
  } catch {
    // Повреждённые данные диагностики не должны мешать запуску чата.
    return [];
  }
};

const persistNetworkTelemetry = (events: TelemetryEvent[]): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    const networkEvents = events
      .filter(shouldPersistTelemetry)
      .slice(-PERSISTED_NETWORK_TELEMETRY_MAX_SIZE)
      .map(event => {
        const context = { ...event.context };
        // Координаты остаются только в памяти текущего запуска.
        delete context.location;
        return { ...event, context };
      });

    if (networkEvents.length === 0) {
      localStorage.removeItem(PERSISTED_NETWORK_TELEMETRY_KEY);
      return;
    }

    localStorage.setItem(
      PERSISTED_NETWORK_TELEMETRY_KEY,
      JSON.stringify(networkEvents)
    );
  } catch {
    // Хранилище может быть заполнено или недоступно в WebView;
    // очередь в памяти продолжает работать до завершения приложения.
  }
};

let telemetryQueue: TelemetryEvent[] = getPersistedNetworkTelemetry();
let telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isTelemetryFlushInFlight = false;

const getTelemetryAuthToken = (): string => {
  return getAuthToken() || getStoredChatAccessToken() || '';
};

const createUuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const getTelemetrySessionId = (): string => {
  if (typeof sessionStorage === 'undefined') {
    return `session-${createUuid()}`;
  }

  const key = 'chat.telemetry.sessionId';
  const existing = sessionStorage.getItem(key);

  if (existing) {
    return existing;
  }

  const nextSessionId = `session-${createUuid()}`;
  sessionStorage.setItem(key, nextSessionId);
  return nextSessionId;
};

const sanitizeTelemetryValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}...`
      : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return Number.isNaN(value) ? null : value;
  }

  if (depth >= MAX_DEPTH) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map(item => sanitizeTelemetryValue(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).reduce(
      (acc, [key, item]) => {
        acc[key] = sanitizeTelemetryValue(item, depth + 1);
        return acc;
      },
      {} as Record<string, unknown>
    );
  }

  return String(value);
};

const buildDefaultTelemetryContext = (): Record<string, unknown> => {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const device = getTelemetryDeviceContext();
  const connection = (
    nav as
      | (Navigator & {
          connection?: {
            effectiveType?: string;
            downlink?: number;
            rtt?: number;
            saveData?: boolean;
            type?: string;
          };
        })
      | undefined
  )?.connection;

  return sanitizeTelemetryValue({
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    installationId: getTelemetryInstallationId(),
    device,
    location: getTelemetryLocationContext(),
    visibility:
      typeof document !== 'undefined' ? document.visibilityState : undefined,
    network: {
      online: nav?.onLine,
      effectiveType: connection?.effectiveType,
      type: connection?.type,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
      vpnActive: getIsVpnActive()
    },
    userAgent: nav?.userAgent
  }) as Record<string, unknown>;
};

const scheduleTelemetryFlush = (delayMs = TELEMETRY_FLUSH_DELAY_MS): void => {
  if (telemetryFlushTimer || typeof window === 'undefined') {
    return;
  }

  telemetryFlushTimer = setTimeout(() => {
    telemetryFlushTimer = null;
    void flushTelemetryEvents();
  }, delayMs);
};

export const flushTelemetryEvents = async (): Promise<void> => {
  if (isTelemetryFlushInFlight || telemetryQueue.length === 0) {
    return;
  }

  const token = getTelemetryAuthToken();

  if (!token) {
    return;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    scheduleTelemetryFlush(TELEMETRY_RETRY_DELAY_MS);
    return;
  }

  const batch = telemetryQueue.slice(0, TELEMETRY_BATCH_SIZE);
  isTelemetryFlushInFlight = true;

  try {
    const config = getConfig();

    if (!config.CHAT_API_DOMAIN) {
      scheduleTelemetryFlush(TELEMETRY_RETRY_DELAY_MS);
      return;
    }

    const response = await withNetworkTimeout(
      signal =>
        fetch(`${config.CHAT_API_DOMAIN}/telemetry/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ events: batch }),
          signal
        }),
      TELEMETRY_RETRY_DELAY_MS
    );

    if (response.status === 401 || response.status === 403) {
      // При недействительной сессии не переносим её диагностику в новую.
      telemetryQueue = telemetryQueue.slice(batch.length);
      persistNetworkTelemetry(telemetryQueue);
      return;
    }

    if (!response.ok) {
      throw new Error(`Telemetry request failed: ${response.status}`);
    }

    telemetryQueue = telemetryQueue.slice(batch.length);
    persistNetworkTelemetry(telemetryQueue);
  } catch (error) {
    scheduleTelemetryFlush(TELEMETRY_RETRY_DELAY_MS);
  } finally {
    isTelemetryFlushInFlight = false;
  }

  if (telemetryQueue.length > 0) {
    scheduleTelemetryFlush();
  }
};

export const recordTelemetryEvent = (input: TelemetryEventInput): void => {
  const event: TelemetryEvent = {
    id: createUuid(),
    name: input.name,
    category: input.category,
    level: input.level || 'info',
    traceId: input.traceId || undefined,
    sessionId: getTelemetrySessionId(),
    entityType: input.entityType,
    entityId: input.entityId || undefined,
    occurredAt: new Date().toISOString(),
    payload: sanitizeTelemetryValue(input.payload || {}) as Record<
      string,
      unknown
    >,
    context: {
      ...buildDefaultTelemetryContext(),
      ...((sanitizeTelemetryValue(input.context || {}) as Record<
        string,
        unknown
      >) || {})
    }
  };

  const evictedEvent =
    telemetryQueue.length >= TELEMETRY_MAX_QUEUE_SIZE
      ? telemetryQueue[0]
      : undefined;
  telemetryQueue = [...telemetryQueue, event].slice(-TELEMETRY_MAX_QUEUE_SIZE);

  // Сохраняем диагностику сети, обновлений и сбоев чата до перезапуска APK.
  if (
    shouldPersistTelemetry(event) ||
    (evictedEvent && shouldPersistTelemetry(evictedEvent))
  ) {
    persistNetworkTelemetry(telemetryQueue);
  }
  scheduleTelemetryFlush(
    input.level === 'error' ? 0 : TELEMETRY_FLUSH_DELAY_MS
  );

  if (
    input.name === 'chat.message_send.start' ||
    input.name === 'upload.message_send.start'
  ) {
    // Получение координат не задерживает отправку сообщения.
    void refreshTelemetryLocation().then(() => {
      recordTelemetryEvent({
        category: input.category,
        name: 'chat.message_send.location',
        traceId: input.traceId,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: {
          topicId: input.payload?.topicId,
          sendOccurredAt: event.occurredAt
        }
      });
    });
  }
};

onTelemetryLocationUnavailable(() => {
  telemetryQueue.forEach(event => {
    if (event.context) delete event.context.location;
  });
  persistNetworkTelemetry(telemetryQueue);
});

export const createTelemetryTraceId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${createUuid().slice(0, 8)}`;

export const getTelemetryErrorPayload = (
  error: unknown
): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: (error as Error & { code?: string | number }).code
    };
  }

  if (error && typeof error === 'object') {
    const nativeError = error as Record<string, unknown>;
    return {
      errorName: nativeError.name,
      errorMessage:
        typeof nativeError.message === 'string'
          ? nativeError.message
          : String(error),
      errorCode: nativeError.code
    };
  }

  return {
    errorMessage: String(error)
  };
};

export const getFileTelemetryPayload = (
  file: File
): Record<string, unknown> => {
  const extension = file.name.includes('.')
    ? file.name.split('.').pop()?.toLowerCase()
    : undefined;

  return {
    fileSize: file.size,
    fileType: file.type || 'unknown',
    fileExtension: extension,
    isVideo: file.type.startsWith('video/'),
    isImage: file.type.startsWith('image/')
  };
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void hydrateTelemetryDeviceContext();
    recordTelemetryEvent({
      category: 'network',
      name: 'network.online',
      entityType: 'network'
    });
    void flushTelemetryEvents();
  });

  window.addEventListener('offline', () => {
    recordTelemetryEvent({
      category: 'network',
      name: 'network.offline',
      level: 'warn',
      entityType: 'network'
    });
  });

  window.addEventListener('beforeunload', () => {
    void flushTelemetryEvents();
  });

  window.addEventListener('error', event => {
    recordTelemetryEvent({
      category: 'app',
      name: 'app.error',
      level: 'error',
      entityType: 'runtime',
      payload: {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        ...getTelemetryErrorPayload(event.error)
      }
    });
  });

  window.addEventListener('unhandledrejection', event => {
    recordTelemetryEvent({
      category: 'app',
      name: 'app.unhandled_rejection',
      level: 'error',
      entityType: 'runtime',
      payload: getTelemetryErrorPayload(event.reason)
    });
  });
}

void hydrateTelemetryDeviceContext().then(() => {
  recordTelemetryEvent({
    category: 'lifecycle',
    name: 'telemetry.device.ready',
    entityType: 'device',
    payload: {
      platform: Capacitor.getPlatform(),
      isNative: Capacitor.isNativePlatform()
    }
  });
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    recordTelemetryEvent({
      category: 'lifecycle',
      name: 'app.visibility.changed',
      entityType: 'app',
      payload: {
        visibility: document.visibilityState
      }
    });

    if (document.visibilityState === 'hidden') {
      void flushTelemetryEvents();
    }
  });
}

if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appStateChange', state => {
    if (state.isActive) {
      void hydrateTelemetryDeviceContext();
    }

    recordTelemetryEvent({
      category: 'lifecycle',
      name: 'app.state.changed',
      level: state.isActive ? 'info' : 'warn',
      entityType: 'app',
      payload: {
        isActive: state.isActive
      }
    });

    if (!state.isActive) {
      void flushTelemetryEvents();
    }
  });
}
