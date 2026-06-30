import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useChatApi } from './useApi';
import {
  getTelemetryDeviceContext,
  getTelemetryInstallationId,
  hydrateTelemetryDeviceContext
} from './useTelemetryDevice';
import { getIsVpnActive } from './useVpnStatus';

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
const TELEMETRY_FLUSH_DELAY_MS = 2000;
const TELEMETRY_RETRY_DELAY_MS = 10000;
const MAX_STRING_LENGTH = 700;
const MAX_ARRAY_LENGTH = 30;
const MAX_DEPTH = 5;

let telemetryQueue: TelemetryEvent[] = [];
let telemetryFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isTelemetryFlushInFlight = false;

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

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    scheduleTelemetryFlush(TELEMETRY_RETRY_DELAY_MS);
    return;
  }

  const batch = telemetryQueue.slice(0, TELEMETRY_BATCH_SIZE);
  telemetryQueue = telemetryQueue.slice(batch.length);
  isTelemetryFlushInFlight = true;

  try {
    await useChatApi().post('/telemetry/events', {
      events: batch
    });
  } catch (error) {
    telemetryQueue = [...batch, ...telemetryQueue].slice(
      -TELEMETRY_MAX_QUEUE_SIZE
    );
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

  telemetryQueue = [...telemetryQueue, event].slice(-TELEMETRY_MAX_QUEUE_SIZE);
  scheduleTelemetryFlush(input.level === 'error' ? 0 : TELEMETRY_FLUSH_DELAY_MS);
};

export const createTelemetryTraceId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${createUuid().slice(0, 8)}`;

export const getTelemetryErrorPayload = (
  error: unknown
): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack
    };
  }

  return {
    errorMessage: String(error)
  };
};

export const getFileTelemetryPayload = (file: File): Record<string, unknown> => {
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
